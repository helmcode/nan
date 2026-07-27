import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isValidEmail, isWaitlistRegion } from '../../components/landing/waitlistForm.helpers';

/**
 * El formulario del rediseño (scripts/waitlist.ts, vanilla) y la isla Preact
 * comparten helpers a propósito: si alguien vuelve a meter una validación
 * propia en el script, los dos formularios empiezan a aceptar cosas distintas
 * y el espejo de dominios bloqueados del cliente deja de coincidir con el del
 * servidor (lib/waitlist.ts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../scripts/waitlist.ts'), 'utf-8');

describe('waitlist vanilla', () => {
  describe('reutiliza los helpers compartidos', () => {
    test('importa la validación en vez de reimplementarla', () => {
      expect(source).toContain("from '../components/landing/waitlistForm.helpers'");
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

  describe('distingue los estados que devuelve el backend', () => {
    test('trata "interest" aparte de "registered"', () => {
      // LATAM y USA vuelven con posición 0: enseñar "posición 000" sería falso.
      expect(source).toContain("result.status === 'interest'");
      expect(source).toContain('okInterest');
    });

    test('el rate limit tiene su propio mensaje', () => {
      expect(source).toContain('rate_limited');
      expect(source).toContain('errRateLimited');
    });
  });
});
