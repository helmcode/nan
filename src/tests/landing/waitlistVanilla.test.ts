import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isValidEmail, isWaitlistRegion } from '../../lib/waitlistClient';

/**
 * El formulario del rediseño (scripts/waitlist.ts, vanilla) y la isla Preact
 * comparten helpers a propósito: si alguien vuelve a meter una validación
 * propia en el script, los dos formularios empiezan a aceptar cosas distintas
 * y el espejo de dominios bloqueados del cliente deja de coincidir con el del
 * servidor (lib/waitlist.ts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../scripts/waitlist.ts'), 'utf-8');
const heroSource = readFileSync(resolve(here, '../../components/nan/home/Hero.astro'), 'utf-8');

describe('waitlist vanilla', () => {
  describe('reutiliza los helpers compartidos', () => {
    test('importa la validación en vez de reimplementarla', () => {
      expect(source).toContain("from '../lib/waitlistClient'");
      expect(source).toContain('isValidEmail');
      expect(source).toContain('isWaitlistRegion');
      expect(source).toContain('parseWaitlistResponse');
    });

    test('no lleva su propia regex de email', () => {
      expect(source).not.toMatch(/\/\^\[\^\\s@\]\+@/);
    });
  });

  describe('la validación que hereda', () => {
    test('rechaza los dominios de ejemplo y desechables', () => {
      expect(isValidEmail('alguien@example.com')).toBe(false);
      expect(isValidEmail('alguien@test.com')).toBe(false);
      expect(isValidEmail('alguien@mail.com')).toBe(false);
      expect(isValidEmail('alguien@loquesea.invalid')).toBe(false);
      expect(isValidEmail('alguien@loquesea.localhost')).toBe(false);
    });

    test('acepta un email normal', () => {
      expect(isValidEmail('borja@helmcode.com')).toBe(true);
      expect(isValidEmail('  Borja@Helmcode.com  ')).toBe(true);
    });

    test('rechaza formatos rotos y emails larguísimos', () => {
      expect(isValidEmail('sinarroba')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('a'.repeat(250) + '@helmcode.com')).toBe(false);
    });

    test('las regiones son las tres del backend', () => {
      expect(isWaitlistRegion('EU')).toBe(true);
      expect(isWaitlistRegion('LATAM')).toBe(true);
      expect(isWaitlistRegion('USA')).toBe(true);
      expect(isWaitlistRegion('')).toBe(false);
      expect(isWaitlistRegion('ES')).toBe(false);
    });
  });

  describe('delega la decisión del mensaje, no la reimplementa', () => {
    /**
     * Antes esto comprobaba que el TEXTO del script contuviera la rama de
     * estado del alta y `rate_limited`. Esa lógica se movió a
     * lib/waitlistClient para poder probarla sin DOM, y los asserts de texto
     * se rompieron sin que nada estuviera mal: el caso exacto que hace frágiles
     * las pruebas sobre el fuente.
     *
     * El COMPORTAMIENTO (alta igual en todas las regiones y sin posición, rate limit con su propio texto,
     * red aparte del servidor) vive ahora en `tests/lib/waitlistClient.test.ts`.
     * Aquí solo queda lo que de verdad depende de este fichero: que no se monte
     * su propia versión.
     */
    test('usa los helpers de mensaje en vez de un mapa propio', () => {
      expect(source).toContain('waitlistErrorText');
      expect(source).toContain('waitlistSuccessText');
    });

    test('no conserva el texto de "región sin abrir": las tres regiones están abiertas', () => {
      expect(source).not.toContain('okInterest');
      expect(source).not.toMatch(/not open in your region/i);
    });

    test('no enseña la posición: ni clave okPosition ni el número del backend', () => {
      expect(source).not.toMatch(/\bresult\.position\b|okPosition/);
    });

    test('no reimplementa el mapa de códigos de error', () => {
      expect(source).not.toContain('rate_limited:');
      expect(source).not.toContain('const map: Record<string, string>');
    });
  });

  describe('Hero.astro serializa en data-msgs solo los textos que se usan', () => {
    const block = heroSource.match(/const waitlistMsgs = JSON\.stringify\(\{([\s\S]*?)\}\);/);
    const keys = [...(block?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((k) => k[1]);

    test('encuentra el bloque de mensajes', () => {
      expect(block, 'waitlistMsgs = JSON.stringify({...}) no está en Hero.astro').not.toBeNull();
      expect(keys).toContain('okRegistered');
      expect(keys).toContain('okText');
    });

    test('sin claves de posición ni de "región sin abrir"', () => {
      expect(keys).not.toContain('okPosition');
      expect(keys).not.toContain('okInterest');
    });
  });
});
