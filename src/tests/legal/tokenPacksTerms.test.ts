import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Token packs v2 (TOKEN-PACKS-V2.md §14.4): packs with or without a
 * membership, one model per pack, four sizes, 5% subscriber discount,
 * 6-month expiry from the last purchase of that model extending the whole
 * balance, the EUR/USD rule, no refunds and the EU withdrawal waiver, purchase
 * limits with uncredited refunds, holds and bans, and automatic recharge
 * (consent, cap, retries). The portal copy points at these clauses; these
 * tests pin the commitments that must never drift.
 *
 * Units: never "B" (§9). English writes "1,000M"; Spanish writes "1.000M"
 * ("billón" is 10^12 in Spanish).
 */
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, '../../pages');
const flat = (p: string) => readFileSync(resolve(pages, p), 'utf-8').replace(/\s+/g, ' ');

function para(src: string, id: string): string {
  const m = src.match(new RegExp(`<p id="${id}">(.*?)</p>`));
  expect(m, `${id} paragraph present`).toBeTruthy();
  return m![1].replace(/<[^>]+>/g, '');
}

function allPacks(src: string): string {
  return ['token-packs', 'token-packs-refunds', 'token-packs-holds', 'token-packs-auto-recharge']
    .map((id) => para(src, id))
    .join(' ');
}

function sitsUnder(src: string, heading: string) {
  const h = src.indexOf(`<h2>${heading}</h2>`);
  const next = src.indexOf('<h2', h + 1);
  expect(h).toBeGreaterThan(-1);
  for (const id of ['token-packs', 'token-packs-refunds', 'token-packs-holds', 'token-packs-auto-recharge']) {
    const at = src.indexOf(`id="${id}"`);
    expect(at, id).toBeGreaterThan(h);
    expect(at, id).toBeLessThan(next);
  }
}

