import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';

/**
 * Tripwire sobre src/data/openapi.json, el spec que Scalar renderiza en
 * /docs/api y del que sale el Markdown que consume el bot de Discord.
 *
 * Hace falta porque el spec es un dato, no código: nada lo type-checkea y un
 * error dentro se publica en silencio. Y este spec en concreto se derivó del de
 * helmcode.com, cuyo catálogo y cuyo modelo de cobro NO son los de NaN, así que
 * lo que se vigila sobre todo es que no vuelva a colarse nada de allí.
 *
 * La superficie de endpoints se comprobó contra el backend real sondeando cada
 * ruta: las 12 de aquí responden 401 (existen, piden auth) y /v1/moderations,
 * /v1/batches y /v1/files responden 404 (no están habilitadas en NaN).
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

/** El catálogo real de NaN (src/data/modelos.json + la referencia de API). */
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

describe('openapi.json — estructura', () => {
  it('declara OpenAPI 3.1', () => {
    expect(spec.openapi).toMatch(/^3\.1/);
  });

  it('apunta al servidor de NaN', () => {
    expect(spec.servers?.[0]?.url).toBe('https://api.nan.builders/v1');
  });

  it('todos los $ref resuelven', () => {
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

describe('openapi.json — la superficie es la que el backend sirve de verdad', () => {
  for (const [path, method] of PUBLIC_SURFACE) {
    it(`documenta ${method.toUpperCase()} ${path}`, () => {
      const paths = spec.paths as Record<string, Record<string, unknown>>;
      expect(paths[path], path).toBeDefined();
      expect(paths[path][method], `${method} ${path}`).toBeDefined();
    });
  }

  it('no documenta endpoints que NaN no sirve', () => {
    const documented = Object.keys(spec.paths as Record<string, unknown>);
    // Estos tres responden 404 en api.nan.builders.
    for (const absent of ['/moderations', '/batches', '/files']) {
      expect(documented).not.toContain(absent);
    }
    expect(documented.length).toBe(PUBLIC_SURFACE.length);
  });
});

describe('openapi.json — no queda nada de helmcode.com', () => {
  it('no nombra modelos que NaN no sirve', () => {
    const foreign = raw.match(/\b(claude-[a-z0-9.-]+|gpt-[0-9][a-z0-9.-]*|gemini-[0-9][a-z0-9.-]*)\b/g);
    expect(foreign).toBeNull();
  });

  it('no describe el cobro por crédito prepago ni la reventa', () => {
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

  it('solo menciona Helmcode como la nota del servicio enterprise', () => {
    // Una sola mención, y en info: la que dice que la enterprise usa otra base
    // URL. Cualquier otra sería marca sin migrar.
    const outsideInfo = JSON.stringify({ ...spec, info: undefined });
    expect(outsideInfo.toLowerCase()).not.toContain('helmcode');
  });
});

describe('openapi.json — el catálogo de modelos', () => {
  /**
   * Los identificadores con pinta de modelo que aparecen en el spec tienen que
   * estar todos en el catálogo. Es la red que evita publicar un modelo que no
   * existe, que es justo lo que ya pasó una vez con glm5.2 en sentido inverso.
   */
  it('no cita ningún identificador de modelo fuera del catálogo', () => {
    const cited = new Set(
      (raw.match(/`([a-z0-9][a-z0-9.-]{2,})`/g) ?? [])
        .map((m) => m.slice(1, -1))
        .filter((token) => /^(deepseek|qwen|gemma|glm|mimo|kokoro|whisper|flux|rerank|claude|gpt|gemini|llama|mistral)/.test(token)),
    );
    const unknown = [...cited].filter((m) => !NAN_MODELS.includes(m));
    expect(unknown).toEqual([]);
  });

  it('publica glm5.2 como modelo de chat del tier premium', () => {
    const chat = (spec.paths as any)['/chat/completions'].post.requestBody.content[
      'application/json'
    ].schema.properties.model.description as string;
    expect(chat).toContain('glm5.2');
    expect(chat).toMatch(/premium tier/i);
  });
});
