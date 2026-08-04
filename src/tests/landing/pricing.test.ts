import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t, tArr, tObj } from '../../lib/i18n';

/**
 * The pricing section is the surface a prospect reads BEFORE paying, so its
 * copy is the one that has to be true first. It was selling a product that no
 * longer exists:
 *
 *   - "1,000M token monthly allowance" while the cap is 3,000M.
 *   - "Access granted immediately after billing", the exact promise removed
 *     from the member portal for being false (the grant can stay pending, and
 *     the API has an explicit state to say so).
 *   - a `nan_member · usa / latam — $75` tier, while every new signup is
 *     charged 70€ in any region, so the price and the currency changed between
 *     the card and the Checkout.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/home/Pricing.astro'), 'utf-8');
const locales = ['en', 'es'] as const;

/** The tier objects the section renders, as written in the frontmatter. */
const tiers = source.slice(0, source.indexOf('---', 4));

describe('Pricing — no per-region tier', () => {
  test('the $75 tier is gone', () => {
    expect(tiers).not.toMatch(/amount:\s*'\$75'/);
    expect(tiers).not.toMatch(/name:\s*'nan_member · usa \/ latam'/);
  });

  test('the member tier is a single one, priced in euros', () => {
    expect(tiers).toMatch(/name:\s*'nan_member',/);
    expect(tiers).toMatch(/amount:\s*'70€'/);
  });

  test('the premium tier still leads at 200€', () => {
    const first = tiers.indexOf("name: 'nan_member · glm 5.2 premium'");
    const member = tiers.indexOf("name: 'nan_member',");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(member);
    expect(tiers).toMatch(/amount:\s*'200€'/);
  });
});

interface FaqItem {
  q: string;
  a: string;
}

/** Every FAQ answer of a locale, joined. tArr() drops objects, so tObj(). */
function faqAnswers(locale: string): string {
  const faq = tObj<{ items?: FaqItem[] }>('nan.faq', locale);
  expect(faq.items?.length ?? 0).toBeGreaterThan(0);
  return (faq.items ?? []).map((item) => item.a).join(' ');
}

describe.each(locales)('Pricing copy — %s', (locale) => {
  const premium = () => tArr('nan.pricing.premiumIncludes', locale);

  test('publishes the real allowance and not the old 1,000M', () => {
    const copy = premium().join(' ');
    expect(copy).toMatch(/3[.,]000M/);
    expect(copy).not.toMatch(/1[.,]000M/);
  });

  test('does not promise the access grant is immediate', () => {
    const copy = premium().join(' ').toLowerCase();
    expect(copy).not.toContain('immediately');
    expect(copy).not.toContain('justo después');
    // What it says instead, matching the portal's wording.
    expect(copy).toMatch(/few minutes after payment|pocos minutos después del pago/);
  });

  test('publishes the 4h window before the purchase, not only after it', () => {
    const copy = premium().join(' ');
    expect(copy).toMatch(/400M/);
    expect(copy).toMatch(/4h/);
  });

  test('publishes context and concurrency', () => {
    const copy = premium().join(' ');
    expect(copy).toMatch(/500K/);
    expect(copy).toMatch(/5 (concurrent requests|peticiones en paralelo)/);
  });

  test('refers to the member tier by the name the section renders', () => {
    const copy = premium().join(' ');
    expect(copy).toContain('nan_member');
    expect(copy).not.toContain('nan_member · eu');
  });

  test('no em-dashes in the premium bullets', () => {
    for (const item of premium()) expect(item).not.toContain('—');
  });

  test('the member condition states the billing currency', () => {
    const cond = t('nan.pricing.memberCond', locale);
    expect(cond).toMatch(/euros/);
    expect(cond).toMatch(/any region|cualquier región/);
  });

  test('the payment-methods answer no longer prices by region, and keeps legacy USD true', () => {
    const answers = faqAnswers(locale);
    expect(answers).not.toMatch(/USA\/Latam/);
    expect(answers).toMatch(/euros/);
    expect(answers).toMatch(/dollars|dólares/);
  });

  test('the allowance FAQ lists the premium quota alongside the other frontier models', () => {
    expect(faqAnswers(locale)).toMatch(/3[.,]000M/);
  });
});

describe('Pricing copy — both locales stay parallel', () => {
  test('the premium bullet lists have the same length', () => {
    const [en, es] = locales.map((l) => tArr('nan.pricing.premiumIncludes', l));
    expect(en.length).toBe(es.length);
  });
});
