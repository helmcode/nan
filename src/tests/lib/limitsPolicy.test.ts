import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_RATE_LIMITS,
  MAX_POLICY_VERSION,
  documentedModels,
  policyToRateLimits,
  resetPolicyCache,
  resolveRateLimitsConfig,
} from '../../lib/limitsPolicy';

/**
 * Reading the limits from the platform, and every way that is allowed to fail.
 *
 * The point of this module is to stop the site retyping numbers cloud-api
 * already publishes - the failure that had four wrong ceilings on /docs/models
 * for months. But a docs page is not an application: being a deploy behind is
 * nothing, and failing to render is everything. So almost all of these cases
 * are about falling back rather than about mapping.
 *
 * It is inert today. LIMITS_POLICY_URL is unset in production, which is the
 * first test here, because "prepared" has to mean the page did not change.
 */

/** A well-formed document, shaped exactly like cloud-api's buildLimitsPolicy(). */
function policyDocument() {
  return {
    version: 1,
    defaults: { concurrency: 5, window: 262_144, fills_per_min: 2 },
    exempt_models: ['kokoro', 'whisper', 'qwen3-embedding', 'rerank'],
    models: {
      gemma4: {
        window: 262_144,
        concurrency: 5,
        fills_per_min: 4,
        monthly_token_cap: null,
        window_tokens: null,
        window_hours: null,
      },
      'deepseek-v4-flash': {
        window: 1_048_576,
        concurrency: 5,
        fills_per_min: 6,
        monthly_token_cap: 3_000_000_000,
        window_tokens: null,
        window_hours: null,
      },
      'glm5.3': {
        window: 1_048_576,
        concurrency: 5,
        fills_per_min: 11,
        monthly_token_cap: 3_000_000_000,
        window_tokens: 400_000_000,
        window_hours: 4,
      },
      // Served by the platform, deliberately NOT documented by this site.
      'glm5.2': {
        window: 1_048_576,
        concurrency: 5,
        fills_per_min: 11,
        monthly_token_cap: 3_000_000_000,
        window_tokens: 400_000_000,
        window_hours: 4,
      },
    },
  };
}

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => resetPolicyCache());
afterEach(() => vi.unstubAllGlobals());

describe('with no URL configured, which is production today', () => {
  test('returns the built-in table and makes no request at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const config = await resolveRateLimitsConfig({});

    expect(config).toEqual(DEFAULT_RATE_LIMITS);
    expect(fetchSpy, 'a request was made with no URL configured').not.toHaveBeenCalled();
  });

  test('the env overrides still apply, as they did before', async () => {
    const config = await resolveRateLimitsConfig({ RATE_LIMIT_RPM: '120' });
    expect(config.perKey.requestsPerMinute).toBe(120);
  });
});

describe('mapping a policy document onto what the page publishes', () => {
  const mapped = () => policyToRateLimits(policyDocument() as never, DEFAULT_RATE_LIMITS)!;

  test('takes the two factors, not a ceiling', () => {
    const gemma = mapped().tokensPerMinuteByModel.find((m) => m.model === 'gemma4');
    expect(gemma).toEqual({ model: 'gemma4', contextTokens: 262_144, fillsPerMinute: 4 });
  });

  /**
   * The rolling window is what makes a model windowed, not the tier or the
   * name. A model that grows one upstream should move into its own block here
   * without this file being edited.
   */
  test('a model with a rolling window lands in its own block', () => {
    const config = mapped();
    expect(config.windowedModels.map((m) => m.model)).toContain('glm5.3');
    expect(config.tokensPerMinuteByModel.map((m) => m.model)).not.toContain('glm5.3');

    const glm = config.windowedModels.find((m) => m.model === 'glm5.3')!;
    expect(glm.windowTokens).toBe(400_000_000);
    expect(glm.windowHours).toBe(4);
    expect(glm.periodCapTokens).toBe(3_000_000_000);
    expect(glm.contextTokens).toBe(1_048_576);
    expect(glm.fillsPerMinute).toBe(11);
  });

  /**
   * The policy governs everything the platform serves. The page is about a
   * smaller set, and glm5.2 is the live example: premium, still in the policy,
   * and not documented here. Rendering the policy raw would publish it.
   */
  test('publishes only the models the catalogue documents', () => {
    const config = mapped();
    const published = [
      ...config.tokensPerMinuteByModel.map((m) => m.model),
      ...config.windowedModels.map((m) => m.model),
    ];
    expect(published).not.toContain('glm5.2');
    expect(documentedModels().has('glm5.2')).toBe(false);
    for (const model of published) {
      expect(documentedModels().has(model), `${model} is not in the catalogue`).toBe(true);
    }
  });

  test('filters the exempt list the same way', () => {
    expect(mapped().exemptModels).toEqual(['kokoro', 'whisper', 'qwen3-embedding', 'rerank']);
  });

  /**
   * Neither of these is in the policy document: the per-key limits live on the
   * LiteLLM key, and image generation never touches LiteLLM. Reading the
   * policy must not quietly drop them.
   */
  test('keeps the per-key limits and image generation from the base config', () => {
    const config = mapped();
    expect(config.perKey).toEqual(DEFAULT_RATE_LIMITS.perKey);
    expect(config.imageModels).toEqual(DEFAULT_RATE_LIMITS.imageModels);
  });

  test('orders the table by ceiling, so it does not reshuffle between renders', () => {
    const rows = mapped().tokensPerMinuteByModel;
    const ceilings = rows.map((m) => m.contextTokens * m.fillsPerMinute);
    expect(ceilings).toEqual([...ceilings].sort((a, b) => b - a));
  });
});