describe('terms: token packs v2 (EN)', () => {
  const src = flat('terms.astro');
  const p = para(src, 'token-packs');
  const all = allPacks(src);

  test('sits under "Membership and payments"', () => sitsUnder(src, 'Membership and payments'));

  test('catalogue, per-model balance and with-or-without a membership', () => {
    expect(p).toContain('one-time purchase of tokens for a single model');
    expect(p).toContain('with or without a membership');
    expect(p).toContain('500M, 1,000M, 5,000M and 15,000M tokens');
    expect(p).toContain('only works with the model it was bought for');
    expect(p).toContain('pay 5% less on every pack');
  });

  test('6-month expiry extending the whole balance', () => {
    expect(p).toContain('valid for 6 months from your last purchase for that model');
    expect(p).toContain('extends the whole remaining balance of that model');
    expect(p).toContain('Expired tokens are lost');
  });

  test('how a pack is drawn with and without a membership, and what it does not include', () => {
    expect(p).toContain('only used once your monthly or period allowance for that model is used up');
    expect(p).toContain('the allowance keeps resetting as usual');
    expect(p).toContain('every token you use is drawn from your pack balance for that model');
    expect(p).toContain('do not include Discord, Spaces, image generation, the MCP endpoint');
    expect(p).toContain('grace period the balance is paused and the expiry date keeps running');
  });

  // §1.3 and §3.2: the perk and the allowance-first draw are Inference,
  // Premium and Gentle only; a Community member pays list price and draws
  // every token from the pack balance, like an account without a membership.
  test('names the plans with the 5% perk and the allowance-first draw (never Community)', () => {
    expect(p).toContain('Members with an active Inference, Premium or Gentle subscription pay 5% less on every pack');
    expect(p).toContain('With an active Inference, Premium or Gentle subscription, pack tokens are only used once');
    expect(p).toContain('Without one (including a Community membership), every token you use is drawn from your pack balance');
    expect(p).not.toContain('Members with an active subscription pay 5% less');
    expect(p).not.toContain('With a membership, pack tokens');
    expect(para(src, 'token-packs-holds')).toContain('if you have no active Inference, Premium or Gentle subscription, your API key is revoked');
  });

  // §2: while glm5.3 is not sold as a pack (flag off), a v1 glm5.3 balance
  // is only usable by a subscribed premium member.
  test('a premium-model balance from an earlier offer needs the premium tier', () => {
    expect(p).toContain(
      'A balance for a premium model bought under an earlier offer can only be used while you have an active Premium subscription, as long as that model is not sold as a pack',
    );
  });

  test('a payment completed after the checkout session expired is refunded', () => {
    expect(para(src, 'token-packs-refunds')).toContain('completes after the checkout expired');
  });

  test('EUR catalogue and the USD rule', () => {
    expect(p).toContain('Prices are in euros');
    expect(p).toContain('already set to US dollars');
    expect(p).toContain('euro price times 1.08, rounded up to the whole dollar');
    expect(p).toContain('Prices are shown before purchase and include taxes; no VAT is added');
  });

  test('no refunds, waiver, purchase limits and uncredited refunds', () => {
    expect(all).toContain('Token packs are non-refundable');
    expect(all).toContain('supplied immediately at your express request');
    expect(all).toContain('you lose your right of withdrawal once they are supplied');
    expect(all).toContain('removes the tokens credited by that purchase');
    expect(all).toContain('per day per account and per card');
    expect(all).toContain('refunded in full and no tokens are added');
    expect(all).toContain('concurrency, rate limits and fair use');
  });

  test('holds and bans', () => {
    const h = para(src, 'token-packs-holds');
    expect(h).toContain('disputed or flagged as possible fraud');
    expect(h).toContain('all pack balances are frozen');
    expect(h).toContain('your API key is revoked until the hold is resolved');
    expect(h).toContain('remaining pack balance is forfeited without refund');
  });

  test('automatic recharge: consent, cap, rate, retries, euros only', () => {
    const a = para(src, 'token-packs-auto-recharge');
    expect(a).toContain('off by default');
    expect(a).toContain('explicit acceptance');
    expect(a).toContain('charges nothing by itself');
    expect(a).toContain('monthly cap you set (10 euros by default)');
    expect(a).toContain('3 automatic recharges per 24 hours');
    expect(a).toContain('after 1 hour, 24 hours and 72 hours');
    expect(a).toContain('confirm it within 72 hours');
    expect(a).toContain('available in euros only');
    expect(a).toContain('turn it off at any time');
  });

  test('never writes token amounts in B, and drops the v1 membership-only rule', () => {
    expect(all).not.toMatch(/\d\s?B\b/);
    expect(all).not.toContain('only usable while you have an active inference membership');
  });
});

