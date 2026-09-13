import { describe, expect, test } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { formatTokens } from '../../lib/rateLimits';

/**
 * The opencode.json block the docs publish must be a config opencode can
 * actually read, for the models a member can actually call.
 *
 * It was neither, for three months (helmcode/nan#8). Two independent faults:
 *
 *  1. The context window was published as `contextWindow`, which is NOT a
 *     property of https://opencode.ai/config.json. `limit: { context, output }`
 *     is, and both sub-fields are `required`. An unknown key is not an error a
 *     member sees - opencode simply falls back to its own assumption about the
 *     window, so the symptom is bad compaction on a 262K model, not a crash.
 *     That is exactly the failure this file exists to catch: wrong, silent,
 *     and plausible.
 *
 *  2. The model list said "the 4 available LLM models" while every community
 *     team carried ten entries, six of them chat models. A member reading the
 *     docs could not discover `glm5.3-flash` or `qwen3.8-flash` at all.
 *
 * The numbers are pinned as literals ON PURPOSE. The authoritative source is
 * `modelRateLimits` in cloud-api (`internal/handlers/usage_quota.go`), whose
 * own comment says it is "the model's REAL context window, not LiteLLM
 * metadata" - but that is a different repository, so this suite cannot import
 * it. A literal that a human copied and a test defends is worth more than a
 * number nobody checks; when the platform moves one, this test fails and the
 * docs get updated in the same commit instead of three months later.
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `limit.context` is THE WINDOW UPSTREAM ACTUALLY SERVES, and it is NOT
 * `modelRateLimits.ContextWindow` in cloud-api. That field feeds the ITPM
 * calculation (window x FillsPerMin), which is a rate policy and not a limit on
 * any single prompt.
 *
 * AN EARLIER VERSION OF THIS COMMENT SAID "the window the proxy REJECTS above",
 * and that mechanism is false. `litellm-community-ratelimit-hook-cm.yaml:363`
 * measured it on 1.83.14: "model_info.max_input_tokens governs nothing today --
 * its only consumer, Router._pre_call_checks, is off (enable_pre_call_checks
 * defaults False and neither tenant sets it)... no prompt is rejected for
 * exceeding either". Confirmed here: `enable_pre_call_checks` appears in no
 * values file for either tenant. The numbers below are still the right ones to
 * publish -- upstream serves those windows, so a member cannot exceed them --
 * but the rejection comes from the PROVIDER, not from our proxy, and a comment
 * that names the wrong enforcement point sends the next person to read the
 * wrong code.
 *
 * The source, in order:
 *   1. `model_info.max_input_tokens` on the deployment where it is set. Not
 *      because it is enforced, but because it is the number we declared for
 *      that upstream and the one our own routing debt is written against.
 *   2. otherwise the served window: `--max-model-len` for the models we host,
 *      the model card on /docs/models for the ones we resell.
 *
 * Measured 2026-09-11 against the community proxy's `LiteLLM_ProxyModelTable`
 * and, for qwen3.6, the live `--max-model-len=262144` on the five
 * `vllm-qwen36-*` deployments in `nan-inference`:
 *
 *   deepseek-v4-flash  1048575 declared      glm5.3        1048576 declared
 *   qwen3.8-flash       262144 declared      glm5.3-flash  1048576 declared
 *   qwen3.6             262144 --max-model-len
 *   gemma4              262144 model card    mimo-v2.5     1048576 model card
 *
 * EVERY DISAGREEMENT WITH `modelRateLimits`, since the previous version of this
 * list claimed to be complete and was not:
 *   * qwen3.8-flash -- 262144 here, 1_048_576 there ("YaRN extends the native
 *     window to 1M, which is what we expose to members") while the deployment
 *     declares 262144 and the model card calls 262K "the model's native
 *     window". Tracked as helmcode/nan#53; it also inflates that model's ITPM
 *     fourfold.
 *   * mimo-v2.5 -- 1048576 here against 1_050_000 there. 1,424 tokens.
 *   * deepseek-v4-flash -- 1048575 here against 1_048_576 there. ONE token,
 *     and the odd number is the real declaration, corroborated at
 *     `litellm-community/values.yaml:199`.
 * The three GLM groups agree since cloud-api `8aa5496` raised them to 1M.
 * `output` is NOT a server cap for the self-hosted models -- vLLM bounds the
 * completion by the context window minus the prompt, with no separate limit.
 * It is the budget opencode plans a turn against, and the values here are the
 * ones this site already publishes elsewhere (qwen3.6 at 65536 in the openclaw
 * block) or that LiteLLM advertises (deepseek-v4-flash `max_output_tokens`
 * 32768). A member may raise it.
 *
 * glm5.2 IS DELIBERATELY ABSENT, and the reason is an OWNER DECISION, not only
 * a measurement: it was kept as a reference point for 5.3 and is being retired
 * (stated 2026-09-11). Corroborating and reproducible from the repo alone: it
 * has no card in `src/data/modelos.json` and none on /docs/models, so there is
 * nothing to link a member to. Several repos still treat it as live
 * (`usage_quota.go` premiumModels, the hook's GATED_MODELS), which is exactly
 * why not publishing it is the safe direction while it is torn down.
 */
