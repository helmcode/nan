import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Token packs (one-time purchase of extra tokens for one model): the terms are
 * the contract the portal copy points at. These tests pin the commitments that
 * must never drift: one model per pack, 6-month validity from the last purchase
 * of that model (extending the whole remaining balance), consumed only after
 * the period allowance, usable only with an active inference membership (and
 * premium for premium models), paused otherwise while expiry keeps running, no
 * refunds, EU withdrawal waiver on immediate supply, refunds/chargebacks remove
 * the credited tokens, other limits still apply, prices with taxes included.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '../../pages');
const flat = (p: string) => readFileSync(resolve(pages, p), 'utf-8').replace(/\s+/g, ' ');

function section(src: string): string {
  const m = src.match(/<p id="token-packs">(.*?)<\/p>/);
  expect(m, 'token-packs paragraph present').toBeTruthy();
  return m![1].replace(/<[^>]+>/g, '');
}

function sitsUnder(src: string, heading: string) {
  const h = src.indexOf(`<h2>${heading}</h2>`);
  const next = src.indexOf('<h2', h + 1);
  const at = src.indexOf('id="token-packs"');
  expect(h).toBeGreaterThan(-1);
  expect(at).toBeGreaterThan(h);
  expect(at).toBeLessThan(next);
}

describe('terms: token packs (EN)', () => {
  const src = flat('terms.astro');
  const p = section(src);

  test('sits under "Membership and payments"', () => sitsUnder(src, 'Membership and payments'));

  test('states every commitment', () => {
    expect(p).toContain('one-time purchase of extra tokens for a single model');
    expect(p).toContain('valid for 6 months from your last purchase for that model');
    expect(p).toContain('extends the whole remaining balance of that model');
    expect(p).toContain('only used once your monthly or period allowance for that model is used up');
    expect(p).toContain('the allowance keeps resetting as usual');
    expect(p).toContain('only usable while you have an active inference membership');
    expect(p).toContain('premium tier for premium models');
    expect(p).toContain('paused and the expiry date keeps running');
    expect(p).toContain('Token packs are non-refundable');
    expect(p).toContain('supplied immediately at your express request');
    expect(p).toContain('you lose your right of withdrawal once they are supplied');
    expect(p).toContain('removes the tokens credited by that purchase');
    expect(p).toContain('concurrency, rate limits and fair use');
    expect(p).toContain('Prices are shown before purchase and include taxes; no VAT is added');
  });
});

describe('terms: token packs (ES)', () => {
  const src = flat('es/terms.astro');
  const p = section(src);

  test('sits under "Membresía y pagos"', () => sitsUnder(src, 'Membresía y pagos'));

  test('states every commitment', () => {
    expect(p).toContain('compra única de tokens extra para un solo modelo');
    expect(p).toContain('válidos durante 6 meses desde tu última compra para ese modelo');
    expect(p).toContain('amplía todo el saldo restante de ese modelo');
    expect(p).toContain('solo se usan cuando has agotado tu cuota mensual o del periodo para ese modelo');
    expect(p).toContain('la cuota se sigue renovando con normalidad');
    expect(p).toContain('solo se pueden usar mientras tengas una membresía de inferencia activa');
    expect(p).toContain('tier premium para los modelos premium');
    expect(p).toContain('queda en pausa y la fecha de caducidad sigue corriendo');
    expect(p).toContain('Los paquetes de tokens no son reembolsables');
    expect(p).toContain('se suministran de inmediato a petición expresa tuya');
    expect(p).toContain('pierdes tu derecho de desistimiento una vez suministrados');
    expect(p).toContain('retira los tokens abonados por esa compra');
    expect(p).toContain('concurrencia, límites de peticiones y uso razonable');
    expect(p).toContain('Los precios se muestran antes de la compra e incluyen impuestos; no se añade IVA');
  });
});

describe('terms: last updated', () => {
  test.each(['terms.astro', 'es/terms.astro'])('%s', (f) => {
    expect(flat(f)).toContain('updated="October 16, 2026"');
  });
});
