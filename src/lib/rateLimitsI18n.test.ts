import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_RATE_LIMITS,
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
    t.tokensPerMin,
    t.tokensPerModel,
    t.exempt,
    t.noOwnLimit,
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

/**
 * "LIMITS ARE PER API KEY, NOT PER MODEL" WAS FALSE WHILE IT WAS PUBLISHED.
 *
 * Both the quickstart and the introduction said it, in both languages, while
 * this very module published two per-model tables and /docs/models put a `RPM`
 * row on the qwen3-embedding, kokoro and whisper cards. A member planning a
 * batch job against "the limit is 60 rpm on your key" hits `rerank` at a
 * different ceiling, or whisper at a much lower one, and nothing in the
 * sentence they read prepares them for it.
 *
 * The check is conditional on the config rather than on a fixed phrase list
 * being absent forever: the day the per-model tables are genuinely emptied,
 * the sentence becomes true again and this stops objecting to it.
 */
describe('no guide denies the per-model limits this module publishes', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const LOCALES = ['docs', 'docs-es'] as const;

  /** Claims of exclusivity, in both languages. Substrings, lowercased. */
  const DENIALS = [
    'not per model',
    'no por modelo',
    'only per api key',
    'solo por api key',
    'sólo por api key',
  ];

  const perModel = DEFAULT_RATE_LIMITS.tokensPerMinuteByModel.length;

  it.each(LOCALES)('%s', (locale) => {
    if (perModel === 0) return;
    const dir = resolve(here, `../content/${locale}`);
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /\.mdx?$/.test(f))) {
      const body = readFileSync(resolve(dir, file), 'utf-8').replace(/\r\n/g, '\n').toLowerCase();
      for (const denial of DENIALS) {
        if (body.includes(denial)) offenders.push(`${file}: "${denial}"`);
      }
    }
    expect(
      offenders,
      `${perModel} models carry a limit of their own, so no page can say otherwise:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});

/**
 * WHEN A SPENT QUOTA COMES BACK depends on the model, and the quickstart said
 * it did not.
 *
 * /docs/choose-a-model publishes two different periods in the same column:
 * `/month`, which is the calendar month, and `/billing period`, which is
 * whatever day Stripe renews on and which only `glm5.3` uses. The quickstart
 * answered the `402` with one sentence for both - "the counter goes back to
 * zero when your billing period starts" - which is right for one model out of
 * twelve and wrong for the rest by up to a month. It is also the sentence a
 * member reads at the exact moment they are blocked and deciding whether to
 * wait.
 *
 * So: if the catalogue page publishes both kinds of period, the page that
 * explains the error has to name both too.
 */
describe('the quickstart explains both quota periods, because both exist', () => {
  const here = dirname(fileURLToPath(import.meta.url));

  const CASES = {
    docs: {
      quotaKinds: ['/month', '/billing period'],
      mustName: ['calendar month', 'Stripe'],
    },
    'docs-es': {
      quotaKinds: ['/mes', '/periodo de facturación'],
      mustName: ['mes natural', 'Stripe'],
    },
  } as const;

  it.each(Object.keys(CASES) as Array<keyof typeof CASES>)('%s', (locale) => {
    const read = (file: string) =>
      readFileSync(resolve(here, `../content/${locale}/${file}`), 'utf-8').replace(/\r\n/g, '\n');

    const catalogue = read('choose-a-model.md');
    const published = CASES[locale].quotaKinds.filter((k) => catalogue.includes(`tokens${k}`));
    expect(published, `${locale}: the quota column no longer publishes both periods`).toHaveLength(
      2,
    );

    const quickstart = read('getting-started.mdx');
    for (const term of CASES[locale].mustName) {
      expect(
        quickstart,
        `${locale}: two quota periods exist and the 402 explanation never mentions "${term}"`,
      ).toContain(term);
    }
  });
});
