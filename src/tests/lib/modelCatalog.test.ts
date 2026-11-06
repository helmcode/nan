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
      if (m.quota.kind === 'unmetered' || m.quota.kind === 'packOnly') continue;
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
  const inSnippets = (source: string) => {
    // A BYOK inference object names a model of the member's own provider
    // (/docs/runs#use-your-own-provider-key-byok), not one of ours: its line
    // carries "source": "byok" and is left out. Nothing else is.
    const ours = source
      .split('\n')
      .filter((line) => !/"source"\s*:\s*"byok"/.test(line))
      .join('\n');
    return [
      ...[...ours.matchAll(/"model"\s*:\s*"([^"]+)"/g)].map((m) => m[1]),
      ...[...ours.matchAll(/\bmodel\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
    ];
  };

  it('a BYOK inference line is the only exemption', () => {
    expect(inSnippets('{ "inference": { "source": "byok", "secret": "K", "model": "claude-sonnet-4-5" } }')).toEqual([]);
    expect(inSnippets('{ "source": "nan", "model": "claude-sonnet-4-5" }')).toEqual(['claude-sonnet-4-5']);
  });

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

/**
 * The token-packs-only models (2026-11-06): no plan includes tokens for them,
 * every token comes from a pack balance. Each surface that lists them must say
 * so, or a subscriber reads them as covered by the plan and meets a 402. The
 * upstream that serves them is never named.
 */
describe('token-packs-only models', () => {
  const PACK_ONLY = ['kimi-k3.1-pro', 'qwen3.8-max', 'deepseek-v4-pro', 'hy4'];

  it('are exactly the packOnly models of the catalog, 1M-context chat models', () => {
    expect(MODELS.filter((m) => m.quota.kind === 'packOnly').map((m) => m.id).sort()).toEqual([...PACK_ONLY].sort());
    for (const id of PACK_ONLY) {
      const m = MODELS.find((x) => x.id === id)!;
      expect(m.kind, id).toBe('chat');
      expect(formatContext(m.contextTokens!), id).toBe('1M');
      expect(m.premium, id).toBeFalsy();
    }
  });

  /**
   * Inputs as verified with real requests (2026-11-06): kimi, qwen3.8-max and
   * hy4 read images; deepseek-v4-pro answers 400 "vision not support". Video
   * is listed upstream for some but was never verified, so it is not published.
   */
  it('publish the verified inputs, and never video', () => {
    const VISION = ['kimi-k3.1-pro', 'qwen3.8-max', 'hy4'];
    for (const id of PACK_ONLY) {
      const m = MODELS.find((x) => x.id === id)!;
      expect(m.inputs, id).toEqual(VISION.includes(id) ? ['text', 'image'] : ['text']);
    }
    for (const [dir, img] of [[enDir, 'text · image'], [esDir, 'texto · imagen']] as const) {
      const cards = readFileSync(resolve(dir, 'models.mdx'), 'utf-8');
      const table = readFileSync(resolve(dir, 'choose-a-model.md'), 'utf-8');
      for (const id of PACK_ONLY) {
        const start = cards.indexOf(`name="${id}"`);
        const card = cards.slice(start, cards.indexOf('/>', start));
        const row = table.split('\n').find((l) => l.startsWith(`| \`${id}\` |`)) ?? '';
        expect(card.includes(img), `${dir} card ${id}`).toBe(VISION.includes(id));
        expect(row.includes(img), `${dir} row ${id}`).toBe(VISION.includes(id));
        expect(card, id).not.toMatch(/video|vídeo/i);
      }
    }
    const home = modelos.categorias.flatMap((c) => c.modelos);
    for (const id of PACK_ONLY) {
      const r = home.find((m) => m.id === id)!;
      expect(r.specs.includes('vision'), id).toBe(VISION.includes(id));
      const api = spec.info.description.split('\n').find((l) => l.startsWith(`| \`${id}\` |`)) ?? '';
      expect(api.includes('image input'), id).toBe(VISION.includes(id));
    }
  });

  it('carry a fixed quota label in both languages, never a counter', () => {
    for (const m of MODELS.filter((x) => x.quota.kind === 'packOnly')) {
      expect(quotaLabel(m, 'en')).toBe('token packs only');
      expect(quotaLabel(m, 'es')).toBe('solo token packs');
    }
  });

  it('the home table says "token packs only", translated on the English home', () => {
    const rows = modelos.categorias.flatMap((c) => c.modelos).filter((m) => PACK_ONLY.includes(m.id));
    expect(rows.map((r) => r.id).sort()).toEqual([...PACK_ONLY].sort());
    for (const r of rows) {
      expect(r.cuota, r.id).toBe('solo token packs');
      expect(homeQuotaLabel(r.cuota, 'en')).toBe('token packs only');
      expect('premium' in r && r.premium, r.id).toBeFalsy();
    }
  });

  for (const [label, dir, word] of [
    ['en', enDir, 'token packs only'],
    ['es', esDir, 'solo token packs'],
  ] as const) {
    it(`the decision page marks each one and explains the 402 (${label})`, () => {
      const source = readFileSync(resolve(dir, 'choose-a-model.md'), 'utf-8');
      for (const id of PACK_ONLY) {
        const row = source.split('\n').find((l) => l.startsWith(`| \`${id}\` |`)) ?? '';
        expect(row.trim().endsWith(`| ${word} |`), `${label}: ${id}`).toBe(true);
      }
      expect(source).toContain('`insufficient_balance`');
    });

    it(`each card says token packs only and links to buy them (${label})`, () => {
      const source = readFileSync(resolve(dir, 'models.mdx'), 'utf-8');
      for (const id of PACK_ONLY) {
        const start = source.indexOf(`name="${id}"`);
        expect(start, `${label}: ${id}`).toBeGreaterThan(-1);
        const card = source.slice(start, source.indexOf('/>', start));
        expect(card, `${label}: ${id}`).toContain(word);
        expect(card, `${label}: ${id}`).toContain('https://cloud.nan.builders/tokens');
      }
    });
  }

  it('the API reference lists them as token packs only', () => {
    const desc = spec.info.description;
    for (const id of PACK_ONLY) {
      const row = desc.split('\n').find((l) => l.startsWith(`| \`${id}\` |`)) ?? '';
      expect(row, id).toMatch(/Token packs only \|$/);
    }
  });

  it('no surface names the upstream provider', () => {
    const surfaces = [
      JSON.stringify(modelos),
      spec.info.description,
      ...docFiles.map(([, source]) => source),
    ];
    for (const text of surfaces) expect(text).not.toMatch(/novita/i);
  });
});
