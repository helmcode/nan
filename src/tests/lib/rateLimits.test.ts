import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_RATE_LIMITS,
  formatTokens,
  getRateLimitsConfig,
  modelTokensPerMinute,
  windowedModelBody,
  windowedModelHeadline,
  windowedModelNote,
} from '../../lib/rateLimits';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The published numbers for glm5.3, and the reason this file exists.
 *
 * docs/api#rate-limits used to have no row at all for glm5.3 while the model
 * was already being served, so the only limits a premium member could read
 * were the ones that do not apply to them. These asserts pin the four numbers
 * to what the platform actually enforces:
 *
 *   context 1,048,576      cloud-api usage_quota.go modelRateLimits
 *   concurrency 5          idem, and the ratelimit hook
 *   400M per rolling 4h    ratelimit hook ROLLING_WINDOW_S / rolling budget
 *   3,000M per period      cloud-api usage_quota.go monthlyTokenCaps
 *
 * If any of them moves upstream, this test has to be updated in the same
 * change: the failure is the point.
 */
const GLM = {
  contextTokens: 1_048_576,
  maxParallel: 5,
  windowHours: 4,
  windowTokens: 400_000_000,
  periodCapTokens: 3_000_000_000,
};

describe('formatTokens rounds DOWN', () => {
  // 1_500_000, not the live 1_048_576: the live value renders "1M" whether
  // the formatter floors or rounds, so an assert on it cannot fail if the
  // guard is removed. This is the smallest value that tells them apart.
  //
  // It matters more here than in the member portal. `roundingMode` is an
  // Intl.NumberFormat option, and a runtime that does not support it IGNORES
  // IT SILENTLY — no error, just rounding again. So this is not "is the word
  // still in the source", it is "does this runtime actually floor", and only
  // an assert can answer that.
  it('never advertises more than the backend allows', () => {
    expect(formatTokens(1_500_000)).toBe('1M');
    expect(formatTokens(1_900_000)).toBe('1M');
    expect(formatTokens(1_500_000, 'es')).toBe('1M');
  });

  it('leaves the other published figures untouched', () => {
    expect(formatTokens(1_048_576)).toBe('1M');
    expect(formatTokens(3_000_000_000)).toBe('3,000M');
    expect(formatTokens(3_000_000_000, 'es')).toBe('3.000M');
    expect(formatTokens(400_000_000)).toBe('400M');
  });
});

describe('rateLimits — glm5.3 windowed limits', () => {
  const glm = DEFAULT_RATE_LIMITS.windowedModels.find((m) => m.model === 'glm5.3');

  test('glm5.3 is published', () => {
    expect(glm).toBeDefined();
  });

  test('publishes the four enforced limits', () => {
    expect(glm).toMatchObject(GLM);
  });

  /**
   * It keeps its own block rather than a row in the table: the rolling window
   * is what a premium member plans against. It is NOT absent because it has no
   * per-minute ceiling - it has one, and the block now publishes it.
   */
  test('keeps its own block instead of a row in the per-minute table', () => {
    const perMinute = DEFAULT_RATE_LIMITS.tokensPerMinuteByModel;
    expect(perMinute.map((m) => m.model)).not.toContain('glm5.3');
  });

  test('getRateLimitsConfig keeps the windowed models when env overrides the per-key values', () => {
    const config = getRateLimitsConfig({ RATE_LIMIT_RPM: '120', RATE_LIMIT_PARALLEL: '9' });
    expect(config.perKey).toEqual({ requestsPerMinute: 120, maxParallel: 9 });
    expect(config.windowedModels).toEqual(DEFAULT_RATE_LIMITS.windowedModels);
  });
});

describe('formatTokens', () => {
  test('writes the numbers the way every surface publishes them', () => {
    expect(formatTokens(GLM.contextTokens)).toBe('1M');
    expect(formatTokens(500_000)).toBe('500K');
    expect(formatTokens(GLM.windowTokens)).toBe('400M');
    expect(formatTokens(GLM.periodCapTokens)).toBe('3,000M');
  });

  test('leaves small counts alone', () => {
    expect(formatTokens(999)).toBe('999');
  });
});

describe('the window wording', () => {
  const glm = DEFAULT_RATE_LIMITS.windowedModels[0];

  test('the headline carries the number and the window length', () => {
    expect(windowedModelHeadline(glm)).toBe('400M tokens per rolling 4 hours');
  });

  test('says it is reached first, is rolling, and when the allowance resets', () => {
    const body = windowedModelBody(glm);
    expect(body).toContain('reaches first');
    expect(body).toContain('rolling window, not a daily reset');
    expect(body).toContain('when your billing period starts');
    // The one case where the allowance is not the full 3,000M.
    expect(body).toContain('prorated');
  });

  test('the paragraph served by /api/docs is the same sentence the page shows', () => {
    expect(windowedModelNote(glm)).toBe(`${windowedModelHeadline(glm)} ${windowedModelBody(glm)}`);
  });

  test('no em-dashes in member-facing copy', () => {
    expect(windowedModelNote(glm)).not.toContain('—');
  });
});

