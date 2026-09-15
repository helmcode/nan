import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RATE_LIMITS,
  getRateLimitsConfig,
  perKeyOuterCapValue,
  premiumConcurrency,
} from './rateLimits';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRateLimitsConfig', () => {
  it('falls back to the defaults when the vars are absent', () => {
    expect(getRateLimitsConfig({})).toEqual(DEFAULT_RATE_LIMITS);
  });

  it('reads both per-key limits from the env', () => {
    const config = getRateLimitsConfig({
      RATE_LIMIT_RPM: '120',
      RATE_LIMIT_PARALLEL: '8',
    });
    // The env moves the two env-driven fields; the outer ceiling per tier is a
    // code constant (LiteLLM enforces it on the key) and stays put.
    expect(config.perKey).toEqual({
      ...DEFAULT_RATE_LIMITS.perKey,
      requestsPerMinute: 120,
      maxParallel: 8,
    });
  });

  it('leaves the per-model tables untouched', () => {
    const config = getRateLimitsConfig({ RATE_LIMIT_RPM: '120' });
    expect(config.tokensPerMinuteByModel).toEqual(DEFAULT_RATE_LIMITS.tokensPerMinuteByModel);
    expect(config.requestsPerMinuteByModel).toEqual(DEFAULT_RATE_LIMITS.requestsPerMinuteByModel);
    expect(config.concurrencyByModel).toEqual(DEFAULT_RATE_LIMITS.concurrencyByModel);
  });

  it.each(['0', '-1', 'abc', '1.5', '60rpm'])(
    'ignores the invalid value %s and warns instead of taking the docs down',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = getRateLimitsConfig({ RATE_LIMIT_RPM: raw });
      expect(config.perKey.requestsPerMinute).toBe(DEFAULT_RATE_LIMITS.perKey.requestsPerMinute);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it('treats an empty string as absent, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = getRateLimitsConfig({ RATE_LIMIT_PARALLEL: '  ' });
    expect(config.perKey.maxParallel).toBe(DEFAULT_RATE_LIMITS.perKey.maxParallel);
    expect(warn).not.toHaveBeenCalled();
  });

  it('defaults to the values main settled on: 60 rpm, legacy flat cap 5, outer ceiling 7/10', () => {
    // maxParallel stays in the data model for RATE_LIMIT_PARALLEL env-override
    // compatibility, but no published surface renders it any more. The real
    // per-key ceiling is tierMaxParallel: LiteLLM caps the key at 7 (base) /
    // 10 (premium) across ALL models combined, and the per-key card publishes it.
    expect(DEFAULT_RATE_LIMITS.perKey).toEqual({
      requestsPerMinute: 60,
      maxParallel: 5,
      tierMaxParallel: { inference: 7, premium: 10 },
    });
  });
});

describe('the per-key outer ceiling', () => {
  it('publishes the key-level cap in the member vocabulary, both locales', () => {
    // The exact value the per-key card renders next to the "Across all
    // models" / "En todos los modelos" label: LiteLLM caps the KEY at
    // max_parallel_requests across all models combined, so a base member who
    // sums the per-model allowances (7+7+5+5) plans past it and hits an
    // unexplained 429 unless this is published.
    expect(perKeyOuterCapValue(DEFAULT_RATE_LIMITS.perKey, 'en')).toBe(
      '7 (base plan) · 10 (premium plan) simultaneous requests per key',
    );
    expect(perKeyOuterCapValue(DEFAULT_RATE_LIMITS.perKey, 'es')).toBe(
      '7 (plan base) · 10 (plan premium) peticiones simultáneas por key',
    );
  });
});

describe('per-model concurrency', () => {
  const TIERED = ['glm5.3', 'glm5.3-flash', 'deepseek-v4-flash', 'qwen3.8-flash'];

  it('keeps the flat default at 5 for every model, the tiered ones included', () => {
    for (const c of DEFAULT_RATE_LIMITS.concurrencyByModel) {
      expect(c.maxParallel, c.model).toBe(5);
    }
  });

  it('raises the four frontier models to 7 (inference) / 10 (premium)', () => {
    for (const model of TIERED) {
      const entry = DEFAULT_RATE_LIMITS.concurrencyByModel.find((c) => c.model === model);
      expect(entry, model).toBeDefined();
      expect(entry!.tierMaxParallel).toEqual({ inference: 7, premium: 10 });
    }
  });

  it('leaves every other model at the flat default, with no tier variant', () => {
    const rest = DEFAULT_RATE_LIMITS.concurrencyByModel.filter((c) => !TIERED.includes(c.model));
    expect(rest.length).toBeGreaterThan(0);
    for (const c of rest) {
      expect(c.maxParallel, c.model).toBe(5);
      expect(c.tierMaxParallel, c.model).toBeUndefined();
    }
  });

  it('resolves the premium number the premium card publishes', () => {
    expect(premiumConcurrency(DEFAULT_RATE_LIMITS, 'glm5.3', 5)).toBe(10);
    // A model without a tier variant falls back to the flat default.
    expect(premiumConcurrency(DEFAULT_RATE_LIMITS, 'mimo-v2.5', 5)).toBe(5);
  });
});
