import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../data/openapi.json';
import modelos from '../data/modelos.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS, formatTokens, getRateLimitsConfig, USAGE_REQUESTS_PER_MINUTE } from './rateLimits';

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
 * route: the 11 listed here answer 401 (they exist and want auth) while
 * /v1/moderations, /v1/batches and /v1/files answer 404 (not enabled on NaN).
 */

const raw = JSON.stringify(spec);

/** The 11 public routes verified against api.nan.builders. */
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
  ['/usage', 'get'],
];

/** NaN's real catalogue (src/data/modelos.json + the API reference). */
const NAN_MODELS = [
  'deepseek-v4-flash',
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
  'qwen-image-2.1',
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

  /**
   * The /usage budget is a number the backend hardcodes, so it is a code
   * constant in rateLimits.ts (like the tier ceilings) and reaches the
   * overview prose through its own placeholder — not a third handwritten
   * "30". The wording stays in the spec; only the number is shared.
   */
  it('ships the usage budget as a placeholder rather than a number', () => {
    expect(spec.info.description).toContain('{{USAGE_RATE_LIMIT}}');
    // The overview must not still carry the handwritten figure the
    // placeholder replaces — one copy, not two.
    expect(spec.info.description).not.toMatch(
      /The usage endpoint is metered separately too: \d+ requests per minute per member/,
    );
  });

  /**
   * The rendered overview is what the current spec published by hand, to the
   * byte: the placeholder swap only shares the number, it rewrites nothing.
   */
  it('renders the usage sentence from the shared constant, unchanged', () => {
    const description = resolveSpec(DEFAULT_RATE_LIMITS).info.description;
    expect(description).not.toContain('{{USAGE_RATE_LIMIT}}');
    expect(description).toContain(
      'Image endpoints run on their own budget, separate from the model endpoints: ' +
        '20 requests per minute and 100 requests per month. ' +
        `The usage endpoint is metered separately too: ${USAGE_REQUESTS_PER_MINUTE} requests per minute per member. ` +
        'Exceed any limit and you get a `429`.',
    );
  });

  /**
   * The /usage endpoint's own contract (operation description and 429) stays
   * static — no placeholder there — but its figures have to agree with the
   * shared constant, or the overview and the endpoint disagree about the
   * budget, which is the drift this single source exists to prevent.
   */
  it('keeps the /usage endpoint contract static and consistent with the shared budget', () => {
    const usage = (spec.paths as any)['/usage'].get;
    expect(usage.description).toContain(
      `Rate limit: ${USAGE_REQUESTS_PER_MINUTE} requests per minute per member, a budget separate from the model endpoints'.`,
    );
    expect(usage.responses['429'].description).toContain(
      `${USAGE_REQUESTS_PER_MINUTE} requests per minute per member (\`rate_limit_exceeded\`)`,
    );
    // Static means static: no placeholder may leak into the served contract.
    expect(usage.description).not.toContain('{{');
    expect(usage.responses['429'].description).not.toContain('{{');
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
    expect(description).toContain('| `mimo-v2.6-flash`, `qwen3.6`, `gemma4` | 5 |');
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

  /**
   * The structured-output example is allowed to differ, but not to go stale.
   * The ResponseFormat description now also names a model that REJECTS
   * `json_schema`, so "the description mentions the model" is no longer
   * enough: the model has to be in the sentence that says where it works.
   */
  it('keeps the structured-output example on a model that supports it', () => {
    const model = chat.requestBody.content['application/json'].examples.json_schema.value.model;
    const works = /`json_schema` works on (.+?)\.(?:\s|$)/.exec(
      spec.components.schemas.ResponseFormat.description,
    );
    expect(works, 'ResponseFormat no longer says where json_schema works').not.toBeNull();
    expect(works![1]).toContain(`\`${model}\``);
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

/**
 * THE /USAGE CONTRACT, AS THE BACKEND SERVES IT.
 *
 * The response echoes the effective window it served (after future-date
 * clamping), so a client can see the window its totals cover without
 * reimplementing the server's clamping logic. These expectations were written
 * against the corrected backend contract and pin the envelope shape, the
 * parameter clamping behavior and the current error wording.
 */
describe('openapi.json: the /usage contract', () => {
  const usage = (spec.paths as any)['/usage'].get;
  const schemas = spec.components.schemas as any;
  const example = usage.responses['200'].content['application/json'].example;

  const param = (name: string) =>
    usage.parameters.find((p: any) => p.name === name) as any;

  it('echoes the effective window right after `object`', () => {
    expect(Object.keys(schemas.UsageReport.properties)).toEqual([
      'object',
      'start_date',
      'end_date',
      'data',
      'totals',
      'all_time',
      'has_more',
      'next_cursor',
    ]);
    for (const key of ['start_date', 'end_date']) {
      expect(schemas.UsageReport.properties[key]).toMatchObject({
        type: 'string',
        format: 'date',
      });
      expect(schemas.UsageReport.properties[key].description).toMatch(/effective|served/i);
    }
    // The example carries them in the same position, as real date strings.
    expect(Object.keys(example)).toEqual([
      'object',
      'start_date',
      'end_date',
      'data',
      'totals',
      'all_time',
      'has_more',
      'next_cursor',
    ]);
    expect(example.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(example.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts api_requests in the all-time summary', () => {
    expect(Object.keys(schemas.UsageAllTime.properties)).toEqual([
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'api_requests',
      'cached_at',
    ]);
    expect(schemas.UsageAllTime.properties.api_requests).toMatchObject({ type: 'integer' });
    expect(example.all_time.api_requests).toEqual(expect.any(Number));
  });

  it('keeps the window totals in the documented shape', () => {
    expect(Object.keys(schemas.UsageTotals.properties)).toEqual([
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'api_requests',
      'by_model',
    ]);
  });

  it('does not claim an unknown cursor 400s', () => {
    const description: string = param('cursor').description;
    // The 400 case is a MALFORMED cursor; a well-formed one simply positions
    // the page and is not validated against the current dataset.
    expect(description.toLowerCase()).not.toContain('unknown');
    expect(description).toMatch(/[Mm]alformed/);
    expect(description).toContain('400');
    expect(description).toMatch(/positions the page/);
    expect(description).toMatch(/not validated|without being validated/);
  });

  it('documents the server-side clamping of limit', () => {
    const description: string = param('limit').description;
    expect(description.toLowerCase()).toMatch(/clamp/);
    expect(description.toLowerCase()).toMatch(/falls? back|default/);
  });

  it('documents that a future start_date clamps to today', () => {
    const description: string = param('start_date').description;
    expect(description).toMatch(/[Ff]uture/);
    expect(description.toLowerCase()).toMatch(/clamp/);
  });

  it('quotes the current window and cursor error wording', () => {
    const description: string = usage.responses['400'].description;
    expect(description).toContain(
      'The requested window spans N days; the maximum is 90 inclusive days. Split the range into several requests.',
    );
    expect(description).toContain('Pass next_cursor from a previous response unchanged');
    expect(description.toLowerCase()).not.toContain('unknown cursor');
  });

  it('documents the 404, 409 and 500 outcomes', () => {
    expect(usage.responses['404'].description).toMatch(/no api key/i);
    expect(usage.responses['404'].description).toMatch(/discord link|handle/i);
    expect(usage.responses['409'].description).toMatch(/service key/i);
    expect(usage.responses['500'].description).toContain('server_error');
    for (const status of ['404', '409', '500']) {
      expect(usage.responses[status].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/Error',
      });
    }
  });

  it('caveats every api_requests field with the request-counting cutover', () => {
    // Request counts only exist from the usage-hook cutover (2026-09-02);
    // older days report 0. Every api_requests description must say so, or
    // tokens-per-request math in third-party tools silently lies.
    //
    // The sentence is asserted in full, not just by date: the four schemas
    // were written on different days and had already drifted into two
    // wordings ("only available from ... onward" against "start on"), and a
    // substring check on the date alone cannot see that. One sentence, four
    // fields, byte for byte.
    const CUTOVER =
      'Request counts are only available from 2026-09-02 onward; older days report `0`.';
    for (const name of ['UsageRow', 'UsageTotals', 'UsageModelTotals', 'UsageAllTime']) {
      const description: string = schemas[name].properties.api_requests.description;
      expect(description, `${name}.api_requests`).toContain(CUTOVER);
    }
  });
});

/**
 * THE GUIDES AND THE SPEC SPEAK THE SAME CONTRACT. The getting-started
 * guides quote /usage's pagination, so the echoed effective window has to
 * show up in both locales — the day one locale drifts, this fails.
 */
describe('getting-started guides: /usage parity', () => {
  const readGuide = (locale: string) =>
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../content/docs${locale}/getting-started.mdx`,
      ),
      'utf-8',
    );

  const usageSection = (page: string, heading: string) => {
    const start = page.indexOf(heading);
    expect(start, `the guide no longer has a "${heading}" section`).toBeGreaterThan(-1);
    const next = page.indexOf('\n## ', start + heading.length);
    return page.slice(start, next === -1 ? page.length : next);
  };

  it('notes the echoed effective window in both locales', () => {
    for (const [page, heading] of [
      [readGuide(''), '## Usage metrics'],
      [readGuide('-es'), '## Métricas de uso'],
    ] as Array<[string, string]>) {
      const section = usageSection(page, heading);
      expect(section).toContain('`start_date`');
      expect(section).toContain('`end_date`');
    }
  });
});

/**
 * THE GATEWAY REJECTS TWO REQUEST SHAPES WITH A 400 BEFORE ROUTING: a tool
 * name outside ^[a-zA-Z0-9_-]{1,64}$ (any model) and `response_format`
 * `json_schema` on `deepseek-v4-flash` (`json_object` still works there).
 * A member who hits either should find it in the reference and on the model
 * card, in both locales, not learn it from the error.
 */
describe('documented 400s: tool names and structured output', () => {
  const schemas = spec.components.schemas as any;
  const TOOL_NAME = '^[a-zA-Z0-9_-]{1,64}$';

  it('publishes the tool-name pattern the gateway enforces', () => {
    const name = schemas.Tool.properties.function.properties.name;
    expect(name.pattern).toBe(TOOL_NAME);
    expect(name.description).toContain('Up to 64 characters; letters, digits, underscores and dashes.');
    expect(name.description).toMatch(/rejected with a `400`/);
    expect(name.description).toMatch(/every model/);
  });

  it('the published pattern accepts and rejects what the description says', () => {
    const re = new RegExp(TOOL_NAME);
    for (const ok of ['get_weather', 'search-web', 'A1', 'x'.repeat(64)]) {
      expect(re.test(ok), ok).toBe(true);
    }
    for (const bad of ['', 'x'.repeat(65), 'files.read', 'mcp:search', 'with space', 'ñandú']) {
      expect(re.test(bad), bad).toBe(false);
    }
  });

  it('says json_schema is rejected on deepseek-v4-flash and json_object works there', () => {
    const description: string = schemas.ResponseFormat.description;
    expect(description).toContain(
      'On `deepseek-v4-flash` it is rejected with a `400` before the request reaches the model; `json_object` still works there, as long as the prompt contains the word JSON (otherwise `400`).',
    );
    const works = /`json_schema` works on (.+?)\.(?:\s|$)/.exec(description)!;
    expect(works[1]).not.toContain('deepseek-v4-flash');
  });

  it('states the same on the deepseek-v4-flash model card, in both locales', () => {
    const card = (locale: string) => {
      const page = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), `../content/docs${locale}/models.mdx`),
        'utf-8',
      );
      const start = page.indexOf('id="deepseek-v4-flash"');
      expect(start, `${locale || 'en'}: no deepseek-v4-flash card`).toBeGreaterThan(-1);
      return page.slice(start, page.indexOf('/>', start));
    };
    const en = card('');
    expect(en).toContain('json_object is supported (the prompt must contain the word JSON, otherwise it is rejected with a 400), json_schema is not and is rejected with a 400');
    expect(en).toContain('use qwen3.6 or gemma4');
    expect(en).toContain('<code>json_schema</code> not supported (400)');
    const es = card('-es');
    expect(es).toContain('json_object es compatible (el prompt debe contener la palabra JSON; si no, se rechaza con un 400), json_schema no y se rechaza con un 400');
    expect(es).toContain('usa qwen3.6 o gemma4');
    expect(es).toContain('<code>json_schema</code> no soportado (400)');
  });
});

/**
 * /responses ON deepseek-v4-flash, AND ITS STREAMING, MEASURED 2026-09-29
 * with a real request against api.nan.builders: 200 with a `reasoning` item
 * and a `message` item, non-streaming; with `stream: true` it emits the full
 * event sequence incrementally (`response.created` first, deltas as they are
 * generated, `response.completed` last). qwen3.6 and gemma4 answer 200 too,
 * but hold the answer and send every delta in one burst at the end, so the
 * old "a single terminal event" sentence was no longer true for any model.
 */
describe('documented /responses: models and streaming', () => {
  const op = (spec.paths as any)['/responses'].post;
  const body = op.requestBody.content['application/json'].schema.properties;

  it('lists deepseek-v4-flash next to qwen3.6 and gemma4, in text and in the enum', () => {
    expect(op.description).toContain('Models: `deepseek-v4-flash`, `qwen3.6`, `gemma4`.');
    expect(body.model.enum).toEqual(['deepseek-v4-flash', 'qwen3.6', 'gemma4']);
    for (const id of body.model.enum) expect(NAN_MODELS, id).toContain(id);
  });

  it('says which models stream incrementally and which send one burst', () => {
    expect(op.description).toMatch(/`deepseek-v4-flash` streams incrementally/);
    expect(op.description).toContain('`response.created`');
    expect(op.description).toMatch(/On `qwen3\.6` and `gemma4` the answer is held until it is complete/);
    expect(op.description).toContain('[Create chat completion](#tag/Chat)');
    expect(body.stream.type).toBe('boolean');
    expect(body.stream.default).toBe(false);
  });

  it('drops the stale single-terminal-event claim everywhere', () => {
    expect(raw).not.toMatch(/single terminal event/);
    expect(spec.info.description).toContain(
      '`/responses` streams incrementally only on `deepseek-v4-flash`',
    );
  });

  it('the Codex guide agrees, in both locales', () => {
    const page = (locale: string) =>
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), `../content/docs${locale}/codex.mdx`),
        'utf-8',
      );
    expect(page('')).toContain('streams incrementally only on `deepseek-v4-flash`');
    expect(page('')).not.toContain('It is not a hang: that endpoint does not stream yet.');
    expect(page('-es')).toContain('solo va emitiendo la respuesta por partes con `deepseek-v4-flash`');
  });
});

/**
 * qwen3.8-flash IS SERVED AT 1,048,576 TOKENS, not 262,144. Re-measured
 * 2026-09-29: `max_input_tokens` 1048576 on the community proxy's deployment
 * and a 1_048_576 window in the rate-limit hook. The old "262K, the model's
 * native window" copy sent clients to compact at a quarter of what the API
 * accepts. Other models' figures are untouched and are pinned elsewhere.
 */
describe('documented context: qwen3.8-flash is 1M', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => readFileSync(resolve(here, p), 'utf-8');

  it('the API reference catalog says 1M', () => {
    const row = spec.info.description.split('\n').find((l: string) => l.startsWith('| `qwen3.8-flash`'));
    expect(row).toContain('1M-token context');
    expect(row).not.toMatch(/262/);
  });

  for (const locale of ['', '-es']) {
    it(`no page gives qwen3.8-flash a 262K window (${locale || 'en'})`, () => {
      const card = (() => {
        const page = read(`../content/docs${locale}/models.mdx`);
        const start = page.indexOf('id="qwen3-8-flash"');
        expect(start).toBeGreaterThan(-1);
        return page.slice(start, page.indexOf('/>', start));
      })();
      expect(card).not.toMatch(/262|native|nativa/);
      expect(card).toMatch(/1M tokens/);
      expect(card).toMatch(/1[.,]048[.,]576/);

      expect(read(`../content/docs${locale}/choose-a-model.md`)).toMatch(/^\| `qwen3\.8-flash` \|[^|]+\| 1M \|/m);
      expect(read(`../content/docs${locale}/cline.mdx`)).toMatch(/^\| `qwen3\.8-flash` \| 1000000 \|/m);
      expect(read(`../content/docs${locale}/opencode.mdx`)).toMatch(
        /"name": "Qwen 3\.8 Flash",\s*"limit": \{ "context": 1048576, "output": 32768 \}/,
      );
      // VS Code adds input and output, so the input is the window minus 32768.
      expect(read(`../content/docs${locale}/vscode.mdx`)).toMatch(
        /"id": "qwen3\.8-flash",[^}]*"maxInputTokens": 1015808,\s*"maxOutputTokens": 32768/,
      );
      expect(read(`../content/docs${locale}/pi.mdx`)).toMatch(
        /"id": "qwen3\.8-flash",[^}]*"contextWindow": 1048576,/,
      );
    });
  }

  it('the home table says 1M', () => {
    const row = JSON.stringify(modelos).match(/"id":"qwen3\.8-flash"[^}]*"specs":"([^"]+)"/);
    expect(row, 'no qwen3.8-flash row in modelos.json').not.toBeNull();
    expect(row![1]).toContain('1M context');
  });
});

/**
 * TWO MORE 400s FROM 2026-09-29. A tool whose `parameters` root is not
 * `"type": "object"` is rejected before routing, on every model. A request
 * that overflows the model's window answers 400 "Context length exceeded for
 * model '...'" with the limit, and is not retried on another deployment; on
 * deepseek-v4-flash a small `max_tokens` is raised to 16384 so the reasoning
 * fits, which is why a prompt close to the window overflows with a small one.
 */
describe('documented 400s: tool parameters and context overflow', () => {
  const schemas = spec.components.schemas as any;
  const params = schemas.Tool.properties.function.properties.parameters;

  it('pins the object root of tool parameters, machine-readably and in prose', () => {
    expect(params.type).toBe('object');
    expect(params.required).toEqual(['type']);
    expect(params.properties.type.enum).toEqual(['object']);
    expect(params.description).toContain('its root must be `"type": "object"`');
    expect(params.description).toMatch(/rejected with a `400`/);
    expect(params.description).toMatch(/every model/);
    // `parameters` stays optional: a no-argument tool may omit it.
    expect(schemas.Tool.properties.function.required).toEqual(['name']);
  });

  it('documents the context-overflow 400 in the errors table and the shared 400', () => {
    const row = spec.info.description.split('\n').find((l: string) => l.startsWith('| `400` |'));
    expect(row).toContain("Context length exceeded for model '...'");
    expect(row).toMatch(/model's limit/);
    const bad = (spec.components.responses as any).BadRequest.description;
    expect(bad).toContain("Context length exceeded for model '...'");
    expect(bad).toMatch(/not retried on another deployment/);
  });

  it('explains the deepseek-v4-flash 16384 floor on max_tokens, in the spec and on both cards', () => {
    const maxTokens = (spec.paths as any)['/chat/completions'].post.requestBody.content['application/json']
      .schema.properties.max_tokens.description;
    expect(maxTokens).toContain('On `deepseek-v4-flash` a smaller value is raised to 16384');
    expect(maxTokens).toContain('1,048,576-token window');

    const card = (locale: string) => {
      const page = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), `../content/docs${locale}/models.mdx`),
        'utf-8',
      );
      const start = page.indexOf('id="deepseek-v4-flash"');
      return page.slice(start, page.indexOf('/>', start));
    };
    expect(card('')).toContain('A max_tokens below 16384 is raised to 16384 so the reasoning fits');
    expect(card('')).toContain('rejected with a 400 (Context length exceeded)');
    expect(card('-es')).toContain('Un max_tokens por debajo de 16384 se sube a 16384');
    expect(card('-es')).toContain('se rechaza con un 400 (Context length exceeded)');
  });
});