/**
 * The key placeholders the guides legitimately use, one per locale plus the
 * older `-here` form the examples page still writes.
 *
 * `sk-local-change-this` is not a NaN key: it is the master key of the local
 * LiteLLM gateway on the Claude Code page, which the reader is told to change
 * and which never leaves their machine. Listed so the scan below can stay
 * strict about everything else.
 */
const ALLOWED_PLACEHOLDERS = new Set([
  'sk-',
  'sk-...',
  'sk-your-key',
  'sk-your-key-here',
  'sk-tu-clave',
  'sk-local-change-this',
  'sk-local-cambia-esto',
]);

const EXPECTED_MODELS: Record<string, { context: number; output: number }> = {
  'qwen3.6': { context: 262_144, output: 65_536 },
  gemma4: { context: 262_144, output: 65_536 },
  'deepseek-v4-flash': { context: 1_048_575, output: 32_768 },
  'qwen3.8-flash': { context: 262_144, output: 32_768 },
  'mimo-v2.5': { context: 1_048_576, output: 32_768 },
  'glm5.3-flash': { context: 1_048_576, output: 32_768 },
};

/** Premium-only, and served: it has a deployment and a model card. */
const EXPECTED_PREMIUM: Record<string, { context: number; output: number }> = {
  'glm5.3': { context: 1_048_576, output: 32_768 },
};

/**
  * Not "a model with no deployment": glm5.2 IS served, as a `model_group_alias`
  * over glm5.3 since 2026-09-02 (GLM52-PREMIUM-TIER.md). It is excluded because
  * it is being retired and has no model card, which is the reasoning written
  * above - an error message that asserts something the repo contradicts is
  * expensive in a file whose whole argument is that a literal is only worth
  * what its justification is.
  */
const MUST_NOT_PUBLISH = ['glm5.2'];

/**
 * THE SCHEMA IS VENDORED, NOT LISTED. An earlier revision pinned the model-entry
 * property names as a literal, which checked only TOP-LEVEL keys: the #52
 * reviewer walked five hard violations past it with the suite green -- a
 * `cost` missing its required `output`, a `limit.maxTokens` (that object is
 * `additionalProperties:false` too), a `"screenshot"` modality, a `status` of
 * `"retired"`, and `tool_call: "yes"` where a boolean belongs. A list of names
 * cannot see types, enums, required-ness, or one level down.
 *
 * So the real schema is checked in, and the published blocks are validated
 * against it with ajv. Vendored rather than fetched so the suite stays
 * hermetic: a network call inside CI fails for reasons that have nothing to do
 * with this repo.
 *
 * Refresh it with:
 *   curl -fsSL https://opencode.ai/config.json \
 *     -o src/tests/fixtures/opencode.config.schema.json
 * Fetched 2026-09-11, 39,039 bytes, Draft 2020-12, 18 model properties.
 */
