/**
 * Stopper byggingen hvis noen farge er hardkodet utenfor tokens.css.
 * Alle farger skal komme fra Figma-variablene (var(--p-…) / var(--t-…)).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'src';
const ALLOWED = new Set([path.join('src', 'styles', 'tokens.css')]);
const NAMED = 'white|black|red|green|blue|yellow|orange|gray|grey|silver|navy|maroon|purple|teal|olive|lime|aqua|fuchsia|beige|brown|pink|gold|ivory|tan';
const rules = [
  [/#[0-9a-fA-F]{3,8}\b/g, 'hex-farge'],
  [/\b(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab)\(/g, 'fargefunksjon'],
  [new RegExp(`(?:color|background|fill|stroke|border[a-z-]*|outline|box-shadow|text-shadow)\\s*[:=]\\s*["']?(?:${NAMED})\\b`, 'gi'), 'navngitt farge'],
];

async function* files(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'data') yield* files(p); }
    else if (/\.(astro|css|js|mjs|ts)$/.test(e.name)) yield p;
  }
}

const problems = [];
for await (const file of files(ROOT)) {
  if (ALLOWED.has(file)) continue;
  const text = (await fs.readFile(file, 'utf8'))
    .replace(/url\((?:[^()]|\([^)]*\))*\)/g, 'url()') // masker/SVG-data i url() er form, ikke farge
    .replace(/&#\d+;|&#x[0-9a-f]+;/gi, '');           // HTML-entiteter
  text.split('\n').forEach((line, i) => {
    for (const [re, label] of rules) {
      for (const m of line.matchAll(re)) problems.push(`${file}:${i + 1}  ${label}: ${m[0]}`);
    }
  });
}

if (problems.length) {
  console.error(`Fant ${problems.length} farge(r) som ikke kommer fra Figma-tokens:\n` + problems.join('\n'));
  process.exit(1);
}
console.log('Fargesjekk OK – alle farger kommer fra Figma-tokens.');
