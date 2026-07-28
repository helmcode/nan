import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * El modal de /projects pinta datos que aportan los miembros al publicar su
 * proyecto (nombre, descripción, tags, portada).
 *
 * Astro escapa los `data-*` al renderizar, pero al leerlos por `dataset` se
 * recupera el texto original: si de ahí van a `innerHTML`, vuelven a
 * interpretarse como marcado. Y la CSP de NanBase permite 'unsafe-inline', así
 * que un handler inline ejecutaría. La galería anterior (ProjectsGallery.tsx)
 * lo tenía cubierto por ser Preact; el port a vanilla perdió esa garantía.
 *
 * Esto es una guarda de texto, no una prueba de comportamiento: no hay entorno
 * DOM en la suite. Verifica que el patrón peligroso no vuelva.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../pages/projects.astro'), 'utf-8');

/** Solo el bloque del script del cliente, no el marcado del componente. */
const clientScript = source.slice(source.indexOf('<script>'));

describe('modal de /projects — datos de terceros', () => {
  test('no inyecta ningún dataset por innerHTML', () => {
    const innerHtmlWrites = clientScript
      .split('\n')
      .filter((line) => /\.innerHTML\s*=/.test(line));

    expect(innerHtmlWrites).toEqual([]);
  });

  test('los tags se pintan como texto, no como marcado', () => {
    expect(clientScript).toContain('span.textContent = t');
    expect(clientScript).toContain('replaceChildren');
    expect(clientScript).not.toMatch(/<span>\$\{/);
  });

  test('la portada entra en el url() de CSS escapada', () => {
    expect(clientScript).toContain('encodeURI(c.dataset.cover)');
  });

  test('los destinos siguen pasando por el filtro de esquema del servidor', () => {
    // safeUrl/safeImage descartan javascript: y http:; el modal solo asigna lo
    // que el frontmatter ya validó, así que el filtro no debe desaparecer.
    expect(source).toContain('const safeUrl');
    expect(source).toContain('const safeImage');
  });
});
