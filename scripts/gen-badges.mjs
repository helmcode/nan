/**
 * Genera los badges "Built with NaN" que la comunidad pega en sus READMEs.
 *
 *   node scripts/gen-badges.mjs
 *
 * Salida: public/badge/built-with-nan-{dark,light,compact}.svg, servidos en
 * https://nan.builders/badge/… (ver /docs/built-with-nan).
 *
 * Los SVG son autocontenidos: GitHub los muestra dentro de un <img>, donde no
 * se cargan fuentes externas, así que "BUILT WITH" va convertido a trazos con
 * fontkitten (JetBrains Mono de @fontsource) y "NaN" es el primer trazo del
 * wordmark vectorial de public/brand. El resto del wordmark es ".builders".
 *
 * Las URLs publicadas son contrato: hay READMEs ajenos apuntando a ellas y
 * buscarlas en GitHub es como encontramos los proyectos. Se puede cambiar el
 * diseño, no el nombre de los ficheros.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkitten';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// tokens (src/styles/nan-system.css)
const BG = '#0B0B0C';
const SNOW = '#EFEEEB';
const SNOW_INK = '#101010';
const VIOLET = '#7D39EB';
const VIOLET_2 = '#9B6BF0';

// isotipo (public/brand/nan-isotipo-color.svg, viewBox 100x100)
const HEX = 'M54.33 11.5 L81.17 27 Q85.5 29.5 85.5 34.5 L85.5 65.5 Q85.5 70.5 81.17 73 L54.33 88.5 Q50 91 45.67 88.5 L18.83 73 Q14.5 70.5 14.5 65.5 L14.5 34.5 Q14.5 29.5 18.83 27 L45.67 11.5 Q50 9 54.33 11.5 Z';
const INF = 'M24 50 C24 42.5 29.5 38 36 38 C43 38 46.5 43.5 50 50 C53.5 56.5 57 62 64 62 C70.5 62 76 57.5 76 50 C76 42.5 70.5 38 64 38 C57 38 53.5 43.5 50 50 C46.5 56.5 43 62 36 62 C29.5 62 24 57.5 24 50 Z';

const iso = (x, y, size, color, sw = 4.5) =>
  `<g transform="translate(${x} ${y}) scale(${size / 100})" fill="none" stroke="${color}" stroke-linejoin="round"><path d="${HEX}" stroke-width="${sw}"/><path d="${INF}" stroke-width="${sw * 0.93}"/></g>`;

/** Texto a trazos. x,y = origen de la línea base; size en px; tracking en em. */
function text(font, str, x, y, size, fill, tracking = 0) {
  const s = size / font.unitsPerEm;
  let cx = 0;
  const parts = [];
  for (const g of font.glyphsForString(str)) {
    const d = g.path.toSVG();
    if (d) parts.push(`<path transform="translate(${(x + cx * s).toFixed(2)} ${y}) scale(${s.toFixed(5)} ${(-s).toFixed(5)})" d="${d}"/>`);
    cx += g.advanceWidth + tracking * font.unitsPerEm;
  }
  return { svg: `<g fill="${fill}">${parts.join('')}</g>`, width: (cx - tracking * font.unitsPerEm) * s };
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Built with NaN"><title>Built with NaN</title>${body}</svg>\n`;

/** Devuelve { 'built-with-nan-dark.svg': '<svg…', … } sin tocar disco. */
export function renderBadges() {
  const mono = create(readFileSync(resolve(root, 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff')));
  const wordmark = readFileSync(resolve(root, 'public/brand/nan-wordmark-white.svg'), 'utf8');
  // "NaN" ocupa x 0..83.7, y 0..32 en el viewBox 220x33 del wordmark.
  const NAN_D = wordmark.match(/<path d="([^"]+)"/)[1];
  const nan = (x, y, w, fill) => `<path transform="translate(${x} ${y}) scale(${(w / 84).toFixed(5)})" fill="${fill}" d="${NAN_D}"/>`;
  const nanH = (w) => (w * 32) / 84;

  const files = {};

  // Principal: tarjeta en el lenguaje del sitio, en oscuro y en claro.
  for (const [name, bg, line, label, ink] of [
    ['built-with-nan-dark.svg', BG, 'rgba(255,255,255,0.16)', '#9A9A9E', '#FFFFFF'],
    ['built-with-nan-light.svg', SNOW, 'rgba(16,16,16,0.16)', 'rgba(16,16,16,0.62)', SNOW_INK],
  ]) {
    const W = 266, H = 104;
    const lbl = text(mono, 'BUILT WITH', 108, 32, 11, label, 0.2);
    files[name] = svg(W, H, `
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${bg}" stroke="${line}"/>
${iso(18, 20, 64, VIOLET)}
<line x1="94" y1="24" x2="94" y2="80" stroke="${line}"/>
${lbl.svg}
${nan(108, 42, 124, ink)}
<rect x="${W - 26}" y="${42 + nanH(124) - 8}" width="8" height="8" rx="1.5" fill="${VIOLET}"/>`);
  }

  // Compacto: formato shields.io (alto 28) para la fila de badges.
  {
    const lbl = text(mono, 'BUILT WITH', 32, 18.5, 10, '#FFFFFF', 0.12);
    const L = Math.ceil(32 + lbl.width + 10), R = 70, H = 28;
    files['built-with-nan-compact.svg'] = svg(L + R, H, `
<clipPath id="c"><rect width="${L + R}" height="${H}" rx="4"/></clipPath>
<g clip-path="url(#c)"><rect width="${L}" height="${H}" fill="${BG}"/><rect x="${L}" width="${R}" height="${H}" fill="${VIOLET}"/></g>
${iso(7, 4, 20, VIOLET_2, 6)}
${lbl.svg}
${nan(L + 11, (H - nanH(48)) / 2, 48, '#FFFFFF')}`);
  }

  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'public/badge');
  mkdirSync(out, { recursive: true });
  for (const [name, body] of Object.entries(renderBadges())) {
    writeFileSync(resolve(out, name), body);
    console.log(`public/badge/${name}  ${(body.length / 1024).toFixed(1)} KB`);
  }
}
