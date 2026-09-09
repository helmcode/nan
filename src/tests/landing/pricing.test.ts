import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t, tArr, tObj } from '../../lib/i18n';
import enData from '../../../i18n/en.json' with { type: 'json' };
import esData from '../../../i18n/es.json' with { type: 'json' };

/**
 * La sección de precios es lo que un prospecto lee ANTES de pagar, así que su
 * copy es el que tiene que ser cierto primero. Estaba vendiendo un producto que
 * ya no existe:
 *
 *   - "1,000M token monthly allowance" cuando el tope es 3,000M.
 *   - "Access granted immediately after billing", la promesa exacta que se quitó
 *     del portal de miembros por ser falsa (el grant puede quedarse pendiente, y
 *     la API tiene un estado explícito para decirlo).
 *   - un tier `nan_member · usa / latam — $75`, cuando a cada alta nueva se le
 *     cobran 70€ en cualquier región, así que el precio y la moneda cambiaban
 *     entre la tarjeta y el Checkout.
 *
 * Ese último se coló DOS veces porque las comprobaciones de moneda solo cubrían
 * `memberCond`: community siguió publicando `$14.99` después de que
 * communityPriceForNewCustomer de cloud-api empezara a cobrar 14,99€ desde
 * cualquier región. Ahora se comprueba cada tier de pago de la sección, importe y
 * condición, para que una moneda que solo se mueve en un funnel no vuelva a pasar.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../components/nan/home/Pricing.astro'), 'utf-8');
const locales = ['en', 'es'] as const;

/** Los objetos de tier que renderiza la sección, tal como están escritos en el frontmatter. */
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
    const first = tiers.indexOf("name: 'nan_member · glm 5.3 premium'");
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
    // La tarjeta tiene que aterrizar en el formulario restaurado (con el ancla
    // #signup), no en cloud.nan.builders (que no tiene formulario de alta). Se
    // comprueba el ternario completo para cazar una regresión en la rama EN (else
    // '/#pricing') y que no la tape la subcadena ES, que también lleva '/community#signup'.
    expect(tiers).toMatch(/href: lang === 'es' \? '\/es\/community#signup' : '\/community#signup'/);
    expect(tiers).not.toMatch(/cloud\.nan\.builders/);
  });

  /**
   * Nada en la sección puede citar un importe en dólares: los tres Checkouts se
   * crean en EUR para cualquier región. Las suscripciones legacy en USD son
   * reales y siguen explicadas en la FAQ de métodos de pago, que no es este fichero.
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

/** Cada string de un diccionario, indexado por su ruta con puntos. */
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
 * Los dos arreglos que guarda este fichero fueron los dos "una tarjeta de precio
 * conservaba una moneda que el Checkout había dejado de usar", encontrados tier
 * a tier por un revisor leyendo las páginas. Por eso el barrido es sobre el
 * diccionario entero, no sobre las claves que se reportaron: cualquier superficie
 * NUEVA que cite un importe en dólares falla aquí sin que nadie tenga que
 * acordarse de añadirle una comprobación.
 *
 * La palabra "dollars" en prosa sigue siendo legal, porque las suscripciones
 * legacy en USD son reales y la FAQ de métodos de pago tiene que seguir diciéndolo.
 * Lo que no puede aparecer es un IMPORTE en dólares: ahora todo Checkout se crea en EUR.
 */
describe('i18n — no price is quoted in a currency we do not charge', () => {
  test.each(locales)('%s quotes no dollar amount anywhere', (locale) => {
    const offenders = [...dictionaries[locale]]
      .filter(([, value]) => /\$\s?\d/.test(value))
      .map(([key, value]) => `${key}: ${value}`);
    expect(offenders).toEqual([]);
  });

  /**
   * El diccionario `community` de primer nivel ya no tiene consumidor: /community
   * lleva el copy hardcodeado y enlaza a la sección `#pricing` de la home en vez
   * de imprimir un importe. Estas dos claves aún llevaban `$14.99` y la coletilla
   * "(€14.99) in the EU", así que se arreglan y se comprueban en vez de dejar que
   * salgan caducadas el día que esa página vuelva a tener tarjeta de precio.
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

/** Todas las respuestas de la FAQ de un locale, unidas. tArr() descarta objetos, así que tObj(). */
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
    // Lo que dice en su lugar, con la misma redacción que el portal.
    expect(copy).toMatch(/few minutes after payment|pocos minutos después del pago/);
  });

  test('publishes the 4h window before the purchase, not only after it', () => {
    const copy = premium().join(' ');
    expect(copy).toMatch(/400M/);
    expect(copy).toMatch(/4h/);
  });

  test('publishes context and concurrency', () => {
    const copy = premium().join(' ');
    expect(copy).toMatch(/1M context|Contexto de 1M/);
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
   * Los dos funnels de pago cobran EUR desde cualquier región, así que las dos
   * condiciones tienen que decirlo. Assertar solo `memberCond` es lo que dejó a
   * community con la coletilla "in the EU", que a un prospecto de fuera de la UE
   * le decía que el euro no iba con él justo antes de un Checkout en EUR.
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
   * Los 3,000M de glm5.3 son la única cuota que NO es mes natural: se reinicia
   * con el periodo de facturación de Stripe, y por eso el portal y las docs
   * dejaron de decir "monthly". La respuesta lo metía en el mismo saco que las
   * cuotas de DeepSeek y MiMo, que sí son mensuales, bajo un único "monthly allowance".
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