const OPENCODE_SCHEMA = JSON.parse(
  readFileSync(resolve(here, '../fixtures/opencode.config.schema.json'), 'utf-8'),
);

/**
 * REQUIRED FOR ajv TO COMPILE, and nothing more. `$defs.Model` here is a
 * `{type: "string", enum: [...]}` of 7,742 `provider/model` ids, referenced from
 * `Config.model`, `Config.small_model`, `Config.command.*.model` and
 * `AgentConfig.model` -- NOT from the provider's model entries, which the
 * opencode schema defines itself. An earlier version of this comment claimed it
 * validated the model entry; it does not. Without it ajv refuses to compile the
 * whole schema ("can't resolve reference ...#/$defs/Model"), which is the honest
 * failure and the reason the first attempt at this test was red.
 *
 *   curl -fsSL https://models.dev/model-schema.json \\
 *     -o src/tests/fixtures/models.dev.model-schema.json
 */
const MODELS_DEV_SCHEMA = JSON.parse(
  readFileSync(resolve(here, '../fixtures/models.dev.model-schema.json'), 'utf-8'),
);

/**
 * VS Code publishes prose, not a JSON schema, so this one stays a list -- but a
 * COMPLETE one. The reviewer found six documented properties missing, which is
 * the failure the literal creates in the other direction: a legitimate future
 * config rejected, with an error message asserting something false ("streaming
 * is not a documented VS Code model property" -- it is, and it defaults to
 * true). From the Model configuration reference, 2026-09-11.
 */
const VSCODE_MODEL_PROPS = new Set([
  'id', 'name', 'url', 'toolCalling', 'vision', 'maxInputTokens', 'maxOutputTokens',
  'thinking', 'supportsReasoningEffort', 'apiType', 'editTools',
  'contextWindow', 'modelOptions', 'reasoningEffortFormat', 'requestHeaders',
  'streaming', 'zeroDataRetentionEnabled',
]);

/**
 * The model catalogue this very site publishes at /docs/models. Anchoring to it
 * closes the #8 bug class at its root: the reviewer deleted `qwen3.8-flash`
 * from both blocks, from the prose and from EXPECTED_MODELS and the suite
 * passed, because a hand-maintained literal validated against itself while
 * /docs/models went on advertising the model. This is in-repo and hermetic,
 * so there is no excuse for the two pages to disagree.
 */
const CATALOGUE_LLMS: string[] = (() => {
  const data = JSON.parse(readFileSync(resolve(here, '../../data/modelos.json'), 'utf-8'));
  const llm = data.categorias.find((c: any) => c.id === 'llm');
  return llm.modelos.map((m: any) => m.id);
})();

const LOCALES = ['docs', 'docs-es'] as const;

/**
 * WHERE THE BLOCKS LIVE, since helmcode/nan#56.
 *
 * They used to sit in `examples.md`, all of them on one page. The agent-setup
 * section moved each one next to the tool it configures, which is where a
 * member now lands from the nav: opencode.json on the OpenCode page,
 * chatLanguageModels.json on the VS Code one. This suite follows them rather
 * than pinning the old location, because the config nobody reads is not what
 * it guards: it guards the config a member copies.
 */
function pageBody(locale: string, page: string): string {
  return normalize(readFileSync(resolve(here, `../../content/${locale}/${page}`), 'utf-8'));
}

