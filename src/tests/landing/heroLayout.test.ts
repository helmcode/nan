import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * El hero no puede recortar su propio contenido.
 *
 * `.hero` va en `overflow: hidden` (por el canvas de partículas) y centra la
 * columna. La subida óptica `translateY(-4vh)` estaba en la regla base, y en
 * cuanto la columna medía casi lo mismo que el hero no quedaba holgura que la
 * absorbiera: el titular se salía por arriba y se perdía. En portátiles de 13"
 * se comía entre 14 y 28px del H1 (28 a 1440x700, 26 a 1366x640, 14 a
 * 1512x800) y además lo metía por debajo del nav. Lo reportaron usuarios con
 * una captura.
 *
 * La subida solo puede aplicarse donde sobra alto, y el hero necesita un
 * colchón vertical propio.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/home/Hero.astro'), 'utf-8');
const styles = source.slice(source.indexOf('<style>'), source.indexOf('</style>'));

/** El bloque de una regla CSS, por selector exacto, fuera de media queries. */
function baseRule(selector: string): string {
  const re = new RegExp(`(^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`);
  const m = styles.match(re);
  return m ? m[2] : '';
}

describe('layout del hero', () => {
  test('la subida óptica no va en la regla base', () => {
    expect(baseRule('.hero__col')).not.toContain('translateY');
  });

  test('la subida óptica está condicionada al alto del viewport', () => {
    const guarded = /@media\s*\(min-height:\s*\d+px\)\s*\{[^}]*\.hero__col\s*\{[^}]*translateY/;
    expect(styles).toMatch(guarded);
  });

  test('el hero reserva aire vertical propio', () => {
    expect(baseRule('.hero')).toMatch(/padding-block:/);
  });

  test('sigue creciendo con el contenido en vez de fijar el alto', () => {
    const rule = baseRule('.hero');
    expect(rule).toContain('min-height');
    // Un `height` fijo volvería a recortar por mucho padding que se le ponga.
    expect(rule).not.toMatch(/(^|[\s;])height:/);
  });
});
