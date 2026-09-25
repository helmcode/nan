import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../data/openapi.json';
import modelos from '../data/modelos.json';
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
 * route: the 10 listed here answer 401 (they exist and want auth) while
 * /v1/moderations, /v1/batches and /v1/files answer 404 (not enabled on NaN).
 */

const raw = JSON.stringify(spec);

/** The 10 public routes verified against api.nan.builders. */
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
];

/** NaN's real catalogue (src/data/modelos.json + the API reference). */
const NAN_MODELS = [
  'deepseek-v4-flash',
  'mimo-v2.5',
  'mimo-v2.6-flash',
  'qwen3.8-flash',
  'glm5.3-flash',
  'qwen3.6',
  'gemma4',
  'glm5.3',
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
   * exist, which is exactly what happened once with glm5.3 the other way round.
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

  /**
   * The home table (modelos.json) and this spec are written by hand on two
   * different days, so a model can land on the cluster, get listed on the
   * landing page and never reach the API reference. The chat models are the
   * ones a member copies into the `model` field, so those are the ones checked.
   */
  it('documents every chat model the landing page lists', () => {
    const llm = modelos.categorias.find((c) => c.id === 'llm')!;
    const missing = llm.modelos.map((m) => m.id).filter((id) => !raw.includes(`\`${id}\``));
    expect(missing).toEqual([]);
  });

  it('publishes glm5.3 as a premium-tier chat model', () => {
    const chat = (spec.paths as any)['/chat/completions'].post.requestBody.content[
      'application/json'
    ].schema.properties.model.description as string;
    expect(chat).toContain('`glm5.3`');
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
    // Concurrency is enforced per model, so the row points at the per-model
    // table below instead of a flat per-key number.
    expect(description).toContain('| Concurrent requests | per model — see the per-model limits below |');
  });

  /** An env override has to reach /docs/api, not only /docs/models. */
  it('follows an env override of the per-key rate, and leaks no legacy parallel cap', () => {
    const overridden = getRateLimitsConfig({ RATE_LIMIT_RPM: '250', RATE_LIMIT_PARALLEL: '9' });
    const description = resolveSpec(overridden).info.description;
    expect(description).toContain('| Requests per minute | 250 |');
    expect(description).not.toContain(
      `| Requests per minute | ${DEFAULT_RATE_LIMITS.perKey.requestsPerMinute} |`,
    );
    // RATE_LIMIT_PARALLEL is the legacy outer cap: it still parses (env
    // overrides must not crash) but no surface publishes it any more.
    expect(description).not.toContain('| Concurrent requests | 9 |');
    expect(description).toContain('| Concurrent requests | per model — see the per-model limits below |');
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

  it('publishes the per-model concurrency with the tier numbers', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    expect(description).toContain('Concurrency is enforced per model');
    // Grouped the way the per-minute rows are, so the Rate limits section
    // grows no `| `glm5.3` |` row of its own that could shadow the Model
    // catalog's row for the same model.
    expect(description).toContain(
      '| `glm5.3`, `glm5.3-flash`, `deepseek-v4-flash`, `qwen3.8-flash` | 7 (base plan) · 10 (premium plan) |',
    );
    expect(description).toContain('| `mimo-v2.5`, `mimo-v2.6-flash`, `qwen3.6`, `gemma4` | 5 |');
  });

  it('names the endpoints the per-model concurrency table does not cover', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    expect(description).toContain('Audio, embedding and rerank endpoints have no concurrency limit.');
  });

  it('gives a model whose numbers differ its own row, not its neighbour\'s', () => {
    const config = {
      ...DEFAULT_RATE_LIMITS,
      concurrencyByModel: [
        ...DEFAULT_RATE_LIMITS.concurrencyByModel,
        { model: 'frontier-next', maxParallel: 5, tierMaxParallel: { inference: 8, premium: 12 } },
      ],
    };
    const description = resolveSpec(config).info.description;
    expect(description).toContain('| `frontier-next` | 8 (base plan) · 12 (premium plan) |');
  });

  it('resolves the premium concurrency in the windowed note', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    // glm5.3 is premium-only, so the note states the premium tier's number.
    expect(description).toMatch(/Context window: 1M tokens, 10 concurrent requests\./);
  });
});

/**
 * THE REFERENCE AND THE QUICKSTART HAVE TO RECOMMEND THE SAME MODEL.
 *
 * They did not. /docs/getting-started moved to `deepseek-v4-flash` and
 * /docs/choose-a-model started calling `qwen3.6` "previous generation", while
 * this spec still opened its own quickstart with `qwen3.6`, offered it as the
 * `model` example on every chat field, and used it in all three code samples.
 * The reference is the page a member reaches with the API already in front of
 * them, so it is the copy most likely to be pasted, and it was pointing at the
 * model the rest of the docs steer away from.
 *
 * The expected value is READ OFF the quickstart table rather than written here
 * again: the day that recommendation changes, this fails until the reference
 * follows, which is the whole point.
 */
