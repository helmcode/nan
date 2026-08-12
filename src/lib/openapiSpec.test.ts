import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS, formatTokens, getRateLimitsConfig } from './rateLimits';

/**
 * Tripwire over src/data/openapi.json, the spec Scalar renders at /docs/api
 * and the source of the Markdown the Discord bot consumes.
 *
 * It exists because the spec is data, not code: nothing type-checks it and a
 * mistake inside ships silently. And this spec in particular was derived from
 * helmcode.com's, whose catalogue and billing model are NOT NaN's, so what
 * this mostly watches for is anything from there creeping back in.
 *
 * The endpoint surface was checked against the real backend by probing each
 * route: the 12 listed here answer 401 (they exist and want auth) while
 * /v1/moderations, /v1/batches and /v1/files answer 404 (not enabled on NaN).
 */

const raw = JSON.stringify(spec);

/** The 12 public routes verified against api.nan.builders. */
const PUBLIC_SURFACE: Array<[string, string]> = [
  ['/models', 'get'],
  ['/chat/completions', 'post'],
  ['/completions', 'post'],
  ['/embeddings', 'post'],
  ['/rerank', 'post'],
  ['/audio/speech', 'post'],
  ['/audio/transcriptions', 'post'],
  ['/responses', 'post'],
  ['/images/generations', 'post'],
  ['/images/edits', 'post'],
  ['/search', 'post'],
  ['/mcp', 'post'],
];

/** NaN's real catalogue (src/data/modelos.json + the API reference). */
const NAN_MODELS = [
  'deepseek-v4-flash',
  'mimo-v2.5',
  'qwen3.6',
  'gemma4',
  'glm5.2',
  'qwen3-embedding',
  'rerank',
  'kokoro',
  'whisper',
  'flux-2-klein',
];

describe('openapi.json: structure', () => {
  it('declares OpenAPI 3.1', () => {
    expect(spec.openapi).toMatch(/^3\.1/);
  });

  it("points at NaN's server", () => {
    expect(spec.servers?.[0]?.url).toBe('https://api.nan.builders/v1');
  });

  it('every $ref resolves', () => {
    const missing: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === '$ref' && typeof value === 'string') {
          let cursor: unknown = spec;
          for (const part of value.replace(/^#\//, '').split('/')) {
            cursor =
              cursor && typeof cursor === 'object'
                ? (cursor as Record<string, unknown>)[part]
                : undefined;
          }
          if (cursor === undefined) missing.push(value);
        } else {
          walk(value);
        }
      }
    };
    walk(spec);
    expect(missing).toEqual([]);
  });
});

describe('openapi.json: the surface is what the backend actually serves', () => {
  for (const [path, method] of PUBLIC_SURFACE) {
    it(`documents ${method.toUpperCase()} ${path}`, () => {
      const paths = spec.paths as Record<string, Record<string, unknown>>;
      expect(paths[path], path).toBeDefined();
      expect(paths[path][method], `${method} ${path}`).toBeDefined();
    });
  }

  it('does not document endpoints NaN does not serve', () => {
    const documented = Object.keys(spec.paths as Record<string, unknown>);
    // These three answer 404 on api.nan.builders.
    for (const absent of ['/moderations', '/batches', '/files']) {
      expect(documented).not.toContain(absent);
    }
    expect(documented.length).toBe(PUBLIC_SURFACE.length);
  });
});

describe('openapi.json: nothing left over from helmcode.com', () => {
  it('names no model NaN does not serve', () => {
    const foreign = raw.match(
      /\b(claude-[a-z0-9.-]+|gpt-[0-9][a-z0-9.-]*|gemini-[0-9][a-z0-9.-]*)\b/g,
    );
    expect(foreign).toBeNull();
  });

  it('does not describe prepaid-credit billing or resale', () => {
    for (const term of [
      'prepaid',
      'credit balance',
      'credits_exhausted',
      'resold',
      'metering_unavailable',
      'subscription_required',
      'ceiling_reached',
    ]) {
      expect(raw.toLowerCase(), term).not.toContain(term.toLowerCase());
    }
  });

  it('mentions Helmcode only as the enterprise-service note', () => {
    // A single mention, and inside info: the one saying enterprise uses a
    // different base URL. Any other would be un-migrated branding.
    const outsideInfo = JSON.stringify({ ...spec, info: undefined });
    expect(outsideInfo.toLowerCase()).not.toContain('helmcode');
  });
});

