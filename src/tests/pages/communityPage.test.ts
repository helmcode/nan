import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';

/**
 * Guarda el cuerpo de la página /community (src/pages/_community.astro,
 * compartido por /community y /es/community). Son los invariantes de los que
 * depende el formulario restaurado pero que astro check y el runtime no ven:
 *
 *   - el ancla #signup existe y es el destino de scroll de todos los CTA
 *     (hero, pricing de la home EN, pricing de la home ES);
 *   - la isla CommunitySignupForm se monta con client:load;
 *   - cada llamada t('community.*', lang) del fuente resuelve a un string
 *     localizado real en los dos locales, no a la ruta de la clave. t() devuelve
 *     la propia clave cuando no puede resolver, así que una errata publica
 *     `community.submit` como etiqueta del botón en LOS DOS idiomas sin error de
 *     tipos ni de test: exactamente así se coló el literal "// already a member".
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../pages/_community.astro'), 'utf-8');

describe('/community page body (_community.astro)', () => {
  test('the signup section has id="signup" (scroll target of every CTA)', () => {
    expect(source).toMatch(/<section[^>]*class="cclose"[^>]*id="signup"/);
  });

  test('the CommunitySignupForm island is mounted with client:load', () => {
    expect(source).toMatch(/CommunitySignupForm[^>]*client:load/);
  });

  test('every t(\'community.*\', lang) call resolves to a real string in both locales', () => {
    // Se extraen del fuente todas las llamadas t('community.SOMETHING', ...).
    const calls = [...source.matchAll(/t\(\s*'community\.([A-Za-z0-9_]+)'\s*,/g)].map(
      (m) => `community.${m[1]}`,
    );
    // Sanity: el formulario cablea al menos las claves básicas (submit, emailLabel, etc.).
    expect(calls.length).toBeGreaterThan(10);

    const problems: string[] = [];
    for (const key of calls) {
      for (const locale of ['en', 'es'] as const) {
        const value = t(key, locale);
        if (typeof value !== 'string' || value.trim() === '') {
          problems.push(`${key} [${locale}]: not a non-empty string`);
        } else if (value === key) {
          // t() devuelve la clave cuando no puede resolver: una errata renderiza
          // la ruta en crudo como etiqueta visible en los dos idiomas.
          problems.push(`${key} [${locale}]: resolved to the raw key path (missing translation)`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
