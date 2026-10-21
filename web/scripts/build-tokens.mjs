/**
 * Lager src/styles/tokens.css fra src/styles/namsos-tokens.json
 * (fargene i Namsos kommunes grafiske profil).
 *
 *   Namsos/primær/namsosgronn → --n-primaer-namsosgronn
 *
 * Fila støtter også alias ("alias": "Namsos/…"), som blir var(--…).
 */
import fs from 'node:fs/promises';

const SRC = process.env.TOKENS || 'src/styles/namsos-tokens.json';
const OUT = 'src/styles/tokens.css';

export function cssVar(figmaName) {
  const [collection, ...rest] = figmaName.split('/');
  const prefix = { Namsos: 'n', Primitives: 'p', 'Token Colors': 't' }[collection] || collection.toLowerCase().replace(/\s+/g, '-');
  const slug = rest.join('-').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `--${prefix}-${slug}`;
}

const { source, exported, colors } = JSON.parse(await fs.readFile(SRC, 'utf8'));
const lines = Object.entries(colors)
  .sort(([a], [b]) => (a.startsWith('Primitives') === b.startsWith('Primitives') ? 0 : a.startsWith('Primitives') ? -1 : 1))
  .map(([name, { value, alias }]) => {
    const v = alias && colors[alias] ? `var(${cssVar(alias)})` : value;
    return `  ${cssVar(name)}: ${v}; /* ${name} */`;
  });

await fs.writeFile(
  OUT,
  `/* GENERERT – ikke rediger. Kilde: ${source}, eksportert ${exported}.\n   Oppdater namsos-tokens.json og kjør «npm run tokens». */\n:root {\n${lines.join('\n')}\n}\n`
);
console.log(`tokens.css: ${lines.length} fargevariabler`);