/**
 * CRLF out, always.
 *
 * This repo is written on Windows with `core.autocrlf=true`, so the committed
 * blob is LF while the working tree is CRLF. Every pattern here is anchored on
 * `\n`, so without this the suite passes in CI and fails on the machine of the
 * person who just edited the page, which is the worst place for it to fail.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function jsonBlocks(body: string): string[] {
  return [...body.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
}

/** The opencode block, found by its own $schema rather than by position. */
function opencodeConfig(locale: string): any {
  const raw = jsonBlocks(pageBody(locale, 'opencode.mdx'))
    .find((b) => b.includes('opencode.ai/config.json'));
  expect(raw, `${locale}: no json block declares the opencode schema`).toBeDefined();
  return JSON.parse(raw as string);
}

describe.each(LOCALES)('opencode.json published in %s', (locale) => {
  test('parses as JSON and keeps the schema pointer', () => {
    const cfg = opencodeConfig(locale);
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.provider?.nan?.options?.baseURL).toBe('https://api.nan.builders/v1');
  });

  /**
   * `ProviderConfig.options` is the ONE object in the opencode schema left
   * free-form (`additionalProperties` unset), so the validator above cannot see
   * inside it - and that is where the credential lives. The reviewer renamed
   * `apiKey` to `api_key`, a plausible slip on a page full of `api_key=` in its
   * Python examples, and the suite passed: a member copying it builds a
   * provider with NO credential and gets a 401 on every call. Three paragraphs
   * above, this same page teaches that a 401 means a missing premium tier -
   * so the wrong field name sends them to check exactly the wrong thing.
   * Same profile as `contextWindow`: silently ignored, symptom pointing
   * elsewhere. Pinned by hand because the schema will not do it.
   */
  test('the provider options carry the credential under the name opencode reads', () => {
    const options = opencodeConfig(locale).provider.nan.options;
    expect(Object.keys(options).sort()).toEqual(['apiKey', 'baseURL']);
    // A placeholder, and each locale writes its own: what has to hold is that
    // the field is `apiKey` and that no real key is published, not that the
    // Spanish page says `sk-your-key-here` in English.
    expect(ALLOWED_PLACEHOLDERS.has(options.apiKey), `${locale}: ${options.apiKey}`).toBe(true);
  });

  test('no model uses contextWindow, which opencode does not read', () => {
    const models = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    const offenders = Object.entries(models)
      .filter(([, m]) => 'contextWindow' in m)
      .map(([id]) => id);
    expect(offenders, 'contextWindow is not in opencode\'s schema; use limit.context').toEqual([]);
  });

  test('every model carries limit.context AND limit.output, both required by the schema', () => {
    const models = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    for (const [id, m] of Object.entries(models)) {
      expect(typeof m.limit?.context, `${id}: limit.context`).toBe('number');
      expect(typeof m.limit?.output, `${id}: limit.output`).toBe('number');
    }
  });

  test('publishes exactly the served models, community plus premium', () => {
    const models = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    const expected = [...Object.keys(EXPECTED_MODELS), ...Object.keys(EXPECTED_PREMIUM)].sort();
    expect(Object.keys(models).sort()).toEqual(expected);
  });

  test('every context window matches the platform, not a stale copy', () => {
    const models = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    for (const [id, want] of Object.entries({ ...EXPECTED_MODELS, ...EXPECTED_PREMIUM })) {
      expect(models[id]?.limit?.context, `${id}: context`).toBe(want.context);
      expect(models[id]?.limit?.output, `${id}: output`).toBe(want.output);
    }
  });

  test('does not publish a model that is being retired', () => {
    const models = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    for (const dead of MUST_NOT_PUBLISH) {
      expect(Object.keys(models), `${dead} is being retired and has no model card; it must not be published`)
        .not.toContain(dead);
    }
  });

  test('the prose states the model count, and states it right', () => {
    const body = pageBody(locale, 'opencode.mdx');
    const claimed = body.match(/(?:the|los)\s+(\d+)\s+(?:LLM models|modelos LLM)/i);
    // NOT conditional. The previous version only asserted `if (claimed)`, so any
    // rewording of the sentence it guards - "7 LLM models available", "los 4
    // modelos disponibles" - silently disabled it and the prose could lie freely.
    expect(claimed, `${locale}: the prose must state the model count in the pinned form`)
      .not.toBeNull();
    const total = Object.keys(EXPECTED_MODELS).length + Object.keys(EXPECTED_PREMIUM).length;
    expect(Number(claimed![1]), `prose count vs published models`).toBe(total);
  });

  test('the prose names exactly the models the block publishes', () => {
    const body = pageBody(locale, 'opencode.mdx');
    const sentence = body.match(/(?:This is the config|Esta es la configuración)[\s\S]*?\n\n/);
    expect(sentence, `${locale}: intro sentence`).not.toBeNull();
    const named = new Set([...sentence![0].matchAll(/`([a-z0-9.\-]+)`/g)].map((m) => m[1])
      .filter((t) => !t.startsWith('limit.')));
    const published = new Set(Object.keys(opencodeConfig(locale).provider.nan.models));
    expect([...named].sort(), 'a name in the prose that is not published, or vice versa')
      .toEqual([...published].sort());
  });

  /*
   * Measured, not argued. This assertion lives with the model catalogue below
   * rather than here, because the page that has to say it is
   * /docs/choose-a-model, not the opencode config.
   */

  test('validates against the real opencode schema, not a list of key names', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema(MODELS_DEV_SCHEMA, 'https://models.dev/model-schema.json');
    const validate = ajv.compile(OPENCODE_SCHEMA);
    const ok = validate(opencodeConfig(locale));
    const errs = (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
    expect(errs, `${locale}: the published block does not satisfy opencode's schema`).toEqual([]);
    expect(ok).toBe(true);
  });

  test('publishes every LLM the site advertises on /docs/models, and no other', () => {
    const published = Object.keys(opencodeConfig(locale).provider.nan.models);
    expect([...published].sort(), 'the config and /docs/models disagree about the model list')
      .toEqual([...CATALOGUE_LLMS].sort());
  });
});

