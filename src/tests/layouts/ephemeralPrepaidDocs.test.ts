import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Prepaid S-minutes and auto-recharge on the Ephemeral runs page (E4 PR9).
 *
 * The facts pinned here come from devops AGENT-EPHEMERAL-PREPAID.md (owner
 * decisions 2026-10-26, §1, §4.2, §5.1-5.4, §6, §13) and the cloud-ui copy of
 * feat/e4-prepaid-ui (src/lib/ephemeral-prepaid.ts, PrepaidCard, AddFundsModal,
 * AutoRechargeForm):
 * - packs EUR 5 / 10 / 25 and a free amount of EUR 5 to 200, whole euros;
 * - open to every account with a payment method (members, Community and no
 *   membership), BYOK only without inference;
 * - order: free minutes, then prepaid, then postpaid (members only);
 * - expiry 6 months from the last purchase or recharge, whole balance;
 * - auto-recharge below a threshold (EUR 1 to 50), EUR 5 to 100 per recharge,
 *   card only, no daily cap, recharges count towards the monthly cap;
 * - grace and banned freeze the balance;
 * - the withdrawal waiver when buying.
 *
 * cloud-ui links to ephemeral-runs#prepaid-minutes-and-auto-recharge, so that
 * exact anchor must exist in both locales.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');

const ANCHOR = 'prepaid-minutes-and-auto-recharge';

/** The prepaid section: from its heading to the next h2. */
function prepaidSection(body: string, heading: string): string {
  const start = body.indexOf(`## ${heading}`);
  expect(start, heading).toBeGreaterThan(-1);
  const next = body.indexOf('\n## ', start + 3);
  return body.slice(start, next === -1 ? undefined : next).replace(/\s+/g, ' ');
}

const pages = {
  en: { file: 'content/docs/ephemeral-runs.mdx', heading: 'Prepaid minutes and auto-recharge', terms: '/terms#ephemeral-prepaid' },
  es: { file: 'content/docs-es/ephemeral-runs.mdx', heading: 'Minutos prepago y recarga automática', terms: '/es/terms#ephemeral-prepaid' },
} as const;

describe('ephemeral runs: prepaid minutes (EN)', () => {
  const body = strip(read(pages.en.file));
  const s = prepaidSection(body, pages.en.heading);

  test('the heading renders the anchor cloud-ui links to', () => {
    expect(body).toMatch(/^## Prepaid minutes and auto-recharge$/m);
  });

  test('packs, free amount, price per S-minute', () => {
    expect(s).toMatch(/€5, €10 (and|or) €25/);
    expect(s).toContain('€5 to €200');
    expect(s).toContain('whole euros');
    expect(s).toContain('€0.003');
    expect(s).toMatch(/1,666 S-minutes/);
  });

  test('who can buy: everyone with a payment method; prepaid-only without membership', () => {
    expect(s).toMatch(/Community/);
    expect(s).toMatch(/without a membership/);
    expect(s).toMatch(/your own key/);
    expect(s).toContain('**Add funds**');
  });

  test('order of consumption: free, prepaid, postpaid for members only', () => {
    expect(s).toMatch(/free minutes first, then your prepaid balance, then/i);
    expect(s).toMatch(/then, only for members/i);
  });

  test('expiry: 6 months from the last purchase or recharge, the whole balance', () => {
    expect(s).toContain('6 months from your last purchase or recharge');
    expect(s).toContain('whole balance');
  });

  test('auto-recharge: threshold and amount bounds, card, no daily cap, monthly cap', () => {
    expect(s).toContain('**Recharge automatically**');
    expect(s).toContain('€1 to €50');
    expect(s).toContain('€5 to €100');
    expect(s).toMatch(/larger than the threshold/);
    expect(s).toMatch(/needs a card/);
    expect(s).toMatch(/no daily limit/);
    expect(s).toMatch(/count towards your monthly spend cap/);
    expect(s).toMatch(/does not charge you now/);
    expect(s).toMatch(/Manual purchases do not count/);
  });

  test('frozen balance in grace or banned', () => {
    expect(s).toContain('**Frozen**');
    expect(s).toMatch(/cannot be topped up/);
    expect(s).toMatch(/expiry keeps running/);
  });

  test('withdrawal waiver and the terms link', () => {
    expect(s).toMatch(/right of withdrawal/);
    expect(s).toMatch(/non-refundable/);
    expect(s).toContain(`(${pages.en.terms})`);
  });

  test('new error codes are in the troubleshooting table', () => {
    for (const code of ['402 ephemeral_funds_insufficient', '402 ephemeral_recharge_pending', '409 card_required', '400 withdrawal_waiver_required'])
      expect(body, code).toContain(`| \`${code}\``);
  });

  test('no em-dashes', () => expect(s).not.toContain('—'));
});

describe('ephemeral runs: prepaid minutes (ES)', () => {
  const body = strip(read(pages.es.file));
  const s = prepaidSection(body, pages.es.heading);

  test('carries the exact English anchor cloud-ui links to, right before the heading', () => {
    expect(body).toMatch(new RegExp(`<a id="${ANCHOR}"></a>\\n\\n## ${pages.es.heading}`));
  });

  test('packs, free amount, price per S-minute', () => {
    expect(s).toMatch(/5 €, 10 € (y|o) 25 €/);
    expect(s).toContain('de 5 € a 200 €');
    expect(s).toContain('euros enteros');
    expect(s).toContain('0,003 €');
    expect(s).toMatch(/1\.666 minutos S/);
  });

  test('who can buy, order, expiry', () => {
    expect(s).toMatch(/Community/);
    expect(s).toMatch(/sin membresía/);
    expect(s).toContain('**Add funds**');
    expect(s).toMatch(/primero los minutos gratis, después tu saldo prepago y después/i);
    expect(s).toContain('6 meses desde tu última compra o recarga');
  });

  test('auto-recharge bounds and limits', () => {
    expect(s).toContain('**Recharge automatically**');
    expect(s).toContain('de 1 € a 50 €');
    expect(s).toContain('de 5 € a 100 €');
    expect(s).toMatch(/sin límite diario/);
    expect(s).toMatch(/cuentan para tu límite de gasto mensual/);
    expect(s).toMatch(/no te cobra nada ahora/);
  });

  test('frozen, waiver, terms link', () => {
    expect(s).toContain('**Frozen**');
    expect(s).toMatch(/derecho de desistimiento/);
    expect(s).toContain(`(${pages.es.terms})`);
  });

  test('new error codes are in the troubleshooting table', () => {
    for (const code of ['402 ephemeral_funds_insufficient', '402 ephemeral_recharge_pending', '409 card_required', '400 withdrawal_waiver_required'])
      expect(body, code).toContain(`| \`${code}\``);
  });

  test('no em-dashes', () => expect(s).not.toContain('—'));
});
