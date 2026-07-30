/**
 * Vuelca el diccionario del rediseño (nan-site/src/i18n/ui.ts) en los
 * i18n/{en,es}.json de este repo.
 *
 *   node scripts/merge-ui-into-i18n.mjs ../nan-site
 *
 * Todo el copy del rediseño cuelga de la clave `nan`, así que no pisa nada del
 * copy vigente de este repo (que sigue sirviendo a los componentes aún no
 * migrados). Los componentes nuevos leen t('nan.algo', locale).
 *
 * Es de un solo uso, pero se deja en el repo para poder repetir el volcado si
 * hay que resincronizar durante la migración.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = resolve(process.argv[2] ?? '../nan-site', 'src/i18n/ui.ts');

// ui.ts es TypeScript, pero el objeto en sí es JSON puro: le quitamos los
// helpers y el `as const` y lo cargamos como módulo ESM.
let src = readFileSync(source, 'utf8');
const start = src.indexOf('export const ui = ');
if (start === -1) throw new Error('no encuentro `export const ui =` en ' + source);
src = src.slice(start).replace(/^export const ui = /, 'const ui = ');
const end = src.indexOf('} as const;');
if (end === -1) throw new Error('no encuentro el cierre `} as const;`');
src = src.slice(0, end) + '};\nexport default ui;\n';

const tmp = join(mkdtempSync(join(tmpdir(), 'nan-ui-')), 'ui.mjs');
writeFileSync(tmp, src);
const { default: ui } = await import(pathToFileURL(tmp).href);

for (const loc of ['en', 'es']) {
  const file = `i18n/${loc}.json`;
  const target = JSON.parse(readFileSync(file, 'utf8'));
  // Todo lo nuestro cuelga de `nan.*`: cero colisiones con el copy vigente y
  // queda claro de quién es cada bloque. Cuando se borren los componentes
  // viejos se puede aplanar.
  target.nan = ui[loc];
  const added = Object.keys(ui[loc]);
  writeFileSync(file, JSON.stringify(target, null, 2) + '\n');
  console.log(`${loc}: nan.* con ${added.length} bloques (${added.join(', ')})`);
}
