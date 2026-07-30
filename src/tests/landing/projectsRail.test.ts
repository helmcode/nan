import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';

/**
 * El carril de disquetes de la home NO secuestra el scroll vertical.
 *
 * Tenía un handler de `wheel` que convertía `deltaY` en desplazamiento
 * horizontal y hacía `preventDefault`, devolviendo el scroll solo al llegar a un
 * extremo: con el puntero encima del carril la página se quedaba atrapada y no
 * se podía seguir bajando con ratón o touchpad. Lo reportaron usuarios.
 *
 * El movimiento horizontal no necesita código: el gesto horizontal del touchpad
 * y shift+rueda ya mueven un contenedor con `overflow-x` de forma nativa. Para
 * el ratón sin gesto horizontal están las flechas y el arrastre.
 *
 * Si alguien vuelve a añadir un handler de rueda aquí, este test lo caza.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/home/BuiltWithNan.astro'), 'utf-8');

/** Solo el bloque <script>: en los comentarios del componente sí se nombra la rueda. */
const script = source.slice(source.indexOf('<script>'));

describe('carril de proyectos de la home', () => {
  test('no escucha la rueda', () => {
    expect(script).not.toContain("addEventListener('wheel'");
    expect(script).not.toContain('deltaY');
    expect(script).not.toContain('deltaX');
  });

  test('no llama a preventDefault fuera del guard del arrastre', () => {
    // El único preventDefault legítimo es el que anula el click al final de un
    // arrastre, para que soltar sobre un disquete no abra el proyecto.
    const calls = script.match(/preventDefault\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(script).toContain('if (dragged)');
  });

  test('hay flechas y mueven el carril', () => {
    expect(source).toContain('data-rail-prev');
    expect(source).toContain('data-rail-next');
    expect(script).toContain('scrollBy');
  });

  test('las flechas etiquetan desde el diccionario, no a mano', () => {
    expect(source).toContain('aria-label={a11y.railPrev}');
    expect(source).toContain('aria-label={a11y.railNext}');
    for (const lang of ['en', 'es'] as const) {
      for (const key of ['nan.a11y.railPrev', 'nan.a11y.railNext']) {
        expect(t(key, lang)).not.toBe(key);
      }
    }
  });

  test('el desplazamiento suave respeta prefers-reduced-motion', () => {
    expect(script).toContain('prefers-reduced-motion');
  });
});
