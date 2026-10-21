/**
 * Lager src/styles/tokens.css fra src/styles/figma-tokens.json
 * (fargevariablene eksportert fra Figma-fila «Medlemsregister»).
 *
 *   Primitives/color/grey/paper         → --p-color-grey-paper
 *   Token Colors/surface/surface-primary → --t-surface-surface-primary: var(--p-ultimate-colors-white-white)
 *
 * Tokens som er alias i Figma peker på primitive-variabelen, slik at strukturen fra Figma bevares.
 */
import fs from 'node:fs/promises';

const SRC = 'src/styles/figma-tokens.json';
const OUT = 'src/styles/tokens.css';

export function cssVar(figmaName) {
  const [collection, ...rest] = figmaName.split('/');
  const prefix = collection === 'Primitives' ? 'p' : collection === 'Token Colors' ? 't' : collection.toLowerCase().replace(/\s+/g, '-');
  const slug = rest.join('-').toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  `/* GENERERT – ikke rediger. Kilde: ${source}, eksportert ${exported}.\n   Oppdater figma-tokens.json og kjør «npm run tokens». */\n:root {\n${lines.join('\n')}\n}\n`
);
console.log(`tokens.css: ${lines.length} fargevariabler`);
