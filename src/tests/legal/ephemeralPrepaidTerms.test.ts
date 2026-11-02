import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Prepaid S-minutes for ephemeral runs (E4): the terms the portal and the docs
 * point at (#ephemeral-prepaid). Commitments from devops
 * AGENT-EPHEMERAL-PREPAID.md §5.1-5.4, §6 and §13: one-time purchase, not a
 * subscription; immediate supply with the withdrawal waiver, also for every
 * automatic recharge; non-refundable; 6-month expiry from the last purchase or
 * recharge, whole balance; refunds and disputes remove what was credited and
 * turn auto-recharge off; frozen while in grace or banned; lost when the
 * account is deleted; auto-recharge is an off-session charge consented to in
 * advance, counted towards the monthly spend cap.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '../../pages');
const flat = (p: string) => readFileSync(resolve(pages, p), 'utf-8').replace(/\s+/g, ' ');

function section(src: string): string {
  const m = src.match(/<p id="ephemeral-prepaid">(.*?)<\/p>/);
  expect(m, 'ephemeral-prepaid paragraph present').toBeTruthy();
  return m![1].replace(/<[^>]+>/g, '');
}

function sitsUnder(src: string, heading: string) {
  const h = src.indexOf(`<h2>${heading}</h2>`);
  const next = src.indexOf('<h2', h + 1);
  const at = src.indexOf('id="ephemeral-prepaid"');
  expect(h).toBeGreaterThan(-1);
  expect(at).toBeGreaterThan(h);
  expect(at).toBeLessThan(next);
}

describe('terms: ephemeral prepaid (EN)', () => {
  const src = flat('terms.astro');
  const p = section(src);

  test('sits under "Membership and payments"', () => sitsUnder(src, 'Membership and payments'));

  test('states every commitment', () => {
    expect(p).toContain('one-time purchase');
    expect(p).toContain('not a subscription');
    expect(p).toContain('supplied immediately at your express request');
    expect(p).toContain('you lose your right of withdrawal once they are added to your balance');
    expect(p).toContain('each automatic recharge');
    expect(p).toContain('non-refundable');
    expect(p).toContain('6 months from your last purchase or recharge');
    expect(p).toContain('whole balance');
    expect(p).toContain('Expired balance is lost');
    expect(p).toContain('chargeback or payment dispute');
    expect(p).toContain('removes the balance credited by that payment');
    expect(p).toContain('turns auto-recharge off');
    expect(p).toContain('frozen');
    expect(p).toContain('cannot be topped up');
    expect(p).toContain('lost when your account is deleted');
    expect(p).toContain('without you being present');
    expect(p).toContain('monthly spend cap');
    expect(p).toContain('Prices are shown before purchase and include taxes; no VAT is added');
  });

  test('no em-dashes', () => expect(p).not.toContain('—'));
});

describe('terms: ephemeral prepaid (ES)', () => {
  const src = flat('es/terms.astro');
  const p = section(src);

  test('sits under "Membresía y pagos"', () => sitsUnder(src, 'Membresía y pagos'));

  test('states every commitment', () => {
    expect(p).toContain('compra única');
    expect(p).toContain('no es una suscripción');
    expect(p).toContain('se suministran de inmediato a petición expresa tuya');
    expect(p).toContain('pierdes tu derecho de desistimiento una vez añadidos a tu saldo');
    expect(p).toContain('cada recarga automática');
    expect(p).toContain('no son reembolsables');
    expect(p).toContain('6 meses desde tu última compra o recarga');
    expect(p).toContain('todo el saldo');
    expect(p).toContain('El saldo caducado se pierde');
    expect(p).toContain('contracargo o disputa del pago');
    expect(p).toContain('retira el saldo abonado por ese pago');
    expect(p).toContain('desactiva la recarga automática');
    expect(p).toContain('congelado');
    expect(p).toContain('no se puede recargar');
    expect(p).toContain('se pierde al eliminar tu cuenta');
    expect(p).toContain('sin que estés presente');
    expect(p).toContain('límite de gasto mensual');
    expect(p).toContain('Los precios se muestran antes de la compra e incluyen impuestos; no se añade IVA');
  });

  test('no em-dashes', () => expect(p).not.toContain('—'));
});
