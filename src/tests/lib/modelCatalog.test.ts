import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import modelos from '../../data/modelos.json';
import spec from '../../data/openapi.json';
import { MODEL_IDS, MODELS, formatContext, homeQuotaLabel, quotaLabel } from '../../lib/modelCatalog';

/**
 * The model ids, checked across every surface that writes one.
 *
 * This exists because they had already drifted in both directions and neither
 * failed a build: the home table published the reranker as `qwen3-reranker`
 * while the API answers to `rerank` (copy that id and you get a 404), and
 * `flux-2-klein` was served by the API while being absent from the table.
 * Reviewing a table of ids by eye does not catch either, so it is done here.
 *
 * What is asserted is the SPELLING and the SET, never the prose: the model
 * cards say what they like about a model, but they cannot name one that does
 * not exist.
 */

const here = dirname(fileURLToPath(import.meta.url));
const enDir = resolve(here, '../../content/docs');
const esDir = resolve(here, '../../content/docs-es');

const docFiles = [enDir, esDir].flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.(md|mdx)$/.test(f))
    .map((f) => [`${dir.endsWith('docs') ? 'en' : 'es'}/${f}`, readFileSync(resolve(dir, f), 'utf-8')] as const),
);

describe('the catalog itself', () => {
  it('has no duplicate ids', () => {
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length);
  });

  it('gives every chat model a context window and its inputs', () => {
    for (const m of MODELS.filter((m) => m.kind === 'chat')) {
      expect(m.contextTokens, m.id).toBeGreaterThan(0);
      expect(m.inputs?.length, m.id).toBeGreaterThan(0);
    }
  });

  /** An unmetered model has no label to show, a metered one must have both. */
  it('labels every quota that is not unmetered, in both languages', () => {
    for (const m of MODELS) {
      if (m.quota.kind === 'unmetered') continue;
      expect(m.quota.label?.en, m.id).toBeTruthy();
      expect(m.quota.label?.es, m.id).toBeTruthy();
    }
  });

  /**
   * glm5.3's counter follows the Stripe billing period, not the calendar
   * month. Writing it as monthly is the mistake every surface made once.
   */
  it('does not publish the premium allowance as monthly', () => {
    const glm = MODELS.find((m) => m.id === 'glm5.3')!;
    expect(glm.quota.kind).toBe('billingPeriod');
    expect(quotaLabel(glm, 'es')).not.toContain('/mes');
    expect(quotaLabel(glm, 'en')).not.toMatch(/\/ mo\b/);
  });

  /** 262144 was published as both "262K" and "256K". One number, one label. */
  it('writes a context window the same way everywhere', () => {
    expect(formatContext(262_144)).toBe('262K');
    expect(formatContext(1_000_000)).toBe('1M');
  });
});

describe('the home table (src/data/modelos.json)', () => {
  const homeIds = modelos.categorias.flatMap((c) => c.modelos.map((m) => m.id)).sort();

  it('lists exactly the models in the catalog', () => {
    expect(homeIds).toEqual([...MODEL_IDS].sort());
  });

  it('marks as premium exactly the models the catalog does', () => {
    const homePremium = modelos.categorias
      .flatMap((c) => c.modelos)
      .filter((m) => 'premium' in m && m.premium)
      .map((m) => m.id)
      .sort();
    expect(homePremium).toEqual(MODELS.filter((m) => m.premium).map((m) => m.id).sort());
  });
});

describe('the model cards of /docs/models', () => {
  /** `id=` on the card is an HTML anchor; `name=` is the API id. */
  const cardIds = (source: string) =>
    [...source.matchAll(/<ModelCard[\s\S]*?name="([^"]+)"/g)].map((m) => m[1]);

  for (const dir of [enDir, esDir]) {
    const label = dir.endsWith('docs') ? 'en' : 'es';
    it(`names only real models (${label})`, () => {
      const names = cardIds(readFileSync(resolve(dir, 'models.mdx'), 'utf-8'));
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(MODEL_IDS, `${label}: ${name}`).toContain(name);
      }
    });

    it(`leaves no model out of the reference (${label})`, () => {
      const names = new Set(cardIds(readFileSync(resolve(dir, 'models.mdx'), 'utf-8')));
      for (const id of MODEL_IDS) {
        expect([...names], `${label}: ${id} has no card`).toContain(id);
      }
    });
  }
});

