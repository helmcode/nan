/**
 * Optimiza las imágenes de public/img: reescala al tamaño en que se muestran
 * de verdad (x2 para pantallas densas) y convierte a WebP.
 *
 *   node scripts/optimize-images.mjs          # convierte y borra el original
 *   node scripts/optimize-images.mjs --dry    # solo informa
 *
 * Se quedan fuera a propósito:
 *   - cat.png       pixel art de 19KB, se pinta con image-rendering: pixelated
 *   - why-gpu-card  ya pesa 24KB
 *   - brand/ y og/  vectores y tarjetas ya optimizadas
 */
import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

// carpeta/fichero -> ancho máximo servido (ya x2 sobre el tamaño CSS)
const RULES = [
  { dir: 'public/img/projects', maxWidth: 760, quality: 82 }, // portada de disquete ~348px CSS
  { dir: 'public/img/events', maxWidth: 1000, quality: 82 }, // tarjetas 16:9 en grid
  { file: 'public/img/404-crt.jpg', maxWidth: 1400, quality: 82 },
  { file: 'public/img/founder.jpg', maxWidth: 480, quality: 85 },
  { file: 'public/img/borja.jpg', maxWidth: 480, quality: 85 },
  // fuente del dither del hero: el script la umbraliza a blanco y negro, así que
  // los artefactos no se ven, pero subimos calidad por si acaso
  { file: 'public/img/hero-dither.png', maxWidth: 1600, quality: 90 },
];

const RASTER = new Set(['.png', '.jpg', '.jpeg']);
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

const skipped = [];

async function convert(abs, maxWidth, quality) {
  const before = statSync(abs).size;
  const out = abs.replace(/\.(png|jpe?g)$/i, '.webp');

  let meta;
  try {
    meta = await sharp(abs).metadata();
  } catch {
    // p.ej. un .ico renombrado a .png: se deja tal cual y se avisa
    skipped.push(abs);
    console.log(`skip ${abs.replace(root + '\\', '').replace(root + '/', '')}  formato no soportado`);
    return { before, after: before };
  }
  const resize = meta.width && meta.width > maxWidth ? { width: maxWidth } : null;

  if (dry) {
    console.log(`dry  ${abs.replace(root + '\\', '').replace(root + '/', '')}  ${kb(before)}  ${meta.width}px${resize ? ` -> ${maxWidth}px` : ''}`);
    return { before, after: before };
  }

  let pipe = sharp(abs);
  if (resize) pipe = pipe.resize(resize);
  await pipe.webp({ quality, effort: 6 }).toFile(out);

  const after = statSync(out).size;
  unlinkSync(abs); // el original vive en el historial de git
  console.log(
    `ok   ${out.replace(root + '\\', '').replace(root + '/', '')}  ${kb(before)} -> ${kb(after)}  (-${Math.round((1 - after / before) * 100)}%)`
  );
  return { before, after };
}

const targets = [];
for (const rule of RULES) {
  if (rule.file) {
    const abs = resolve(root, rule.file);
    if (existsSync(abs)) targets.push({ abs, ...rule });
    continue;
  }
  const dir = resolve(root, rule.dir);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (RASTER.has(extname(name).toLowerCase())) targets.push({ abs: join(dir, name), ...rule });
  }
}

let before = 0;
let after = 0;
for (const t of targets) {
  const r = await convert(t.abs, t.maxWidth, t.quality);
  before += r.before;
  after += r.after;
}

console.log(
  `\n${targets.length} imágenes: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB` +
    (dry ? ' (dry run)' : ` (-${Math.round((1 - after / before) * 100)}%)`)
);
if (skipped.length) {
  console.log(`\n${skipped.length} sin convertir (revisar a mano):`);
  for (const s of skipped) console.log(`  ${s.replace(root + '\\', '').replace(root + '/', '')}`);
}