describe('openapi.json: the model catalogue', () => {
  /**
   * Every model-looking identifier appearing in the spec must be in the
   * catalogue. This is the net that stops us publishing a model that does not
   * exist, which is exactly what happened once with glm5.2 the other way round.
   */
  it('cites no model identifier outside the catalogue', () => {
    const cited = new Set(
      (raw.match(/`([a-z0-9][a-z0-9.-]{2,})`/g) ?? [])
        .map((m) => m.slice(1, -1))
        .filter((token) =>
          /^(deepseek|qwen|gemma|glm|mimo|kokoro|whisper|flux|rerank|claude|gpt|gemini|llama|mistral)/.test(
            token,
          ),
        ),
    );
    const unknown = [...cited].filter((m) => !NAN_MODELS.includes(m));
    expect(unknown).toEqual([]);
  });

  it('publishes glm5.2 as a premium-tier chat model', () => {
    const chat = (spec.paths as any)['/chat/completions'].post.requestBody.content[
      'application/json'
    ].schema.properties.model.description as string;
    expect(chat).toContain('glm5.2');
    expect(chat).toMatch(/premium tier/i);
  });
});

/**
 * The rate limits are NOT written into the spec: they come from rateLimits.ts,
 * the module that exists because the docs page and the docs API had already
 * drifted apart once (60 rpm against 100 rpm). Hardcoding them here would have
 * been a third copy, and one that cannot follow RATE_LIMIT_RPM, an env var.
 */
describe('openapi.json: rate limits come from the single source of truth', () => {
  it('ships a placeholder rather than the numbers', () => {
    expect(spec.info.description).toContain('{{RATE_LIMITS}}');
    expect(spec.info.description).not.toMatch(/\| Requests per minute \|/);
  });

  it('resolves the placeholder from the config it is given', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    expect(description).not.toContain('{{RATE_LIMITS}}');
    expect(description).toContain(
      `| Requests per minute | ${DEFAULT_RATE_LIMITS.perKey.requestsPerMinute} |`,
    );
    expect(description).toContain(
      `| Concurrent requests | ${DEFAULT_RATE_LIMITS.perKey.maxParallel} |`,
    );
  });

  /** An env override has to reach /docs/api, not only /docs/models. */
  it('follows an env override of the per-key limits', () => {
    const overridden = getRateLimitsConfig({ RATE_LIMIT_RPM: '250', RATE_LIMIT_PARALLEL: '9' });
    const description = resolveSpec(overridden).info.description;
    expect(description).toContain('| Requests per minute | 250 |');
    expect(description).toContain('| Concurrent requests | 9 |');
    expect(description).not.toContain(
      `| Requests per minute | ${DEFAULT_RATE_LIMITS.perKey.requestsPerMinute} |`,
    );
  });

  it('publishes every model that carries a per-minute limit', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    for (const m of DEFAULT_RATE_LIMITS.tokensPerMinuteByModel) {
      expect(description, m.model).toContain(`\`${m.model}\``);
    }
    for (const m of DEFAULT_RATE_LIMITS.requestsPerMinuteByModel) {
      expect(description, m.model).toContain(`\`${m.model}\``);
    }
  });

  it('publishes the windowed model with its real window and allowance', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    for (const m of DEFAULT_RATE_LIMITS.windowedModels) {
      expect(description).toContain(`${formatTokens(m.windowTokens)} tokens per rolling ${m.windowHours} hours`);
      expect(description).toContain(`${formatTokens(m.periodCapTokens)}-token allowance`);
      expect(description).toContain(`${formatTokens(m.contextTokens)} tokens`);
    }
  });
});
