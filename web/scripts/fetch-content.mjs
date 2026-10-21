/**
 * Henter sider, innlegg og bilder fra WordPress (REST API) og lagrer dem som
 * src/data/content.json + public/media/. Kjøres før hver `astro build`.
 *
 * WordPress brukes bare som redigeringsverktøy. HTML-en fra Avada-temaet vaskes
 * ned til ren, semantisk HTML slik at den nye designen styrer utseendet.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';

const WP_URL = (process.env.WP_URL || 'https://namdalssl.no').replace(/\/$/, '');
const API = `${WP_URL}/wp-json/wp/v2`;
const OUT_FILE = 'src/data/content.json';
const MEDIA_DIR = 'public/media';
const BASE = '{{BASE}}'; // erstattes med Astros base-sti ved rendering

// Sider som ikke skal genereres fra WordPress (har egne maler eller er utdaterte).
const SKIP_PAGES = new Set(['test-frontpage', 'home', 'oppmoteregistrering']);
// Gamle WordPress-adresser som skal peke et annet sted på den nye siden.
const LINK_REWRITES = [
  [/^\/category\/[^/]+\/?/, '/nyheter/'],
  [/^\/page\/\d+\/?/, '/nyheter/'],
  [/^\/author\/[^/]+\/?/, '/'],
];

const mediaQueue = new Map(); // remote URL -> local path

async function getJson(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'namdalssl-web-build' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return { data: await res.json(), headers: res.headers };
    } catch (err) {
      if (attempt === 3) throw new Error(`Klarte ikke å hente ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function getAll(type, query = '') {
  const items = [];
  for (let page = 1; ; page++) {
    const { data, headers } = await getJson(`${API}/${type}?per_page=100&page=${page}${query}`);
    items.push(...data);
    const total = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= total) break;
  }
  return items;
}

/** Velg en passende bildestørrelse (~1200 px) fra srcset, ellers originalen. */
function pickImage(attribs) {
  const srcset = [attribs['data-srcset'], attribs.srcset].find((s) => s && !s.startsWith('data:'));
  const fallback = [attribs['data-orig-src'], attribs['data-src'], attribs.src].find((s) => s && !s.startsWith('data:'));
  if (!srcset) return fallback;
  const candidates = srcset.split(',').map((c) => {
    const [url, w] = c.trim().split(/\s+/);
    return { url, w: parseInt(w, 10) || 0 };
  }).filter((c) => c.url).sort((a, b) => a.w - b.w);
  return (candidates.find((c) => c.w >= 1200) || candidates[candidates.length - 1] || {}).url || fallback;
}

/** Registrer et bilde for nedlasting og returner lokal URL. */
function localMedia(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url, WP_URL); } catch { return null; }
  if (!u.pathname.includes('/wp-content/uploads/')) return url;
  const rel = u.pathname.split('/wp-content/uploads/')[1];
  mediaQueue.set(u.href, rel);
  return `${BASE}/media/${rel}`;
}

/** Gjør interne WordPress-lenker relative til den nye siden. */
function rewriteLink(href) {
  if (!href) return href;
  let u;
  try { u = new URL(href, WP_URL); } catch { return href; }
  if (u.origin !== new URL(WP_URL).origin) return href;
  if (u.pathname.includes('/wp-content/uploads/')) return localMedia(u.href);
  let p = u.pathname;
  for (const [re, to] of LINK_REWRITES) if (re.test(p)) { p = to; break; }
  return `${BASE}${p}${u.hash}`;
}

