import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RATE_LIMITS, getRateLimitsConfig } from './rateLimits';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRateLimitsConfig', () => {
  it('falls back to the defaults when the vars are absent', () => {
    expect(getRateLimitsConfig({})).toEqual(DEFAULT_RATE_LIMITS);
  });

  it('reads both per-key limits from the env', () => {
    const config = getRateLimitsConfig({
      PUBLIC_RATE_LIMIT_RPM: '120',
      PUBLIC_RATE_LIMIT_PARALLEL: '8',
    });
    expect(config.perKey).toEqual({ requestsPerMinute: 120, maxParallel: 8 });
  });

  it('leaves the per-model tables untouched', () => {
    const config = getRateLimitsConfig({ PUBLIC_RATE_LIMIT_RPM: '120' });
    expect(config.tokensPerMinuteByModel).toEqual(DEFAULT_RATE_LIMITS.tokensPerMinuteByModel);
    expect(config.requestsPerMinuteByModel).toEqual(DEFAULT_RATE_LIMITS.requestsPerMinuteByModel);
  });

  it.each(['0', '-1', 'abc', '1.5', '60rpm'])(
    'ignores the invalid value %s and warns instead of taking the docs down',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = getRateLimitsConfig({ PUBLIC_RATE_LIMIT_RPM: raw });
      expect(config.perKey.requestsPerMinute).toBe(DEFAULT_RATE_LIMITS.perKey.requestsPerMinute);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it('treats an empty string as absent, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = getRateLimitsConfig({ PUBLIC_RATE_LIMIT_PARALLEL: '  ' });
    expect(config.perKey.maxParallel).toBe(DEFAULT_RATE_LIMITS.perKey.maxParallel);
    expect(warn).not.toHaveBeenCalled();
  });

  it('defaults to the values main settled on: 60 rpm, 5 concurrentes', () => {
    expect(DEFAULT_RATE_LIMITS.perKey).toEqual({ requestsPerMinute: 60, maxParallel: 5 });
  });
});
