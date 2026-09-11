import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';

/**
 * Guards the /community page body (src/pages/_community.astro, shared by
 * /community and /es/community). These are the invariants the restored form
 * depends on but that astro check and the runtime can't see:
 *
 *   - the #signup anchor exists and is the scroll target of every CTA
 *     (hero, home pricing EN, home pricing ES);
 *   - the CommunitySignupForm island is mounted with client:load;
 *   - every t('community.*', lang) call in the source resolves to a real
 *     localized string in both locales, not the raw key path. t() returns the
 *     key itself when it can't resolve, so a typo ships `community.submit` as
 *     the button label in BOTH languages with no type or test error — this is
 *     exactly how the "// already a member" literal slipped through.
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
    // Extract all t('community.SOMETHING', ...) call sites from the source.
    const calls = [...source.matchAll(/t\(\s*'community\.([A-Za-z0-9_]+)'\s*,/g)].map(
      (m) => `community.${m[1]}`,
    );
    // Sanity: the form wires at least the core keys (submit, emailLabel, etc.).
    expect(calls.length).toBeGreaterThan(10);

    const problems: string[] = [];
    for (const key of calls) {
      for (const locale of ['en', 'es'] as const) {
        const value = t(key, locale);
        if (typeof value !== 'string' || value.trim() === '') {
          problems.push(`${key} [${locale}]: not a non-empty string`);
        } else if (value === key) {
          // t() returns the key when it can't resolve — a typo renders the raw
          // path as the visible label in both languages.
          problems.push(`${key} [${locale}]: resolved to the raw key path (missing translation)`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
