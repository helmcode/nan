import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';
import modelos from '../data/modelos.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS, formatTokens, getRateLimitsConfig } from './rateLimits';

/**
 * Centinela sobre src/data/openapi.json, la spec que Scalar pinta en /docs/api
 * y la fuente del Markdown que consume el bot de Discord.
 *
 * Existe porque la spec es datos, no código: nada la comprueba con tipos y un
 * error dentro se despliega en silencio. Y esta spec en concreto se derivó de
 * la de helmcode.com, cuyo catálogo y modelo de facturación NO son los de NaN,
 * así que lo que más vigila es que no se cuele de vuelta nada de allí.
 *
 * La superficie de endpoints se comprobó contra el backend real probando cada
 * ruta: las 12 listadas aquí responden 401 (existen y piden auth) mientras que
 * /v1/moderations, /v1/batches y /v1/files responden 404 (no activas en NaN).
 */

const raw = JSON.stringify(spec);

/** Las 12 rutas públicas verificadas contra api.nan.builders. */
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

/** El catálogo real de NaN (src/data/modelos.json + la referencia de la API). */
const NAN_MODELS = [
  'deepseek-v4-flash',
  'mimo-v2.5',
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
    // Estos tres responden 404 en api.nan.builders.
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
    // Una sola mención, y dentro de info: la que dice que enterprise usa otra
    // base URL. Cualquier otra sería branding sin migrar.
    const outsideInfo = JSON.stringify({ ...spec, info: undefined });
    expect(outsideInfo.toLowerCase()).not.toContain('helmcode');
  });
});

describe('openapi.json: the model catalogue', () => {
  /**
   * Todo identificador con pinta de modelo que aparezca en la spec tiene que
   * estar en el catálogo. Es la red que evita publicar un modelo que no existe,
   * que es justo lo que pasó una vez con glm5.3 en sentido contrario.
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
   * La tabla de la home (modelos.json) y esta spec se escriben a mano en dos
   * días distintos, así que un modelo puede aterrizar en el clúster, salir en
   * la landing y no llegar nunca a la referencia de la API. Los modelos de chat
   * son los que un miembro copia en el campo `model`, así que son los que se
   * comprueban.
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
 * Los rate limits NO están escritos en la spec: vienen de rateLimits.ts, el
 * módulo que existe porque la página de docs y la API de docs ya se habían
 * desviado una vez (60 rpm contra 100 rpm). Hardcodearlos aquí habría sido una
 * tercera copia, y una que no puede seguir RATE_LIMIT_RPM, que es una env var.
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

  /** Un override por env tiene que llegar a /docs/api, no solo a /docs/models. */
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