/**
 * The VS Code block (helmcode/nan#9). Same models, same windows, different
 * schema: https://code.visualstudio.com/docs/agent-customization/language-models
 * uses `maxInputTokens` / `maxOutputTokens` rather than a `limit` object, and
 * the provider must declare `vendor: "customendpoint"`.
 *
 * `url` carries the FULL endpoint path. VS Code appends `/chat/completions`
 * when the URL has none, so the base URL also works -- but its documentation
 * asks for the explicit path, and a base URL that silently gets the wrong
 * suffix appended is the failure mode this whole file exists for.
 */
function vscodeConfig(locale: string): any {
  const raw = jsonBlocks(pageBody(locale, 'vscode.mdx'))
    .find((b) => b.includes('"vendor": "customendpoint"'));
  expect(raw, `${locale}: no json block declares a VS Code custom endpoint`).toBeDefined();
  return JSON.parse(raw as string);
}

describe.each(LOCALES)('chatLanguageModels.json published in %s', (locale) => {
  test('is an array with one customendpoint provider', () => {
    const cfg = vscodeConfig(locale);
    expect(Array.isArray(cfg)).toBe(true);
    expect(cfg).toHaveLength(1);
    expect(cfg[0].vendor).toBe('customendpoint');
    expect(cfg[0].apiType).toBe('chat-completions');
  });

  test('the api key is an input reference, never a literal', () => {
    expect(vscodeConfig(locale)[0].apiKey).toMatch(/^\$\{input:/);
  });

  test('every model points at the full endpoint path', () => {
    for (const m of vscodeConfig(locale)[0].models) {
      expect(m.url, `${m.id}: url`).toBe('https://api.nan.builders/v1/chat/completions');
    }
  });

  /**
   * VS Code ADDS THE TWO AND CALLS THE SUM THE WINDOW. Its reference: "The sum
   * of `maxInputTokens` and `maxOutputTokens` must not exceed the model's
   * context window... Typically, you set `maxInputTokens` to the model's
   * context window size minus `maxOutputTokens`."
   *
   * This published the FULL window as `maxInputTokens` and an output budget on
   * top, on all seven models, and the earlier version of this test cemented it
   * (`expect(maxInputTokens).toBe(w.context)`). VS Code therefore believed
   * qwen3.6 held 327,680 tokens, 25% more than it does, showed context usage
   * against that number, and let the conversation grow until the proxy returned
   * a context-length error mid-session - no compaction warning, just a failure
   * pointing at the wrong thing.
   *
   * Asserted as the SUM, which is the provider's stated invariant, rather than
   * as another literal that can be copied wrong in the same way.
   */
  test('splits the window between input and output, as VS Code requires', () => {
    const vs = Object.fromEntries(
      vscodeConfig(locale)[0].models.map((m: any) => [m.id, m]),
    );
    const want = { ...EXPECTED_MODELS, ...EXPECTED_PREMIUM };
    expect(Object.keys(vs).sort()).toEqual(Object.keys(want).sort());
    for (const [id, w] of Object.entries(want)) {
      expect(vs[id].maxOutputTokens, `${id}: maxOutputTokens`).toBe(w.output);
      expect(vs[id].maxInputTokens + vs[id].maxOutputTokens,
        `${id}: input+output must equal the window, not exceed it`).toBe(w.context);
    }
  });

  test('does not publish a model that is being retired', () => {
    const ids = vscodeConfig(locale)[0].models.map((m: any) => m.id);
    for (const dead of MUST_NOT_PUBLISH) expect(ids).not.toContain(dead);
  });

  test('vision agrees with the opencode block, model by model', () => {
    const oc = opencodeConfig(locale).provider.nan.models as Record<string, any>;
    for (const m of vscodeConfig(locale)[0].models) {
      const ocVision = oc[m.id].modalities.input.includes('image');
      expect(m.vision, `${m.id}: vision`).toBe(ocVision);
    }
  });

  test('uses no VS Code property the schema rejects', () => {
    for (const m of vscodeConfig(locale)[0].models) {
      for (const k of Object.keys(m)) {
        expect(VSCODE_MODEL_PROPS.has(k), `${m.id}: "${k}" is not a documented VS Code model property`).toBe(true);
      }
    }
  });

  test('does not publish fields we have not measured', () => {
    // 'audio' is NOT here: it is an opencode modality, not a VS Code property,
    // so VSCODE_MODEL_PROPS already rejects it and listing it was a dead
    // assertion. The page said "three fields" and then said audio was not in
    // the schema at all; both cannot be true. It is two.
    const unmeasured = ['supportsReasoningEffort', 'editTools'];
    for (const m of vscodeConfig(locale)[0].models) {
      for (const f of unmeasured) {
        expect(m, `${m.id}: ${f} is published but unmeasured`).not.toHaveProperty(f);
      }
    }
  });
});

/**
 * THE SAME WINDOW, WHEREVER IT IS WRITTEN.
 *
 * The config blocks carry the exact figure because a client parses them; the
 * model cards and the home table carry it rounded because a person reads them.
 * Those are two representations of ONE number, and nothing kept them together:
 * `gemma4` and `qwen3.6` were published as "256K tokens" on /docs/models and as
 * `262144` in the opencode block, which is the same window written in the two
 * conventions -- binary on the card, decimal in the config. A reader comparing
 * the two pages cannot tell that from a stale number, and the docs already got
 * caught once publishing a window that was neither.
 *
 * `formatTokens` is the rounding the site itself uses (floor, never up), so
 * this asserts the card against the function rather than against a second
 * literal, and a change to the convention updates both at once.
 */
describe.each(LOCALES)('the rounded windows in %s match the exact ones', (locale) => {
  const WINDOWS = { ...EXPECTED_MODELS, ...EXPECTED_PREMIUM };
  const body = pageBody(locale, 'models.mdx');

  /** The `<ModelCard>` whose `name=` is this id, as raw source. */
  function card(id: string): string {
    const found = body
      .split('<ModelCard')
      .find((chunk) => new RegExp(`name="${id.replace(/\./g, '\\.')}"`).test(chunk));
    expect(found, `${locale}: no model card for ${id}`).toBeDefined();
    return found as string;
  }

  test.each(Object.keys(WINDOWS))('%s', (id) => {
    const spec = /label: '(?:Context|Contexto)', value: '([^']+)'/.exec(card(id));
    expect(spec, `${locale}/${id}: the card publishes no context spec`).not.toBeNull();
    expect(spec![1]).toBe(`${formatTokens(WINDOWS[id].context)} tokens`);
  });
});

