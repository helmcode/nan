import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { withLang, switchLocalePath, getLocale } from '../../lib/i18n';

/**
 * Guarda de todo el repo: el idioma va en la RUTA, nunca en un query param.
 *
 * El esquema `?lang=` se retiró al mover el idioma a la ruta, pero sobrevivió
 * en las pantallas del hackatón, donde además quedó invertido: la rama de
 * `locale === 'es'` devolvía el path sin prefijo, así que desde `/es/hackaton`
 * se aterrizaba en páginas en inglés. `NavLanguage.test.ts` ya vigilaba la Nav,
 * pero nadie vigilaba el resto de páginas.
 *
 * Un `?lang=` no es una señal de idioma para los buscadores y no puede llevar
 * hreflang, así que si vuelve a aparecer es un error, no una alternativa.
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../..');

/** Ficheros de test aparte: ahí `?lang=` aparece a propósito, como entrada. */
const isTest = (path: string) => /\.test\.tsx?$/.test(path);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.(astro|ts|tsx)$/.test(entry) && !isTest(full)) {
      found.push(full);
    }
  }
  return found;
}

describe('el idioma vive en la ruta', () => {
  test('ningún fichero de src construye enlaces con ?lang=', () => {
    const offenders = sourceFiles(srcDir)
      .filter((file) => readFileSync(file, 'utf-8').includes('?lang='))
      .map((file) => relative(srcDir, file));

    expect(offenders).toEqual([]);
  });

  describe('withLang es la única forma de prefijar', () => {
    test('el español lleva prefijo y el inglés no', () => {
      expect(withLang('/hackaton/me', 'es')).toBe('/es/hackaton/me');
      expect(withLang('/hackaton/me', 'en')).toBe('/hackaton/me');
    });

    test('la raíz no se convierte en //es', () => {
      expect(withLang('/', 'es')).toBe('/es');
      expect(withLang('/', 'en')).toBe('/');
    });

    test('un ?lang= en la URL no cambia el idioma: manda la ruta', () => {
      expect(getLocale(new URL('https://nan.builders/?lang=es'))).toBe('en');
      expect(getLocale(new URL('https://nan.builders/es/events?lang=en'))).toBe('es');
    });

    test('withLang y switchLocalePath coinciden en el destino', () => {
      expect(withLang('/events', 'es')).toBe(switchLocalePath('/events', 'es'));
      expect(withLang('/events', 'en')).toBe(switchLocalePath('/es/events', 'en'));
    });
  });
});
