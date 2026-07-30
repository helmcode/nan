import { describe, expect, test } from 'vitest';
import { t, tArr } from '../../lib/i18n';

/**
 * Sucede a Founder.test.ts. Aquel comprobaba el bloque `founder` del
 * diccionario, que servía a la sección de la landing anterior; el rediseño usa
 * `nan.who` y aquello dejó de estar enganchado a nada.
 *
 * Lo que se garantiza sigue siendo lo mismo: que la comunidad aparece liderada
 * por las dos personas y que Helmcode se nombra como la casa madre.
 */

describe('WhoBehind — integridad del copy', () => {
  for (const locale of ['en', 'es'] as const) {
    describe(locale, () => {
      test('el titular nombra a las dos personas', () => {
        const title = t('nan.who.title', locale);
        expect(title).toContain('Cristian Córdova');
        expect(title).toContain('Borja Perez');
      });

      test('los dos tienen rol y ubicación', () => {
        for (const key of ['cristianRole', 'cristianLoc', 'borjaRole', 'borjaLoc']) {
          expect(t(`nan.who.${key}`, locale), `nan.who.${key}`).not.toBe(`nan.who.${key}`);
          expect(t(`nan.who.${key}`, locale).length).toBeGreaterThan(0);
        }
      });

      test('la bio de Cristian menciona Helmcode', () => {
        const bio = tArr('nan.who.cristianBio', locale).join(' ');
        expect(bio.length).toBeGreaterThan(0);
        expect(bio).toContain('Helmcode');
      });

      test('hay cita y quién la firma', () => {
        expect(t('nan.who.quote', locale).length).toBeGreaterThan(20);
        expect(t('nan.who.quoteBy', locale)).toContain('Cristian');
      });
    });
  }
});
