import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t, tArr, tObj } from '../../lib/i18n';
import enData from '../../../i18n/en.json' with { type: 'json' };
import esData from '../../../i18n/es.json' with { type: 'json' };

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
 *
 * That last one shipped TWICE because the currency asserts covered `memberCond`
 * only: community kept publishing `$14.99` after cloud-api's
 * communityPriceForNewCustomer started charging 14,99€ from every region. Every
 * paid tier of the section is asserted here now, amount and condition, so a
 * currency that only moves on one funnel cannot pass again.
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

  test('the community tier is priced in euros too, like the Checkout charges', () => {
    expect(tiers).toMatch(/name:\s*'nan_community',/);
    expect(tiers).toMatch(/amount:\s*'14,99€'/);
  });

  test('the community card CTA routes to the /community signup form, not the portal', () => {
    // The card must land on the restored form (with the #signup anchor),
    // not on cloud.nan.builders (which has no signup form). Assert the full
    // ternary so a regression on the EN branch (else '/#pricing') is caught,
    // not masked by the ES substring also containing '/community#signup'.
    expect(tiers).toMatch(/href: lang === 'es' \? '\/es\/community#signup' : '\/community#signup'/);
    expect(tiers).not.toMatch(/cloud\.nan\.builders/);
  });

  /**
   * Nothing in the section may quote a dollar amount: all three Checkouts are
   * created in EUR for every region. The legacy USD subscriptions are true and
   * stay explained in the payment-methods FAQ, which is not this file.
   */
  test('no tier quotes a price in dollars', () => {
    expect(tiers).not.toMatch(/amount:\s*'\$/);
    for (const locale of locales) {
      for (const key of ['premiumCond', 'memberCond', 'communityCond']) {
        expect(t(`nan.pricing.${key}`, locale), `${locale}.${key}`).not.toMatch(/\$|USD/);
      }
    }
  });
});

/** Every string of a dictionary, keyed by its dotted path. */
function flatten(node: unknown, path: string[] = [], out = new Map<string, string>()) {
  if (typeof node === 'string') out.set(path.join('.'), node);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, [...path, String(i)], out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, [...path, k], out);
  }
  return out;
}

const dictionaries = { en: flatten(enData), es: flatten(esData) };

/**
 * The two fixes this file guards were both "a price card kept a currency the
 * Checkout had stopped using", found one tier at a time by a reviewer reading
 * the pages. So the sweep is on the whole dictionary, not on the keys that
 * happened to be reported: any NEW surface that quotes a dollar amount fails
 * here without anyone remembering to add an assert for it.
 *
 * The word "dollars" in prose stays legal, because the legacy USD subscriptions
 * are real and the payment-methods FAQ has to keep saying so. What cannot
 * appear is an AMOUNT in dollars: every Checkout is created in EUR now.
 */
describe('i18n — no price is quoted in a currency we do not charge', () => {
  test.each(locales)('%s quotes no dollar amount anywhere', (locale) => {
    const offenders = [...dictionaries[locale]]
      .filter(([, value]) => /\$\s?\d/.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(offenders).toEqual([]);
  });

  /**
   * The top-level `community` dictionary has no consumer left: /community
   * hardcodes its copy and links to the home `#pricing` section instead of
   * printing an amount. These two keys still carried `$14.99` and the
   * "(€14.99) in the EU" caveat, so they are fixed and asserted rather than
   * left to ship stale the day that page grows a price card again.
   */
  test.each(locales)('%s community price card is in euros, for every region', (locale) => {
    expect(t('community.priceLabel', locale)).toMatch(/14,99€/);
    expect(t('community.priceLabel', locale)).not.toMatch(/\$/);
    const note = t('community.priceTaxNote', locale);
    expect(note).toMatch(/euros/);
    expect(note).toMatch(/any region|cualquier región/);
    expect(note).not.toMatch(/in the EU|en EU/);
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

  /**
   * Both paid funnels charge EUR from every region, so both conditions have to
   * say so. Asserting `memberCond` alone is what let community keep the "in the
   * EU" caveat, which told a prospect from outside the EU that the euro did not
   * apply to them right before a EUR Checkout.
   */
  test.each(['memberCond', 'communityCond'])('%s states the billing currency', (key) => {
    const cond = t(`nan.pricing.${key}`, locale);
    expect(cond).toMatch(/euros/);
    expect(cond).toMatch(/any region|cualquier región/);
    expect(cond).not.toMatch(/in the EU|en EU/);
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

  /**
   * glm5.2's 3,000M is the one allowance that is NOT a calendar month: it resets
   * with the Stripe billing period, which is why the portal and the docs stopped
   * saying "monthly". The answer used to lump it in with DeepSeek's and MiMo's
   * genuinely monthly quotas under a single "monthly allowance".
   */
  test('the allowance FAQ names the billing period for the premium quota', () => {
    const faq = tObj<{ items?: FaqItem[] }>('nan.faq', locale);
    const answer = (faq.items ?? []).map((item) => item.a).find((a) => /3[.,]000M/.test(a));
    expect(answer).toBeDefined();
    expect(answer).toMatch(/per billing period|por periodo de facturación/);
    expect(answer).not.toMatch(/monthly allowance|cuota mensual/);
  });
});

describe('Pricing copy — both locales stay parallel', () => {
  test('the premium bullet lists have the same length', () => {
    const [en, es] = locales.map((l) => tArr('nan.pricing.premiumIncludes', l));
    expect(en.length).toBe(es.length);
  });
});
