/**
 * Genera las tarjetas Open Graph (1200x630) de nan.builders.
 *
 *   node scripts/gen-og.mjs
 *
 * Salida: public/og/og-{en,es}.png (+ .svg autocontenido, por si hay que retocar)
 *
 * Sistema visual: off-black + glow radial violeta + wordmark vectorial + claim
 * en Archivo con los MISMOS ejes que los H1 del sitio (wdth 118, wght 850,
 * mayúsculas) + hairline violeta + dominio en JetBrains Mono.
 *
 * El texto se convierte a paths con fontkit, así que el PNG y el SVG no
 * dependen de que la fuente esté instalada. Los TTF variables se descargan a
 * scripts/.fontcache/ (ignorada por git) la primera vez; no se commitea ninguna
 * fuente.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'scripts/.fontcache');

// tokens (src/styles/tokens.css)
const BG = '#0B0B0C';
const TEXT = '#F5F4F7';
const VIOLET = '#7D39EB';
const VIOLET_2 = '#9B6BF0';
const MUTED = '#9A9A9E';

const W = 1200;
const H = 630;
const M = 80; // margen izquierdo

const FONTS = {
  archivo: {
    file: 'Archivo.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf',
  },
  mono: {
    file: 'JetBrainsMono.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
  },
};

async function loadFont({ file, url }) {
  mkdirSync(cache, { recursive: true });
  const path = resolve(cache, file);
  if (!existsSync(path)) {
    console.log(`bajando ${file}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`no se pudo bajar ${file}: ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return fontkit.openSync(path);
}

/**
 * Convierte una cadena en paths SVG con la tipografía y los ejes pedidos.
 * Devuelve el <g> ya posicionado y el ancho real, para poder encajarlo.
 */
function textToPaths(font, { text, variation, size, x, y, fill, tracking = 0 }) {
  const inst = variation ? font.getVariation(variation) : font;
  const run = inst.layout(text);
  const upem = font.unitsPerEm;
  const scale = size / upem;
  const ls = tracking * upem; // tracking en em -> unidades de fuente

  let pen = 0;
  const parts = [];
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const d = glyph.path.toSVG();
    if (d) {
      const dx = pen + (pos.xOffset ?? 0);
      const dy = pos.yOffset ?? 0;
      parts.push(`<path transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})" d="${d}"/>`);
    }
    pen += pos.xAdvance + ls;
  });

  // scale(s, -s) porque los contornos van con la Y hacia arriba
  return {
    svg: `<g transform="translate(${x} ${y}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${fill}">${parts.join('')}</g>`,
    width: pen * scale,
  };
}

/** Baja el tamaño hasta que el texto quepa en el ancho disponible. */
function fitText(font, opts, maxWidth) {
  let size = opts.size;
  for (let i = 0; i < 40; i++) {
    const out = textToPaths(font, { ...opts, size });
    if (out.width <= maxWidth) return { ...out, size };
    size -= 1;
  }
  return textToPaths(font, { ...opts, size });
}

/** Paths del wordmark, reescalados desde su viewBox 0 0 220 33. */
function wordmark(x, y, width) {
  const svg = readFileSync(resolve(root, 'public/brand/nan-wordmark-white.svg'), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const scale = width / 220;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${TEXT}">${inner}</g>`;
}

const CARDS = {
  en: {
    claim: 'Build without limits.',
    sub: 'A community of builders sharing GPUs to run open models at a flat rate.',
  },
  es: {
    claim: 'Construye sin límites.',
    sub: 'Una comunidad de builders que comparten GPUs para correr modelos abiertos a tarifa fija.',
  },
};

const archivo = await loadFont(FONTS.archivo);
const mono = await loadFont(FONTS.mono);

function card({ claim, sub }) {
  const avail = W - M * 2;

  // claim: mismos ejes que los H1 del sitio
  const claimG = fitText(
    archivo,
    { text: claim.toUpperCase(), variation: { wdth: 118, wght: 850 }, size: 76, x: M, y: 340, fill: TEXT, tracking: -0.02 },
    avail
  );
  const subG = fitText(
    archivo,
    { text: sub, variation: { wdth: 100, wght: 400 }, size: 27, x: M, y: 402, fill: MUTED },
    avail
  );
  const domainG = textToPaths(mono, {
    text: 'nan.builders',
    variation: { wght: 500 },
    size: 26,
    x: M,
    y: 536,
    fill: VIOLET_2,
    tracking: 0.02,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.74" cy="0.24" r="0.72">
      <stop offset="0%" stop-color="${VIOLET}" stop-opacity="0.34"/>
      <stop offset="62%" stop-color="${VIOLET}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.08" cy="1" r="0.6">
      <stop offset="0%" stop-color="${VIOLET}" stop-opacity="0.16"/>
      <stop offset="60%" stop-color="${VIOLET}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${wordmark(M, 96, 420)}
  ${claimG.svg}
  ${subG.svg}

  <rect x="${M}" y="470" width="240" height="2" fill="${VIOLET}"/>

  ${domainG.svg}
</svg>`;
}

mkdirSync(resolve(root, 'public/og'), { recursive: true });

for (const [lang, copy] of Object.entries(CARDS)) {
  const svg = card(copy);
  const out = resolve(root, `public/og/og-${lang}.png`);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(out);
  writeFileSync(resolve(root, `public/og/og-${lang}.svg`), svg);
  console.log(`ok  og-${lang}.png`);
}