describe('terms: token packs v2 (ES)', () => {
  const src = flat('es/terms.astro');
  const p = para(src, 'token-packs');
  const all = allPacks(src);

  test('sits under "Membresía y pagos"', () => sitsUnder(src, 'Membresía y pagos'));

  test('catálogo, saldo por modelo y con o sin membresía', () => {
    expect(p).toContain('compra única de tokens para un solo modelo');
    expect(p).toContain('con o sin membresía');
    expect(p).toContain('500M, 1.000M, 5.000M y 15.000M tokens');
    expect(p).toContain('solo funciona con el modelo para el que se compró');
    expect(p).toContain('pagan un 5% menos en cada paquete');
  });

  test('caducidad de 6 meses que amplía todo el saldo', () => {
    expect(p).toContain('válidos durante 6 meses desde tu última compra para ese modelo');
    expect(p).toContain('amplía todo el saldo restante de ese modelo');
    expect(p).toContain('Los tokens caducados se pierden');
  });

  test('consumo con y sin membresía, y lo que no incluye', () => {
    expect(p).toContain('solo se usan cuando has agotado tu cuota mensual o del periodo para ese modelo');
    expect(p).toContain('la cuota se sigue renovando con normalidad');
    expect(p).toContain('cada token que usas se descuenta de tu saldo de ese modelo');
    expect(p).toContain('no incluyen Discord, Spaces, generación de imágenes, el endpoint MCP');
    expect(p).toContain('periodo de gracia, el saldo queda en pausa y la fecha de caducidad sigue corriendo');
  });

  test('nombra los planes con el 5% y con la cuota primero (nunca Community)', () => {
    expect(p).toContain('Los miembros con una suscripción activa a Inference, Premium o Gentle pagan un 5% menos en cada paquete');
    expect(p).toContain('Con una suscripción activa a Inference, Premium o Gentle, los tokens de un paquete solo se usan');
    expect(p).toContain('Sin ella (también con una membresía Community), cada token que usas se descuenta de tu saldo');
    expect(p).not.toContain('Los miembros con una suscripción activa pagan');
    expect(p).not.toContain('Con membresía, los tokens');
    expect(para(src, 'token-packs-holds')).toContain(
      'si no tienes una suscripción activa a Inference, Premium o Gentle, tu clave de API se revoca',
    );
  });

  test('un saldo de un modelo premium de una oferta anterior necesita el nivel premium', () => {
    expect(p).toContain(
      'Un saldo de un modelo premium comprado con una oferta anterior, mientras ese modelo no se venda como paquete, solo se puede usar con una suscripción Premium activa',
    );
  });

  test('un pago completado tras caducar la sesión de pago se reembolsa', () => {
    const r = para(src, 'token-packs-refunds');
    expect(r).toContain('después de que la sesión de pago haya caducado');
    expect(r).not.toContain('después de que el pago haya caducado');
  });

  test('catálogo en euros y regla del dólar', () => {
    expect(p).toContain('Los precios están en euros');
    expect(p).toContain('ya está en dólares estadounidenses');
    expect(p).toContain('precio en euros por 1,08, redondeado al alza al dólar entero');
    expect(p).toContain('Los precios se muestran antes de la compra e incluyen impuestos; no se añade IVA');
  });

  test('sin reembolsos, desistimiento, límites y reembolsos sin abono', () => {
    expect(all).toContain('Los paquetes de tokens no son reembolsables');
    expect(all).toContain('se suministran de inmediato a petición expresa tuya');
    expect(all).toContain('pierdes tu derecho de desistimiento una vez suministrados');
    expect(all).toContain('retira los tokens abonados por esa compra');
    expect(all).toContain('al día por cuenta y por tarjeta');
    expect(all).toContain('se reembolsa íntegramente y no se abona ningún token');
    expect(all).toContain('concurrencia, límites de peticiones y uso razonable');
  });

  test('retenciones y bloqueos', () => {
    const h = para(src, 'token-packs-holds');
    expect(h).toContain('se disputa o el emisor de la tarjeta lo marca como posible fraude');
    expect(h).toContain('todos los saldos de paquetes quedan congelados');
    expect(h).toContain('tu clave de API se revoca hasta que se resuelva la retención');
    expect(h).toContain('el saldo restante de paquetes se pierde sin reembolso');
  });

  test('recarga automática: consentimiento, tope, ritmo, reintentos, solo euros', () => {
    const a = para(src, 'token-packs-auto-recharge');
    expect(a).toContain('desactivada por defecto');
    expect(a).toContain('aceptación expresa');
    expect(a).toContain('no cobra nada por sí misma');
    expect(a).toContain('tope mensual que tú fijas (10 euros por defecto)');
    expect(a).toContain('3 recargas automáticas cada 24 horas');
    expect(a).toContain('tras 1 hora, 24 horas y 72 horas');
    expect(a).toContain('confirmarlo en un plazo de 72 horas');
    expect(a).toContain('solo está disponible en euros');
    expect(a).toContain('desactivarla en cualquier momento');
  });

  test('nunca escribe cantidades en B ni "billón", y quita la regla v1 de membresía', () => {
    expect(all).not.toMatch(/\d\s?B\b/);
    expect(all).not.toMatch(/bill[oó]n/i);
    expect(all).not.toMatch(/1,000M|5,000M|15,000M/);
    expect(all).not.toContain('solo se pueden usar mientras tengas una membresía de inferencia activa');
  });
});

describe('terms: last updated', () => {
  test.each(['terms.astro', 'es/terms.astro'])('%s', (f) => {
    expect(flat(f)).toContain('updated="November 3, 2026"');
  });
});
