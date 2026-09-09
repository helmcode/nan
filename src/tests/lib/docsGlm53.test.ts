import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getApiDocText } from '../../lib/apiDoc';
import { DEFAULT_RATE_LIMITS } from '../../lib/rateLimits';
import { mdxToText } from '../../lib/mdxToText';

/**
 * Lo que docs/models#glm-5-3 y la referencia de la API publican sobre glm5.3.
 *
 * Las dos páginas describían un modelo que no existe: "not available yet",
 * "requests naming it return a model error" y un contexto de 256K, mientras el
 * modelo se servía en producción y un miembro premium lo estaba usando. Los
 * asserts van sobre el texto que /api/docs sirve de verdad (el mismo extractor
 * que consume el bot de Discord), así que la página y la API se cubren a la vez.
 *
 * Desde la migración a Scalar, la mitad `api` ya no sale de `api.mdx` sino de
 * la spec (src/data/openapi.json) vía openapiToText. La redacción cambió con
 * ello; lo que se asserta sigue siendo lo mismo: que glm5.3 se publica como
 * invocable, con sus límites reales y sin decir de dónde sale.
 */

const here = dirname(fileURLToPath(import.meta.url));

function docBody(slug: string): string {
  const raw = readFileSync(resolve(here, `../../content/docs/${slug}.mdx`), 'utf-8');
  // getEntry().body le pasa a mdxToText el contenido sin frontmatter.
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
}

let models = '';
let api = '';

beforeAll(async () => {
  models = await mdxToText(docBody('models'));
  api = getApiDocText(DEFAULT_RATE_LIMITS);
});

/** Solo la tarjeta de glm5.3, para que un 262K de otro modelo no pueda colarse por ella. */
function glmSection(text: string): string {
  // El encabezado lleva la etiqueta ("### glm5.3 - 753B MoE"), y el espacio es
  // lo que lo separa de `### glm5.3-flash`: otro modelo, otros límites, y
  // respondería primero a un indexOf a secas.
  const start = text.search(/^### glm5\.3 /m);
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\n### ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('docs/models — the glm5.3 card', () => {
  test('does not say the model is unavailable', () => {
    const section = glmSection(models);
    expect(section).not.toMatch(/coming soon/i);
    expect(section).not.toMatch(/not available yet/i);
    expect(section).not.toMatch(/not published on the community api/i);
    expect(section).not.toMatch(/return a model error/i);
  });

  test('publishes the 1M context of 5.3 and not the 500K of 5.2', () => {
    const section = glmSection(models);
    expect(section).toContain('1M token');
    expect(section).toContain('Context: 1M tokens');
    expect(section).not.toContain('500K');
    expect(section).not.toContain('256K');
  });

  /**
   * 5.3 es texto de entrada, texto de salida. La tarjeta afirmó durante semanas
   * que aceptaba imágenes, copiado del anuncio de 5.3; el multimodal es `glm5.3-flash`.
   */
  test('does not claim image input', () => {
    const section = glmSection(models);
    expect(section).toContain('Input modalities: text');
    expect(section).not.toContain('Input modalities: text · image');
    expect(section).not.toMatch(/vision|image input/i);
  });

  /**
   * La etiqueta de la spec nombraba la ventana equivocada: `Monthly quota` iba
   * dos líneas debajo de una descripción que dice que el contador vuelve a cero
   * cuando empieza el PERIODO DE FACTURACIÓN. glm5.3 es el único modelo cuyo
   * tope no es el mes natural (usage_quota.go borra el mes por defecto y estampa
   * el periodo de Stripe), así que usa la etiqueta que RateLimits.astro ya publica para él.
   */
  test('documents the allowance with the window it actually resets on', () => {
    const section = glmSection(models);
    expect(section).toContain('Allowance / billing period: 3,000M tokens / member');
    expect(section).not.toMatch(/Monthly quota/);
    expect(section).toMatch(/billing period starts/);
  });

  test('documents the rolling window that a coding agent reaches first', () => {
    const section = glmSection(models);
    expect(section).toContain('400M tokens');
    expect(section).toMatch(/4h window/);
  });

  test('says the tier is required to call it', () => {
    expect(glmSection(models)).toMatch(/premium/i);
  });
});

describe('docs/api — glm5.3 is callable', () => {
  test('is listed among the chat models the `model` field accepts', () => {
    const row = api.split('\n').find((l) => /^\|\s*`model`\s*\|/.test(l));
    expect(row).toBeDefined();
    expect(row).toContain('`glm5.3`');
  });

  test('no surface still says it is coming soon or not callable', () => {
    expect(api).not.toMatch(/coming soon/i);
    expect(api).not.toMatch(/not callable/i);
    expect(api).not.toMatch(/not available yet/i);
  });

  test('the model catalog carries its context and the tier it needs', () => {
    const row = api.split('\n').find((l) => /^\|\s*`glm5\.3`\s*\|/.test(l));
    expect(row).toBeDefined();
    expect(row).toContain('1M-token context');
    expect(row).toMatch(/premium tier/i);
    expect(row).not.toContain('256K');
    // La fila del catálogo también listaba visión. Es el único modelo de chat sin ella.
    expect(row).not.toMatch(/vision/i);
  });

  test('the 4h window is spelled out, not left as small print', () => {
    expect(api).toContain('400M tokens per rolling 4 hours');
    expect(api).toContain('3,000M-token allowance');
    expect(api).toMatch(/rolling, not a daily reset/);
    expect(api).toMatch(/billing period starts/);
  });

  test('the errors table documents the statuses the limits return', () => {
    // La tabla "## Errors", no las de cada endpoint (web search tiene sus
    // propias filas 429 y respondería primero).
    const section = api.slice(api.indexOf('## Errors'));
    expect(section.length).toBeGreaterThan(0);
    const rows = section.split('\n').filter((l) => l.startsWith('|'));
    const status = (code: string) =>
      rows.find((l) => new RegExp(`^\\|\\s*\`${code}\`\\s*\\|`).test(l));
    expect(status('402')).toMatch(/token allowance for the billing period is spent/i);
    expect(status('402')).toContain('monthly_cap_reached');
    expect(status('429')).toMatch(/rolling 4h token budget of `glm5\.3`/);
  });

  /**
   * El 402 dejó de ser el crédito prepago de helmcode. Si al reconstruir la
   * spec vuelve ese texto, estaríamos publicando otra vez un modelo de
   * facturación que NaN no tiene.
   */
  test('does not describe a prepaid-credit billing model', () => {
    expect(api).not.toMatch(/prepaid|credit balance|credits_exhausted|top ?up/i);
  });
});

describe('no published surface reveals how glm5.3 is sourced', () => {
  test('neither page names an upstream provider or calls the model resold', () => {
    for (const [name, text] of [
      ['models', () => models],
      ['api', () => api],
    ] as const) {
      expect(text(), name).not.toMatch(/openrouter|z\.ai|zhipu|bigmodel/i);
      expect(text(), name).not.toMatch(/resold|reseller|upstream provider|third.party provider/i);
    }
  });
});
