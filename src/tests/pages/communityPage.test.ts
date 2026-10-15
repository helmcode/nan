import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';

/**
 * Guards the /community page body (src/pages/_community.astro, shared by
 * /community and /es/community). With open signup the page has no form of its
 * own: every CTA goes to the platform signup with plan=community, which then
 * runs the per-user Checkout. Every t('community.*', lang) call must resolve
 * in both locales: t() returns the raw key when it can't, with no build error.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../pages/_community.astro'), 'utf-8');

describe('/community page body (_community.astro)', () => {
  test('the closing section keeps id="signup" (old #signup links still land)', () => {
    expect(source).toMatch(/<section[^>]*class="cclose"[^>]*id="signup"/);
  });

  test('no island and no payment-first form', () => {
    expect(source).not.toMatch(/client:(load|idle|visible)/);
    expect(source).not.toContain('CommunitySignupForm');
  });

  test('both CTAs go to the platform signup with plan=community', () => {
    expect(source).toContain("const joinHref = signupUrl('community');");
    expect(source.match(/href=\{joinHref\}/g)?.length).toBe(2);
  });

  test('every t(\'community.*\', lang) call resolves to a real string in both locales', () => {
    const calls = [...source.matchAll(/t\(\s*'community\.([A-Za-z0-9_]+)'\s*,/g)].map((m) => `community.${m[1]}`);
    expect(calls.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const key of calls) {
      for (const locale of ['en', 'es'] as const) {
        const value = t(key, locale);
        if (!value.trim() || value === key) problems.push(`${key} [${locale}]`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