describe('every way it is allowed to fail, it falls back whole', () => {
  const URL_ENV = { LIMITS_POLICY_URL: 'https://example.invalid/limits' };

  test('a document newer than this build understands is refused', async () => {
    const doc = { ...policyDocument(), version: MAX_POLICY_VERSION + 1 };
    vi.stubGlobal('fetch', ok(doc));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  test('a non-200 is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  test('a fetch that throws is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  test('a body that is not JSON is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  /**
   * The rule that matters most. A document missing one field is not patched
   * from the built-in table: half a card mixing two sources is exactly the
   * silent wrongness this module exists to end.
   */
  test('a model missing a field rejects the whole document', async () => {
    const doc = policyDocument() as Record<string, never>;
    delete (doc.models as Record<string, Record<string, unknown>>).gemma4.fills_per_min;
    vi.stubGlobal('fetch', ok(doc));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  test('a windowed model missing its allowance rejects the whole document', () => {
    const doc = policyDocument();
    doc.models['glm5.3'].monthly_token_cap = null;
    expect(policyToRateLimits(doc as never, DEFAULT_RATE_LIMITS)).toBeNull();
  });

  /**
   * A zero must never be read as "no limit". cloud-api sends null for that on
   * purpose, and its own comment says not to "fix" the null into a 0.
   */
  test('a zero where a limit belongs rejects the document', async () => {
    const doc = policyDocument();
    doc.models.gemma4.fills_per_min = 0;
    vi.stubGlobal('fetch', ok(doc));
    expect(await resolveRateLimitsConfig(URL_ENV)).toEqual(DEFAULT_RATE_LIMITS);
  });

  /**
   * A document that governs none of the models this site documents is not an
   * old policy, it is a URL pointing at the wrong service.
   */
  test('a document about other models entirely is refused', () => {
    const doc = policyDocument();
    doc.models = { 'some-other-model': doc.models.gemma4 } as never;
    expect(policyToRateLimits(doc as never, DEFAULT_RATE_LIMITS)).toBeNull();
  });
});

describe('when it does read a policy', () => {
  const URL_ENV = { LIMITS_POLICY_URL: 'https://example.invalid/limits' };

  test('the page follows the platform rather than the built-in table', async () => {
    const doc = policyDocument();
    doc.models.gemma4.fills_per_min = 9;
    vi.stubGlobal('fetch', ok(doc));

    const config = await resolveRateLimitsConfig(URL_ENV);
    const gemma = config.tokensPerMinuteByModel.find((m) => m.model === 'gemma4')!;

    expect(gemma.fillsPerMinute, 'the policy did not win').toBe(9);
    expect(
      DEFAULT_RATE_LIMITS.tokensPerMinuteByModel.find((m) => m.model === 'gemma4')!.fillsPerMinute,
    ).toBe(4);
  });

  test('sends the token as X-API-Key when one is configured', async () => {
    const fetchSpy = ok(policyDocument());
    vi.stubGlobal('fetch', fetchSpy);

    await resolveRateLimitsConfig({ ...URL_ENV, LIMITS_POLICY_TOKEN: 'shh' });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('shh');
  });

  test('does not fetch again on the next render', async () => {
    const fetchSpy = ok(policyDocument());
    vi.stubGlobal('fetch', fetchSpy);

    await resolveRateLimitsConfig(URL_ENV);
    await resolveRateLimitsConfig(URL_ENV);

    expect(fetchSpy, 'one fetch per worker per TTL, not one per page').toHaveBeenCalledTimes(1);
  });
});
