import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Guarda de `src/pages`: una página no importa a otra página.
 *
 * Astro atribuye el CSS por entrypoint de ruta. Cuando una página importaba a
 * otra (las `/es/*` eran envoltorios de su equivalente EN), el chunk se asignaba
 * solo a la importada y el envoltorio se servía **sin un solo
 * `<link rel="stylesheet">`**: `/es`, `/es/projects`, `/es/events`,
 * `/es/community` y las cinco del hackatón salieron a producción sin estilos, y
 * con ellos visible el enlace de "saltar al contenido", que se oculta por CSS.
 * En `nan-site` no se veía porque era un build estático; aquí el output es
 * `server`.
 *
 * El arreglo: el cuerpo vive en un fichero con prefijo `_` (que Astro excluye
 * del enrutado) y EN y ES son los dos envoltorios de tres líneas del mismo
 * cuerpo. Así el cuerpo es un módulo normal del grafo y las dos rutas reciben
 * su CSS.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, '../../pages');

/** Un fichero de `src/pages` es una ruta salvo que él o su carpeta empiece por `_`. */
const isRoute = (path: string) =>
  !relative(pagesDir, path)
    .split(/[\\/]/)
    .some((segment) => segment.startsWith('_'));

function pageFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pageFiles(full, found);
    else if (entry.endsWith('.astro')) found.push(full);
  }
  return found;
}

/** Especificadores de import relativos de un `.astro`, tal cual se escriben. */
function relativeImports(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+[^'"]*from\s+['"](\.[^'"]+)['"]/gm)].map((m) => m[1]);
}

describe('las páginas no se importan entre sí', () => {
  const routes = pageFiles(pagesDir).filter(isRoute);

  test('hay rutas que revisar', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  test('ninguna ruta importa un fichero que sea a su vez una ruta', () => {
    const offenders: string[] = [];

    for (const route of routes) {
      const source = readFileSync(route, 'utf-8');
      for (const spec of relativeImports(source)) {
        if (!spec.endsWith('.astro')) continue;
        const target = resolve(dirname(route), spec);
        // Solo importa lo que caiga dentro de pages/: los layouts y componentes
        // de fuera nunca son rutas.
        if (relative(pagesDir, target).startsWith('..')) continue;
        if (isRoute(target)) {
          offenders.push(`${relative(pagesDir, route)} -> ${spec}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test('cada cuerpo con prefijo _ lo envuelve alguna ruta', () => {
    const bodies = pageFiles(pagesDir).filter((file) => !isRoute(file));
    const imported = new Set(
      routes.flatMap((route) =>
        relativeImports(readFileSync(route, 'utf-8'))
          .filter((spec) => spec.endsWith('.astro'))
          .map((spec) => resolve(dirname(route), spec)),
      ),
    );

    const orphans = bodies.filter((body) => !imported.has(body)).map((f) => relative(pagesDir, f));

    expect(orphans).toEqual([]);
  });
});
