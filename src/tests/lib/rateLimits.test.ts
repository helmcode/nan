import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RATE_LIMITS,
  formatTokens,
  getRateLimitsConfig,
  windowedModelBody,
  windowedModelHeadline,
  windowedModelNote,
} from '../../lib/rateLimits';

/**
 * The published numbers for glm5.2, and the reason this file exists.
 *
 * docs/api#rate-limits used to have no row at all for glm5.2 while the model
 * was already being served, so the only limits a premium member could read
 * were the ones that do not apply to them. These asserts pin the four numbers
 * to what the platform actually enforces:
 *
 *   context 500,000        cloud-api usage_quota.go modelRateLimits
 *   concurrency 5          idem, and the ratelimit hook
 *   400M per rolling 4h    ratelimit hook ROLLING_WINDOW_S / rolling budget
 *   3,000M per period      cloud-api usage_quota.go monthlyTokenCaps
 *
 * If any of them moves upstream, this test has to be updated in the same
 * change: the failure is the point.
 */
const GLM = {
  contextTokens: 500_000,
  maxParallel: 5,
  windowHours: 4,
  windowTokens: 400_000_000,
  periodCapTokens: 3_000_000_000,
};

describe('rateLimits — glm5.2 windowed limits', () => {
  const glm = DEFAULT_RATE_LIMITS.windowedModels.find((m) => m.model === 'glm5.2');

  test('glm5.2 is published', () => {
    expect(glm).toBeDefined();
  });

  test('publishes the four enforced limits', () => {
    expect(glm).toMatchObject(GLM);
  });

  test('is absent from the per-minute tables, which do not gate it', () => {
    const perMinute = [
      ...DEFAULT_RATE_LIMITS.tokensPerMinuteByModel,
      ...DEFAULT_RATE_LIMITS.requestsPerMinuteByModel,
    ];
    expect(perMinute.map((m) => m.model)).not.toContain('glm5.2');
  });

  test('getRateLimitsConfig keeps the windowed models when env overrides the per-key values', () => {
    const config = getRateLimitsConfig({ RATE_LIMIT_RPM: '120', RATE_LIMIT_PARALLEL: '9' });
    expect(config.perKey).toEqual({ requestsPerMinute: 120, maxParallel: 9 });
    expect(config.windowedModels).toEqual(DEFAULT_RATE_LIMITS.windowedModels);
  });
});

describe('formatTokens', () => {
  test('writes the numbers the way every surface publishes them', () => {
    expect(formatTokens(GLM.contextTokens)).toBe('500K');
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