describe('the snippets in the guides', () => {
  /**
   * Names that appear in a `model` field without being ids of ours.
   *
   * The Claude Code guide sets up a local LiteLLM gateway, and a gateway
   * renames what it proxies: `nan-coder` is a label the reader invents in
   * their own config, and the request that reaches us carries the real id from
   * `litellm_params`. They are listed one by one rather than skipping the file
   * so that a genuine typo inside that same guide still fails.
   */
  const GATEWAY_ALIASES = new Set(['nan-coder', 'nan-general']);

  /**
   * Every id a reader can copy out of a code block and paste into a request.
   * Both the JSON field and the keyword-argument form the SDK snippets use.
   */
  const inSnippets = (source: string) => [
    ...[...source.matchAll(/"model"\s*:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/\bmodel\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
  ];

  for (const [label, source] of docFiles) {
    it(`only name models that exist (${label})`, () => {
      for (const id of inSnippets(source)) {
        if (GATEWAY_ALIASES.has(id)) continue;
        expect(MODEL_IDS, `${label}: "${id}"`).toContain(id);
      }
    });
  }
});

describe('the decision page', () => {
  /**
   * The flat table of /docs/choose-a-model, which is the page a newcomer is
   * sent to when they do not know which id to write. A model missing from it
   * is a model nobody picks; an id spelled wrong there is a 404 the reader
   * copies by hand. Only rows whose FIRST cell is a backticked id count, so
   * the "what do I want to do" table above it is left alone.
   */
  for (const [label, dir] of [
    ['en', enDir],
    ['es', esDir],
  ] as const) {
    it(`lists exactly the models in the catalog (${label})`, () => {
      const source = readFileSync(resolve(dir, 'choose-a-model.md'), 'utf-8');
      const listed = [...source.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
      expect([...listed].sort()).toEqual([...MODEL_IDS].sort());
    });
  }
});

describe('the model catalog of the API reference', () => {
  /**
   * The table under "## Model catalog" inside `info.description`. It is the
   * copy the Discord bot serves, so an id missing there is an id nobody
   * building a client finds.
   */
  const section = (() => {
    const text = spec.info.description;
    const start = text.indexOf('## Model catalog');
    expect(start).toBeGreaterThan(-1);
    const rest = text.slice(start);
    const end = rest.indexOf('\n## ', 1);
    return end === -1 ? rest : rest.slice(0, end);
  })();

  const listed = [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);

  it('lists exactly the models in the catalog', () => {
    expect([...listed].sort()).toEqual([...MODEL_IDS].sort());
  });
});

/**
 * ONE DATA FILE, TWO HOMEPAGES, and only half of it was translated.
 *
 * `src/data/modelos.json` is written in Spanish and rendered on `/` and on
 * `/es`. The quota chip goes through `homeQuotaLabel`, so it comes out in the
 * right language; the `specs` line does not go through anything, so whatever
 * is written there is what both pages show. It read "67 voces" on the English
 * homepage, next to eleven other rows that were in English, for as long as the
 * Kokoro row has existed.
 *
 * Two rules follow. `specs` is the language-neutral technical line, so it
 * carries no Spanish; and every `cuota` actually written in the file has to
 * come out of the translator with no Spanish left, which is the part that
 * silently breaks when somebody adds a model with a new phrasing.
 */
describe('the shared home table reads in both languages', () => {
  const SPANISH = /[¿¡ñáéíóú]|\b(voces|idiomas|imagen|peticiones|mes|sin contador|por)\b/i;

  const rows = modelos.categorias.flatMap((c) => c.modelos);

  it.each(rows.map((m) => [m.id, m.specs] as const))('%s: specs are neutral', (id, specs) => {
    expect(specs, `${id}: "${specs}" prints as-is on the English homepage`).not.toMatch(SPANISH);
  });

  it.each([...new Set(rows.map((m) => m.cuota))])('quota "%s" translates', (cuota) => {
    expect(homeQuotaLabel(cuota, 'en')).not.toMatch(SPANISH);
    expect(homeQuotaLabel(cuota, 'es')).toBe(cuota);
  });
});
