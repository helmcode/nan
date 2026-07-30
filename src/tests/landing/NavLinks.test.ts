import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';

/**
 * Los enlaces de la Nav que apuntan a una SECCIÓN de la home.
 *
 * `Models` y `Pricing` no tienen página: son anclas de la home, así que el
 * destino se construye sobre `home` (`/` o `/es`), no con el helper `p()` que
 * prefija rutas. Con `p('/#pricing')` el español daría `/es/#pricing`, que es
 * una URL con barra final (contra la regla del repo) y que además no existe
 * como ruta.
 *
 * Se comprueba el cableado sobre la fuente y que las etiquetas estén traducidas
 * en los dos idiomas: `t()` devuelve la propia clave cuando falta, así que una
 * clave sin traducir se cuela en la barra sin romper el build.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/Nav.astro'), 'utf-8');

const HOME_ANCHORS = ['models', 'pricing'];

describe('Nav — enlaces a secciones de la home', () => {
  for (const id of HOME_ANCHORS) {
    test(`#${id} se construye sobre home, no con p()`, () => {
      expect(source).toContain('${home}#' + id);
      expect(source).not.toContain(`p('/#${id}')`);
    });
  }

  test('la etiqueta de precios está traducida en los dos idiomas', () => {
    for (const lang of ['en', 'es'] as const) {
      const label = t('nan.nav.pricing', lang);
      expect(label).not.toBe('nan.nav.pricing');
      expect(label.trim().length).toBeGreaterThan(0);
    }
    expect(t('nan.nav.pricing', 'en')).toBe('Pricing');
    expect(t('nan.nav.pricing', 'es')).toBe('Precios');
  });

  test('la sección de precios existe en la home con ese id', () => {
    const pricing = readFileSync(resolve(here, '../../components/nan/home/Pricing.astro'), 'utf-8');
    expect(pricing).toContain('id="pricing"');
  });
});