function clean(html) {
  if (!html) return '';
  let out = sanitizeHtml(html, {
    allowedTags: ['h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'b', 'em', 'i', 'br',
      'img', 'figure', 'figcaption', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'iframe'],
    allowedAttributes: {
      a: ['href', 'class', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      iframe: ['src', 'width', 'height', 'title', 'allowfullscreen', 'loading'],
      th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
    },
    allowedClasses: { a: ['button'] },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.google.com', 'maps.google.com'],
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'form', 'select', 'button', 'svg'],
    transformTags: {
      h1: 'h2',
      img: (tag, attribs) => ({
        tagName: 'img',
        attribs: {
          src: localMedia(pickImage(attribs)) || '',
          alt: attribs.alt || '',
          loading: 'lazy',
        },
      }),
      a: (tag, attribs) => {
        const external = /^https?:/.test(attribs.href || '') && !(attribs.href || '').startsWith(WP_URL);
        return {
          tagName: 'a',
          attribs: {
            href: rewriteLink(attribs.href),
            ...((attribs.class || '').includes('fusion-button') ? { class: 'button' } : {}),
            ...(external ? { target: '_blank', rel: 'noopener' } : {}),
          },
        };
      },
    },
    textFilter: (text) => text.replace(/Loading\.\.\./g, ''),
    exclusiveFilter: (frame) =>
      (['a', 'p', 'li', 'i', 'em', 'strong', 'b', 'figure'].includes(frame.tag) || /^h\d$/.test(frame.tag)) &&
      !frame.text.trim() && !frame.mediaChildren.length,
  });
  out = out
    .replace(/<img src=""[^>]*>/g, '')
    .replace(/(<br\s*\/?>\s*){2,}/g, '<br />')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

function text(html) {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ').replace(/\[…\]|\[&hellip;\]/g, '…').trim();
}

function decode(s) {
  return text(s).replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’');
}

function featured(item) {
  const m = item._embedded?.['wp:featuredmedia']?.[0];
  if (!m || !m.source_url) return null;
  const sizes = m.media_details?.sizes || {};
  const pick = sizes.large || sizes.medium_large || sizes.full || { source_url: m.source_url };
  return { src: localMedia(pick.source_url), alt: m.alt_text || '', width: pick.width, height: pick.height };
}

async function downloadMedia() {
  const entries = [...mediaQueue.entries()];
  let done = 0, skipped = 0, failed = 0;
  const worker = async () => {
    while (entries.length) {
      const [url, rel] = entries.shift();
      const file = path.join(MEDIA_DIR, rel);
      try {
        await fs.access(file);
        skipped++;
        continue;
      } catch { /* finnes ikke, last ned */ }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        done++;
      } catch (err) {
        failed++;
        console.warn(`  ! bilde feilet: ${url} (${err.message})`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { done, skipped, failed };
}

async function main() {
  console.log(`Henter innhold fra ${WP_URL} …`);
  const [pages, posts, categories] = await Promise.all([
    getAll('pages', '&status=publish&_embed=wp:featuredmedia'),
    getAll('posts', '&status=publish&_embed=wp:featuredmedia'),
    getAll('categories'),
  ]);
  const catName = new Map(categories.map((c) => [c.id, decode(c.name)]));

  const content = {
    generatedAt: new Date().toISOString(),
    source: WP_URL,
    pages: pages
      .filter((p) => !SKIP_PAGES.has(p.slug))
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        parent: p.parent,
        title: decode(p.title.rendered),
        modified: p.modified,
        image: featured(p),
        html: clean(p.content.rendered),
        // Skjema (Avada Forms) kan ikke kjøre på en statisk side – malen viser et alternativ.
        hadForm: /<form[\s>]/i.test(p.content.rendered),
      })),
    posts: posts
      .map((p) => {
        const d = p.date.slice(0, 10).split('-');
        return {
          id: p.id,
          slug: p.slug,
          path: `/${d[0]}/${d[1]}/${d[2]}/${p.slug}/`,
          date: p.date,
          title: decode(p.title.rendered),
          excerpt: text(p.excerpt.rendered).slice(0, 220),
          categories: (p.categories || []).map((id) => catName.get(id)).filter((n) => n && !/^(uncategorized|ukategorisert)$/i.test(n)),
          image: featured(p),
          html: clean(p.content.rendered),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
  };

  const media = await downloadMedia();
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(content, null, 2));
  console.log(`  ${content.pages.length} sider, ${content.posts.length} innlegg, bilder: ${media.done} nye, ${media.skipped} fra før, ${media.failed} feilet`);
}

main().catch(async (err) => {
  console.error(err.message);
  // Hvis WordPress er nede, bygg med forrige innhold dersom det finnes.
  try {
    await fs.access(OUT_FILE);
    console.warn('Bruker innhold fra forrige henting.');
  } catch {
    process.exit(1);
  }
});
