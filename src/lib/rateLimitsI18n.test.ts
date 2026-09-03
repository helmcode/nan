import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  formatTokens,
  rateLimitsLabels,
  windowedModelBody,
  windowedModelHeadline,
  type WindowedModelLimits,
} from './rateLimits';

/**
 * The rate limits card is embedded from both the English and the Spanish
 * guides. Its labels started out Spanish, were translated to English to stop
 * them leaking into /docs, and then rendered English on /es/docs instead: one
 * language always lost, because the component had no locale at all.
 *
 * The existing guard only looked one way, for Spanish inside English files, so
 * it could not see the second half of that. These tests check both directions
 * on the same strings.
 */

const model: WindowedModelLimits = {
  model: 'glm5.3',
  windowHours: 4,
  windowTokens: 400_000_000,
  periodCapTokens: 3_000_000_000,
  contextTokens: 1_000_000,
  maxParallel: 5,
};

/** Words that can only be one language, never a shared token like "min" or "API". */
const ENGLISH = ['requests', 'parallel', 'concurrent', 'allowance', 'billing', 'rolling', 'window'];
const SPANISH = ['peticiones', 'paralelo', 'concurrentes', 'cuota', 'facturación', 'móvil', 'ventana'];

/**
 * Whole words only: "concurrentes" contains "concurrent", and matching on
 * substrings flagged the Spanish copy as English on its first run.
 */
function wordsIn(text: string, words: string[]): string[] {
  return words.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text));
}

function visible(lang: 'en' | 'es'): string {
  const t = rateLimitsLabels(lang);
  return [
    t.perKey,
    t.requestsPerMin,
    t.maxParallel,
    t.concurrent,
    t.premium,
    t.window(model.windowHours),
    t.allowance,
    t.context,
    t.concurrentRequests,
    t.tokensPerModel,
    t.requestsPerModel,
    windowedModelHeadline(model, lang),
    windowedModelBody(model, lang),
  ]
    .join(' ')
    .toLowerCase();
}

describe('the rate limits card speaks the language of the page', () => {
  it('says nothing in Spanish on the English pages', () => {
    const text = visible('en');
    expect(wordsIn(text, SPANISH)).toEqual([]);
  });

  it('says nothing in English on the Spanish pages', () => {
    const text = visible('es');
    expect(wordsIn(text, ENGLISH)).toEqual([]);
  });

  it('translates every label, leaving none identical by accident', () => {
    const en = rateLimitsLabels('en');
    const es = rateLimitsLabels('es');
    const shared = Object.keys(en).filter(
      (k) => typeof en[k as keyof typeof en] === 'string' && en[k as keyof typeof en] === es[k as keyof typeof es],
    );
    expect(shared, `untranslated: ${shared.join(', ')}`).toEqual([]);
  });

  it('writes the thousands separator the way the rest of the page does', () => {
    expect(formatTokens(3_000_000_000, 'en')).toBe('3,000M');
    expect(formatTokens(3_000_000_000, 'es')).toBe('3.000M');
    expect(formatTokens(400_000_000, 'es')).toBe('400M');
  });

  it('keeps the numbers out of the translation, so both locales quote the same limits', () => {
    for (const lang of ['en', 'es'] as const) {
      expect(windowedModelHeadline(model, lang)).toContain('400M');
      expect(rateLimitsLabels(lang).window(4)).toContain('4');
    }
  });
});

/**
 * The component must not reintroduce literals: every label it shows has to come
 * from the table above, or the next translation will miss whatever was inlined.
 */
describe('the card renders no hardcoded copy', () => {
  it('routes every visible label through rateLimitsLabels', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../components/docs/RateLimits.astro'), 'utf-8');
    const markup = source.slice(source.lastIndexOf('---') + 3);
    const literals = [
      ...markup.matchAll(/<dt[^>]*>([^<{][^<]*)</g),
      ...markup.matchAll(/>\s*([A-Za-z][A-Za-z /]{6,})\s*</g),
    ].map((m) => m[1].trim());
    expect(literals, `inlined: ${literals.join(' | ')}`).toEqual([]);
  });
});
