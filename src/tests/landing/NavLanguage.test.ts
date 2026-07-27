import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getLocale, switchLocalePath } from '../../lib/i18n';

/**
 * Sucede a LanguageSwitcher.test.ts.
 *
 * El switcher suelto que flotaba en una esquina desapareció con la landing
 * anterior; ahora el selector de idioma vive en la Nav del rediseño, que pinta
 * los dos idiomas y marca el activo en lugar de alternar una sola etiqueta.
 *
 * Se comprueban dos cosas distintas: el comportamiento, contra las funciones
 * reales de lib/i18n, y que la Nav no se cablee a mano al margen de ellas.
 *
 * El idioma vive en la ruta, no en un query param.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/Nav.astro'), 'utf-8');

describe('Nav — selector de idioma', () => {
  describe('comportamiento', () => {
    test('desde una página inglesa cruza a español', () => {
      expect(getLocale('/community')).toBe('en');
      expect(switchLocalePath('/community', 'es')).toBe('/es/community');
    });

    test('desde una página española cruza a inglés', () => {
      expect(getLocale('/es/community')).toBe('es');
      expect(switchLocalePath('/es/community', 'en')).toBe('/community');
    });

    test('la raíz cruza en los dos sentidos', () => {
      expect(switchLocalePath('/', 'es')).toBe('/es');
      expect(switchLocalePath('/es', 'en')).toBe('/');
    });
  });

  describe('cableado del componente', () => {
    test('resuelve el idioma con el helper, no leyendo la URL a mano', () => {
      expect(source).toContain('getLang(Astro.url)');
      expect(source).not.toContain('searchParams');
    });

    test('construye los destinos con switchLocalePath', () => {
      expect(source).toContain("switchLocalePath(pathname, 'en')");
      expect(source).toContain("switchLocalePath(pathname, 'es')");
    });

    test('pinta los dos idiomas y marca el activo', () => {
      expect(source).toContain("'is-active': lang === 'en'");
      expect(source).toContain("'is-active': lang === 'es'");
    });

    test('cada enlace declara su hreflang', () => {
      expect(source).toContain('hreflang="en"');
      expect(source).toContain('hreflang="es"');
    });
  });
});
