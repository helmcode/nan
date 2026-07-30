// Copia public/_routes.json a dist/client/, que es donde Cloudflare lo lee para
// decidir qué rutas van al Worker y cuáles se sirven como asset estático.
//
// Era un `cp` dentro del script de build de package.json, y eso solo funciona en
// un shell POSIX: npm ejecuta los scripts con cmd.exe en Windows, donde no hay
// `cp`. En la misma línea vivía un `astro check --quiet || true && astro build`,
// que en cmd se agrupa como `A || (B && C)`: si el check pasaba, se saltaba el
// build entero y `npm run build` salía con 0 sin construir nada.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'public/_routes.json');
const to = resolve(root, 'dist/client/_routes.json');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('_routes.json -> dist/client/');