/**
 * The home table reads from the same catalogue the cards do, and writes the
 * window into a free-prose `specs` string, which is the one place a number can
 * drift without any consumer noticing. Only the models that state a window are
 * checked: `kokoro` or `rerank` have nothing to state.
 */
test('the home table states the same window as the config blocks', () => {
  const catalogue = JSON.parse(
    readFileSync(resolve(here, '../../data/modelos.json'), 'utf-8'),
  ) as { categorias: Array<{ modelos: Array<{ id: string; specs: string }> }> };

  const WINDOWS: Record<string, { context: number }> = {
    ...EXPECTED_MODELS,
    ...EXPECTED_PREMIUM,
  };

  for (const cat of catalogue.categorias) {
    for (const model of cat.modelos) {
      const stated = /(\d+(?:\.\d+)?[KM]) context/.exec(model.specs);
      if (!stated) continue;
      const expected = WINDOWS[model.id];
      expect(expected, `${model.id}: states a window but has no measured one`).toBeDefined();
      expect(stated[1], `${model.id} on the home table`).toBe(formatTokens(expected.context));
    }
  }
});

/**
 * NO REAL KEY ANYWHERE IN THE GUIDES, in any block or any prose line.
 *
 * The #52 version scanned one page, because one page held every config. They
 * are spread over the agent-setup section now, so this reads all of them: a
 * scan that covers the page a credential is least likely to be pasted into is
 * not worth much.
 *
 * The placeholders each page legitimately uses are allowed BY NAME. Everything
 * else shaped like a key fails. A real community key is 40+ characters of
 * base62 after the prefix, so the 20-character floor clears the placeholders
 * with room and still catches anything genuine.
 */