describe('openapi.json: the model it puts in front of a reader', () => {
  const recommended = (() => {
    const page = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../content/docs/getting-started.mdx'),
      'utf-8',
    );
    const row = /\|\s*Model to start with\s*\|\s*`([^`]+)`\s*\|/.exec(page);
    expect(row, 'the quickstart no longer states a model to start with').not.toBeNull();
    return row![1];
  })();

  const chat = spec.paths['/chat/completions'].post as any;

  it('opens the overview with it', () => {
    expect(spec.info.description).toContain(`model="${recommended}"`);
  });

  it('offers it as the example value of the chat `model` field', () => {
    expect(chat.requestBody.content['application/json'].schema.properties.model.example).toBe(
      recommended,
    );
  });

  it('answers with the model the request example asked for', () => {
    const request = chat.requestBody.content['application/json'].examples.basic.value.model;
    expect(request).toBe(recommended);
    expect(chat.responses['200'].content['application/json'].example.model).toBe(request);
  });

  /**
   * `json_schema` is the documented exception and stays one: structured output
   * "works on `qwen3.6` and `gemma4`" per the ResponseFormat schema, so that
   * example has to name a model that supports it. An example pinned to a model
   * for a REASON is fine; an example pinned to it by inertia is what this
   * catches.
   */
  it('uses it in every chat example that is not about a model-specific capability', () => {
    const examples = chat.requestBody.content['application/json'].examples;
    const capability: Record<string, string> = {
      json_schema: 'structured output is only on qwen3.6 and gemma4',
      premium_tier: 'the premium tier is the point of the example',
    };
    for (const [name, example] of Object.entries(examples) as Array<[string, any]>) {
      if (capability[name]) continue;
      expect(example.value.model, `${name}: ${JSON.stringify(example.value.model)}`).toBe(
        recommended,
      );
    }
  });

  it('uses it in all three code samples', () => {
    for (const sample of chat['x-codeSamples']) {
      expect(sample.source, sample.lang).toContain(recommended);
      expect(sample.source, `${sample.lang} still names a second model`).not.toMatch(
        /qwen3\.6|glm5\.3|gemma4|mimo/,
      );
    }
  });

  /** The structured-output example is allowed to differ, but not to go stale. */
  it('keeps the structured-output example on a model that supports it', () => {
    const model = chat.requestBody.content['application/json'].examples.json_schema.value.model;
    expect(spec.components.schemas.ResponseFormat.description).toContain(`\`${model}\``);
  });
});

/**
 * THE REFERENCE IS SERVED IN ENGLISH TO BOTH LOCALES, so its examples cannot be
 * in Spanish.
 *
 * There is one spec, rendered by Scalar at /docs/api and at /es/docs/api, and
 * its prose is English. Its examples were not: the chat quickstart asked "Hola",
 * the model answered "¡Hola! ¿En qué puedo ayudarte?", the reasoning example
 * said "Resuelve paso a paso" and the image ones prompted for "Un faro al
 * atardecer sobre acantilados". A member who does not read Spanish got an
 * English page with Spanish payloads, which reads like a copy-paste mistake
 * even when every field around it is right.
 *
 * TWO STRINGS STAY SPANISH ON PURPOSE and are allowed by name below: the
 * embeddings input pairs "Hola mundo" with "Hello world", which is the point of
 * the example (the same sentence in two languages lands in nearby vectors), and
 * the Whisper response is the transcript of a Spanish audio file, which is
 * content, not prose.
 */
describe('openapi.json: one language for the reader', () => {
  const DELIBERATE = ['Hola mundo', 'Hola, esto es una prueba.'];

  /** `¿ ¡ ñ` and the accented vowels: Spanish and nothing else. */
  const SPANISH = /[¿¡ñáéíóú]/;

  function strings(node: unknown, path: string): Array<[string, string]> {
    if (typeof node === 'string') return [[path, node]];
    if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}[${i}]`));
    if (node && typeof node === 'object') {
      return Object.entries(node).flatMap(([k, v]) => strings(v, `${path}.${k}`));
    }
    return [];
  }

  it('carries no Spanish outside the two examples that are about Spanish', () => {
    const offenders = strings(spec, '')
      .filter(([, value]) => SPANISH.test(value))
      .filter(([, value]) => !DELIBERATE.some((allowed) => value.includes(allowed)))
      .map(([path, value]) => `${path}: ${value.slice(0, 80)}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
