import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getLocale, switchLocalePath } from '../../lib/i18n';

// El componente delega toda la lógica en lib/i18n, así que aquí comprobamos
// dos cosas distintas: que el comportamiento es el correcto (contra las
// funciones reales, no contra el texto del fichero) y que el componente no se
// ha vuelto a cablear a mano al margen de esas funciones.
//
// El idioma vive en la ruta (`/` = EN, `/es/` = ES), no en un `?lang=`.

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, '../../components/landing/LanguageSwitcher.astro');
const source = readFileSync(componentPath, 'utf-8');

describe('LanguageSwitcher', () => {
  describe('comportamiento', () => {
    test('en una página inglesa ofrece el salto a español', () => {
      expect(getLocale('/community')).toBe('en');
      expect(switchLocalePath('/community', 'es')).toBe('/es/community');
    });

    test('en una página española ofrece el salto a inglés', () => {
      expect(getLocale('/es/community')).toBe('es');
      expect(switchLocalePath('/es/community', 'en')).toBe('/community');
    });

    test('la raíz cruza en los dos sentidos', () => {
      expect(switchLocalePath('/', 'es')).toBe('/es');
      expect(switchLocalePath('/es', 'en')).toBe('/');
    });
  });

  describe('cableado del componente', () => {
    test('resuelve el idioma con getLocale, no leyendo la URL a mano', () => {
      expect(source).toContain('getLocale(Astro.url)');
      expect(source).not.toContain('searchParams');
    });

    test('construye el destino con switchLocalePath', () => {
      expect(source).toContain('switchLocalePath(Astro.url.pathname');
    });

    test('la etiqueta muestra el idioma AL QUE se va', () => {
      expect(source).toContain("currentLang === 'en' ? 'ES' : 'EN'");
    });

    test('marca el hreflang del destino', () => {
      expect(source).toContain('hreflang={targetLang}');
    });
  });
});