const GUIDE_PAGES = LOCALES.flatMap((locale) =>
  readdirSync(resolve(here, `../../content/${locale}`))
    .filter((f) => /\.(md|mdx)$/.test(f))
    .map((f) => [`${locale}/${f}`, pageBody(locale, f)] as const),
);

describe('no credential is published in the guides', () => {
  /**
   * `sk-local-change-this` is not a NaN key: it is the master key of the local
   * LiteLLM gateway on the Claude Code page, which the reader is told to change
   * and which never leaves their machine. It is listed so the scan stays strict
   * about everything else.
   */

  test.each(GUIDE_PAGES)('every sk- token in %s is a known placeholder', (_page, body) => {
    const found = [...body.matchAll(/sk-[A-Za-z0-9_.-]*/g)].map((m) => m[0]);
    const leaked = [...new Set(found)].filter((t) => !ALLOWED_PLACEHOLDERS.has(t));
    expect(leaked, 'a token on this page is not a known placeholder').toEqual([]);
  });

  /**
   * NB3 from the #52 review: a scan that only knows the `sk-` prefix lets a
   * Stripe `sk_live_`, a GitHub `ghp_` or a JWT ride through pages whose
   * examples are full of `Authorization:` headers.
   */
  test.each(GUIDE_PAGES)('no other credential shape is published in %s', (_page, body) => {
    const shapes: [string, RegExp][] = [
      ['Stripe secret/restricted key', /[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/],
      ['GitHub token', /gh[pousr]_[A-Za-z0-9]{20,}/],
      ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
      ['AWS access key id', /AKIA[0-9A-Z]{16}/],
      ['OpenAI project key', /sk-proj-[A-Za-z0-9_-]{20,}/],
    ];
    const hits = shapes.filter(([, re]) => re.test(body)).map(([n]) => n);
    expect(hits, 'a credential shape is published on this page').toEqual([]);
  });

  test.each(GUIDE_PAGES)('nothing key-shaped survives the allowlist in %s', (_page, body) => {
    let stripped = body;
    for (const p of ALLOWED_PLACEHOLDERS) stripped = stripped.split(p).join('');
    expect(stripped, 'something long and key-shaped is published')
      .not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });
});

test('both locales publish byte-identical VS Code model config', () => {
  expect(vscodeConfig('docs-es')[0].models).toEqual(vscodeConfig('docs')[0].models);
});

test('both locales publish byte-identical opencode model config', () => {
  const en = opencodeConfig('docs').provider.nan.models;
  const es = opencodeConfig('docs-es').provider.nan.models;
  // Only `name` may differ; the machine-read fields must not.
  const strip = (m: Record<string, any>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, name: undefined }]));
  expect(strip(es)).toEqual(strip(en));
});