/**
 * The per-minute ceilings, pinned to the platform that enforces them.
 *
 * This file used to publish "1.5M tpm" for four models and nothing at all for
 * two more. Not one of the four was right: the real ceilings were 6.3M, 4.2M,
 * 3.1M and 1.0M, and gemma4's was BELOW the advertised figure, so a member
 * planning against the page got 429s the page said were impossible.
 *
 * It went unnoticed because the number was a hand-typed string. cloud-api does
 * not store a tokens-per-minute figure at all: `modelRateLimits` in
 * usage_quota.go stores a context window and a FillsPerMin, and the ceiling is
 * the product. The rate-limit hook mirrors the same two factors in
 * FALLBACK_MODEL_LIMITS, and the three tables are required to agree - a
 * divergence shows up as intermittent 429s depending on which worker took the
 * request.
 *
 * So this pins the FACTORS, not the product. If any of them moves upstream,
 * this test has to move in the same change: the failure is the point, and it is
 * the only thing standing between a policy change and a page that quietly lies
 * about it.
 */
describe('the per-minute ceilings mirror cloud-api', () => {
  /** cloud-api internal/handlers/usage_quota.go, `modelRateLimits`. */
  const BACKEND: Record<string, { contextTokens: number; fillsPerMinute: number }> = {
    'deepseek-v4-flash': { contextTokens: 1_048_576, fillsPerMinute: 6 },
    'qwen3.8-flash': { contextTokens: 1_048_576, fillsPerMinute: 6 },
    'glm5.3-flash': { contextTokens: 1_048_576, fillsPerMinute: 11 },
    'mimo-v2.5': { contextTokens: 1_050_000, fillsPerMinute: 4 },
    'qwen3.6': { contextTokens: 262_144, fillsPerMinute: 12 },
    'gemma4': { contextTokens: 262_144, fillsPerMinute: 4 },
    'glm5.3': { contextTokens: 1_048_576, fillsPerMinute: 11 },
  };

  /** cloud-api `rateLimitExemptModels`, mirrored in the hook's FALLBACK_EXEMPT_MODELS. */
  const BACKEND_EXEMPT = ['kokoro', 'whisper', 'qwen3-embedding', 'rerank'];

  const published = [
    ...DEFAULT_RATE_LIMITS.tokensPerMinuteByModel,
    ...DEFAULT_RATE_LIMITS.windowedModels,
  ];

  test.each(Object.keys(BACKEND))('%s carries the factors the platform enforces', (model) => {
    const row = published.find((m) => m.model === model);
    expect(row, `${model} is served but carries no published limit`).toBeDefined();
    expect(row!.contextTokens, `${model}: context window`).toBe(BACKEND[model].contextTokens);
    expect(row!.fillsPerMinute, `${model}: fills per minute`).toBe(BACKEND[model].fillsPerMinute);
  });

  test('the ceiling is the product, never a figure of its own', () => {
    for (const m of published) {
      expect(modelTokensPerMinute(m), m.model).toBe(m.contextTokens * m.fillsPerMinute);
    }
  });

  test('the exempt list is the backend list', () => {
    expect([...DEFAULT_RATE_LIMITS.exemptModels].sort()).toEqual([...BACKEND_EXEMPT].sort());
  });

  /**
   * The rule that would have caught the original hole: two of the models above
   * were simply absent, and an absent row is indistinguishable from a model
   * with no limit. Every model the catalogue publishes has to be accounted
   * for somewhere, so adding one to /docs/models without a limit fails here.
   */
  test('every model in the catalogue is accounted for', () => {
    const catalogue = JSON.parse(
      readFileSync(resolve(here, '../../data/modelos.json'), 'utf-8'),
    ) as { categorias: Array<{ id: string; modelos: Array<{ id: string }> }> };

    // Image generation goes to /images/generations and carries no published
    // per-minute policy of its own; cloud-api has no row for it either, so it
    // falls to defaultRateLimit. Listed explicitly rather than skipped, so it
    // is a decision on the record and not an omission.
    const NOT_PUBLISHED = ['flux-2-klein', 'minimax-h3'];

    const accounted = new Set([
      ...published.map((m) => m.model),
      ...DEFAULT_RATE_LIMITS.exemptModels,
      ...NOT_PUBLISHED,
    ]);

    const orphans = catalogue.categorias
      .flatMap((c) => c.modelos.map((m) => m.id))
      .filter((id) => !accounted.has(id));

    expect(
      orphans,
      `served with no published limit and no reason given: ${orphans.join(', ')}`,
    ).toEqual([]);
  });
});