/**
 * WHAT A NON-PREMIUM KEY GETS WHEN IT ASKS FOR glm5.3.
 *
 * MEASURED 2026-09-12 against https://api.nan.builders/v1/chat/completions with
 * a key on the ordinary community tier:
 *
 *   HTTP 401
 *   {"error":{"message":"This API key does not have access to the requested
 *    model.","type":"auth_error","param":"None","code":"401"}}
 *
 * and `GET /v1/models` did not list glm5.3 for that key at all. The same key
 * answered 200 on deepseek-v4-flash in the same minute, so it was the tier and
 * not the credential.
 *
 * This settles a contradiction the site carried in both directions: the guides
 * and `openapi.json` published `403 tier_restricted` (corrected in the same
 * commit as this test), while `devops/docs/GLM52-PREMIUM-TIER.md` had measured
 * the 401 and warned "do not smoke-test for a 402 - you will get a 401 and
 * conclude, wrongly, that something is broken". The distinction is the
 * member's: a 401 reads as a broken API key, so a page that promises a 403
 * sends them to rotate a credential that is fine.
 *
 * 403 `tier_restricted` is NOT claimed to be fiction: it is documented for an
 * ENDPOINT a tier cannot reach (image generation without inference
 * membership), which this key could not test because it has that access. Only
 * the per-model case is pinned here.
 */
describe.each(['docs', 'docs-es'] as const)('the premium failure code in %s', (locale) => {
  const body = () => pageBody(locale, 'choose-a-model.md');

  test('names the 401 a non-premium key actually gets', () => {
    expect(body(), `${locale}: the premium note must name the 401`).toMatch(/\*\*`401`\*\*/);
  });

  /**
   * Scoped to the blockquote that documents the premium model, so a legitimate
   * `403` elsewhere on the page (an endpoint a tier cannot reach) does not trip
   * it. The note is the run of `>` lines that starts with the model.
   */
  test('does not promise a 403 for a model the tier cannot reach', () => {
    const lines = body().split('\n');
    const first = lines.findIndex((l) => l.startsWith('> **`glm5.3`'));
    expect(first, `${locale}: the premium note`).toBeGreaterThan(-1);
    let last = first;
    while (last + 1 < lines.length && lines[last + 1].startsWith('>')) last += 1;
    const note = lines.slice(first, last + 1).join('\n');
    // The page is allowed to NAME the 403 in order to deny it: readers who
    // learned the old, wrong answer need to be told it changed. What it may not
    // do is offer one as the answer, so the denial is removed before the check
    // rather than the whole assertion being softened.
    const claimed = note.replace(/,? *(?:not|no un) +a? *`403`/g, '');
    expect(claimed, `${locale}: 403 was measured to be wrong for the per-model case`)
      .not.toMatch(/`403`/);
  });
});
