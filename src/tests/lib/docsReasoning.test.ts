import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../../data/openapi.json';

/**
 * THE REASONING CONTRACT, as published. Measured live 2026-10-15 on both
 * hosts and enforced by the proxy's reasoning-effort hook (nan-devops,
 * scripts/litellm-reasoning-effort-hook/): one parameter turns reasoning off
 * on every chat model, the other providers' switches are accepted as aliases,
 * and the one model that cannot stop reasoning (GLM) says so. A customer had
 * to guess before this, guessed DeepSeek's own `thinking` switch, and kept
 * reasoning on; these tests keep the reference from going back to "each model
 * is different, find out".
 */

const CHAT_MODELS = [
  'deepseek-v4-flash',
  'qwen3.8-flash',
  'mimo-v2.6-flash',
  'qwen3.6',
  'gemma4',
  'glm5.3',
  'glm5.3-flash',
];
const LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const ALIASES = [
  '`thinking: {"type": "disabled"}`',
  '`reasoning: {"enabled": false}`',
  '`enable_thinking: false`',
  '`chat_template_kwargs: {"enable_thinking": false}`',
];

const here = dirname(fileURLToPath(import.meta.url));
const page = (locale: '' | '-es') =>
  readFileSync(resolve(here, `../../content/docs${locale}/models.mdx`), 'utf-8');

/** The "Controlling reasoning" section of a models page. */
const section = (locale: '' | '-es') => {
  const text = page(locale);
  const heading = locale === '' ? '## Controlling reasoning.' : '## Controlar el razonamiento.';
  const start = text.indexOf(heading);
  expect(start, `${heading} missing`).toBeGreaterThan(-1);
  const end = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, end);
};

/** One model's row in that section's table. */
const row = (text: string, model: string) =>
  text.split('\n').find((l) => l.startsWith('|') && l.split('|')[1].includes(`\`${model}\``)) ?? '';

/** The feature line of a model card that talks about reasoning. */
const cardReasoning = (locale: '' | '-es', model: string) => {
  const text = page(locale);
  const start = text.indexOf(`name="${model}"`);
  expect(start, `card ${model} missing`).toBeGreaterThan(-1);
  const card = text.slice(start, text.indexOf('/>', start));
  return card.split('\n').filter((l) => /reasoning|razonamiento|Razonamiento/i.test(l) && l.trim().startsWith("'"));
};

const chatBody = (spec.paths as any)['/chat/completions'].post.requestBody.content['application/json'].schema.properties;
const respBody = (spec.paths as any)['/responses'].post.requestBody.content['application/json'].schema.properties;

describe('API reference: one documented way to turn reasoning off', () => {
  const desc: string = spec.info.description;
  const reasoning = desc.slice(desc.indexOf('## Reasoning'), desc.indexOf('\n## ', desc.indexOf('## Reasoning') + 3));

  it('has a Reasoning section in the overview', () => {
    expect(desc).toContain('\n## Reasoning\n');
  });

  it('names the one switch for both APIs', () => {
    expect(reasoning).toContain('"reasoning_effort": "none"');
    expect(reasoning).toContain('"reasoning": {"effort": "none"}');
    // The hook normalises only catalogue models; off-catalogue models get no alias rewriting.
    expect(reasoning).toMatch(/every model in the catalogue/);
    for (const d of [
      reasoning,
      chatBody.reasoning_effort.description,
      chatBody.chat_template_kwargs.description,
      respBody.reasoning.description,
    ]) {
      expect(d).not.toMatch(/every chat model/);
    }
  });

  it('says what happens with a value outside the list', () => {
    expect(reasoning).toMatch(/Any other value is passed through unchanged/);
  });

  it('the model catalog agrees: qwen3.6 and gemma4 reason by default', () => {
    const catalog = desc.slice(desc.indexOf('## Model catalog'), desc.indexOf('\n## ', desc.indexOf('## Model catalog') + 3));
    expect(catalog).not.toMatch(/opt-in|opt-out/);
    for (const model of ['qwen3.6', 'gemma4']) {
      const line = catalog.split('\n').find((l) => l.startsWith(`| \`${model}\``)) ?? '';
      expect(line, model).toContain('reasoning (on by default; `reasoning_effort: "none"` turns it off)');
    }
  });

  it('max_tokens: passed through as sent, reasoning counts inside it (no deepseek floor)', () => {
    const d = chatBody.max_tokens.description;
    expect(d).toContain('The value is used exactly as sent, with reasoning on or off, on every model except `glm5.3-flash`, where a value above 131072 is lowered to 131072, the most its upstream accepts.');
    expect(d).not.toMatch(/above what the model can generate is rejected with a generic `400`\./);
    expect(d).toContain('the reasoning is in `message.reasoning_content`');
    expect(d).toContain('an empty `content` and `finish_reason: "length"`');
    expect(d).toContain('`usage.completion_tokens_details.reasoning_tokens` equals `completion_tokens`');
    expect(d).toContain('`reasoning_effort: "none"`');
    expect(d).toContain('`stream: true`');
    expect(d).toContain('Turn reasoning off (`reasoning_effort: "none"`) for a reliable fix (GLM cannot turn it off; `minimal` is its shortest); a lower effort is a hint, not a cap, on `deepseek-v4-flash` and `qwen3.8-flash`.');
    expect(d).not.toMatch(/lower the effort,/);
    expect(d).not.toMatch(/16384|raised/);
  });

  it('lists the accepted aliases and says the explicit value wins', () => {
    for (const alias of ALIASES) expect(reasoning).toContain(alias);
    expect(reasoning).toContain('`extra_body`');
    expect(reasoning).toMatch(/value wins/);
  });

  it('says plainly that GLM cannot stop reasoning, and what none does there', () => {
    expect(reasoning).toMatch(/`glm5\.3` and `glm5\.3-flash` always reason/);
    expect(reasoning).toMatch(/`none` is applied as `minimal`/);
  });

  it('points at the per-model table', () => {
    expect(reasoning).toContain('https://nan.builders/docs/models#controlling-reasoning');
  });

  it('chat reasoning_effort: every level, and none turns it off', () => {
    expect(chatBody.reasoning_effort.enum).toEqual(LEVELS);
    expect(chatBody.reasoning_effort.description).toMatch(/`none` turns reasoning off/);
    // The old reference said the parameter had no effect on deepseek-v4-flash. It does.
    expect(chatBody.reasoning_effort.description).not.toMatch(/no effect/);
    expect(JSON.stringify(spec)).not.toMatch(/accepted and has no effect/);
  });

  it('chat_template_kwargs is documented as an alias, not as the way', () => {
    expect(chatBody.chat_template_kwargs.description).toMatch(/alias/i);
    expect(chatBody.chat_template_kwargs.description).toContain('reasoning_effort');
  });

  it('responses documents reasoning.effort with the same levels', () => {
    expect(respBody.reasoning).toBeDefined();
    expect(respBody.reasoning.properties.effort.enum).toEqual(LEVELS);
    expect(respBody.reasoning.description).toMatch(/`none` turns reasoning off/);
  });
});

describe('models page: the per-model table is the contract (en + es)', () => {
  for (const locale of ['', '-es'] as const) {
    const text = section(locale);

    it(`${locale || 'en'}: has a row for every chat model`, () => {
      for (const model of CHAT_MODELS) expect(row(text, model), model).not.toBe('');
    });

    it(`${locale || 'en'}: names both switches and every alias`, () => {
      expect(text).toContain('`reasoning_effort`');
      expect(text).toContain('`reasoning: {"effort": ...}`');
      for (const alias of ALIASES) expect(text).toContain(alias);
      for (const level of LEVELS) expect(text).toContain(`\`${level}\``);
    });

    it(`${locale || 'en'}: none is off everywhere except GLM, which says it cannot`, () => {
      const off = locale === '' ? /\| Off/ : /\| Apagado/;
      for (const model of ['deepseek-v4-flash', 'qwen3.8-flash', 'mimo-v2.6-flash', 'qwen3.6']) {
        expect(row(text, model), model).toMatch(off);
      }
      const glm = row(text, 'glm5.3');
      expect(glm).toContain('`minimal`');
      expect(glm).toMatch(locale === '' ? /always reasons/ : /siempre razona/);
    });

    it(`${locale || 'en'}: documents the remaps and the Responses limit on vLLM`, () => {
      expect(row(text, 'mimo-v2.6-flash')).toMatch(/`minimal`.*`low`.*`xhigh`.*`max`/);
      expect(row(text, 'qwen3.6')).toContain('32,768'.replace(',', locale === '' ? ',' : '.'));
      expect(row(text, 'qwen3.6')).toMatch(/Responses/);
    });

    it(`${locale || 'en'}: no row claims the parameter does nothing`, () => {
      expect(text).not.toMatch(/no effect|sin efecto|not adjustable|no ajustable/);
    });

    it(`${locale || 'en'}: shows how to turn it off`, () => {
      expect(text).toContain('"reasoning_effort": "none"');
      expect(text).toContain('reasoning={"effort": "none"}');
    });

    it(`${locale || 'en'}: SDK examples are copy-pasteable in Python and Node, on both hosts`, () => {
      // Each example builds its own client.
      expect(text).toContain('client = OpenAI(');
      expect(text).toContain('const client = new OpenAI({');
      expect(text).toContain('base_url="https://api.nan.builders/v1"');
      expect(text).toContain("baseURL: 'https://api.nan.builders/v1'");
      expect(text).toContain('https://api.helmcode.com/v1');
      // Older Python SDKs do not know the parameter.
      expect(text).toContain('extra_body={"reasoning_effort": "none"}');
      // Node, both APIs.
      expect(text).toContain("reasoning_effort: 'none'");
      expect(text).toContain("reasoning: { effort: 'none' }");
      // TypeScript: typed unions may lack a value.
      expect(text).toContain('// @ts-expect-error');
    });

    it(`${locale || 'en'}: names the APIs, not "both", and says what an unlisted value does`, () => {
      expect(text).not.toMatch(/both APIs|las dos APIs/);
      expect(text).toMatch(locale === '' ? /on Chat Completions and on Responses/ : /en Chat Completions y en Responses/);
      expect(text).toMatch(locale === '' ? /Any other value is passed through unchanged/ : /Cualquier otro valor se env[ií]a tal cual/);
    });

    it(`${locale || 'en'}: the table header does not render as a shouted NONE`, () => {
      expect(text).toContain(locale === '' ? '| Model | Off switch (`none`) |' : '| Modelo | Para apagar (`none`) |');
    });

    it(`${locale || 'en'}: names no upstream provider`, () => {
      expect(text).not.toMatch(/OpenRouter|Novita|DashScope|Z\.AI|vLLM/);
    });
  }
});

describe('model cards agree with the table (en + es)', () => {
  for (const locale of ['', '-es'] as const) {
    it(`${locale || 'en'}: every chat card says how reasoning is controlled`, () => {
      for (const model of CHAT_MODELS) {
        const lines = cardReasoning(locale, model);
        expect(lines.length, model).toBeGreaterThan(0);
        const joined = lines.join(' ');
        expect(joined, model).toContain('reasoning_effort');
        if (model.startsWith('glm')) expect(joined, model).toMatch(/always reasons|siempre razona/);
        else expect(joined, model).toContain('<code>none</code>');
      }
    });

    it(`${locale || 'en'}: card bullets use <code>, never literal backticks, and link to the section`, () => {
      const anchor = locale === '' ? '#controlling-reasoning' : '#controlar-el-razonamiento';
      for (const model of CHAT_MODELS) {
        const joined = cardReasoning(locale, model).join(' ');
        expect(joined, model).not.toContain('`');
        expect(joined, model).toContain(`<a href="${anchor}">`);
      }
    });

    it(`${locale || 'en'}: qwen3.6 and gemma4 cards agree with the table on minimal`, () => {
      for (const model of ['qwen3.6', 'gemma4']) {
        expect(cardReasoning(locale, model).join(' '), model).toContain('<code>none</code>');
        expect(cardReasoning(locale, model).join(' '), model).toContain('<code>minimal</code>');
      }
    });
  }
});

/**
 * NO OUTPUT-BUDGET FLOOR (owner decision 2026-10-19, nan-devops
 * docs/community-report-2026-10-19-output-budget.md). Until then a
 * deepseek-v4-flash budget below 16384 was silently raised while reasoning was
 * on. Now the budget is passed through as sent on every model and route, so
 * the docs must say that reasoning counts inside it and how a reasoning-
 * exhausted answer looks, and must not describe the floor any more.
 */
describe('output budget: passed through as sent, no floor (en + es)', () => {
  const card = (locale: '' | '-es') => {
    const text = page(locale);
    const start = text.indexOf('name="deepseek-v4-flash"');
    return text.slice(start, text.indexOf('/>', start));
  };
  const examples = (locale: '' | '-es') =>
    readFileSync(resolve(here, `../../content/docs${locale}/examples.md`), 'utf-8');
  // `&ge;` / `&amp;ge;` too: card strings are HTML, and the entity slipped past `≥` once.
  const FLOOR = /raised to 16384|se sube a 16384|16384 nunca se baja|never lowered|within 16384 tokens|a menos de 16384 tokens|(?:≥|&ge;|&amp;ge;)\s*(?:<\/?code>)?\s*300|max_tokens\s*(?:≥|&ge;|&amp;ge;)/;

  for (const locale of ['', '-es'] as const) {
    it(`${locale || 'en'}: no page describes the floor or the old max_tokens >= 300 advice`, () => {
      expect(page(locale)).not.toMatch(FLOOR);
      expect(examples(locale)).not.toMatch(FLOOR);
    });

    it(`${locale || 'en'}: the reasoning section and the card name every field and the empty-answer signature`, () => {
      for (const text of [section(locale), card(locale)]) {
        for (const needle of ['max_tokens', 'max_completion_tokens', 'max_output_tokens', 'finish_reason', '"length"',
          'reasoning_content', 'usage.completion_tokens_details.reasoning_tokens', 'completion_tokens', 'reasoning_effort', '"none"']) {
          expect(text, needle).toContain(needle);
        }
      }
    });

    it(`${locale || 'en'}: examples point at reasoning off or a generous budget plus streaming`, () => {
      expect(examples(locale)).toContain('`finish_reason: "length"`');
      expect(examples(locale)).toContain('`"reasoning_effort": "none"`');
      expect(examples(locale)).toContain('`stream: true`');
    });
  }

  it(`the glm5.3-flash ceiling is the one exception, said in both locales`, () => {
    expect(section('')).toContain('except on `glm5.3-flash`, where a value above 131072 is lowered to 131072, the most its upstream accepts.');
    expect(section('-es')).toContain('salvo en `glm5.3-flash`, donde un valor por encima de 131072 se baja a 131072, lo máximo que acepta su proveedor.');
    expect(section('')).not.toContain('on every\nmodel.');
  });

  it('empty-answer signals are scoped to Chat Completions; Responses only promises the reasoning item', () => {
    expect(section('')).toContain('On Chat Completions you get an empty `content` with\n`finish_reason: "length"`, the reasoning in `message.reasoning_content`, and');
    expect(section('')).toContain('On Responses the reasoning arrives as a `reasoning` output item and there is no message text.');
    expect(section('-es')).toContain('En Chat Completions recibes un `content` vacío con\n`finish_reason: "length"`, el razonamiento en `message.reasoning_content` y');
    expect(section('-es')).toContain('En Responses el razonamiento llega como un elemento de salida `reasoning` y no hay texto de mensaje.');
    // finish_reason / completion_tokens_details must not be promised for Responses.
    for (const locale of ['', '-es'] as const) {
      expect(section(locale)).not.toMatch(/Responses[^.]*finish_reason|Responses[^.]*completion_tokens_details/);
      expect(card(locale)).not.toMatch(/\/responses[^.;]*finish_reason|\/responses[^.;]*completion_tokens_details/);
    }
    expect(card('')).toContain('on /responses the reasoning arrives as a reasoning output item with no message text');
    expect(card('-es')).toContain('en /responses el razonamiento llega como un elemento de salida reasoning sin texto de mensaje');
  });

  it('remedies: none is the reliable fix, on both routes; lower effort is a hint on deepseek/qwen3.8-flash; GLM has no off switch', () => {
    expect(section('')).toContain('the reliable fix is to turn reasoning off: `reasoning_effort: "none"` on Chat Completions, `reasoning: {"effort": "none"}` on Responses (GLM cannot turn it off; `minimal` is its shortest).');
    expect(section('')).toContain('A lower effort usually reasons less, but on `deepseek-v4-flash` and `qwen3.8-flash` it is a hint, not a cap; only `qwen3.6` and `gemma4` cap it, on Chat Completions.');
    expect(section('-es')).toContain('la solución fiable es apagar el razonamiento: `reasoning_effort: "none"` en Chat Completions, `reasoning: {"effort": "none"}` en Responses (GLM no puede apagarlo; `minimal` es lo más corto).');
    expect(section('-es')).toContain('Un esfuerzo menor suele razonar menos, pero en `deepseek-v4-flash` y `qwen3.8-flash` es una pista, no un tope; solo `qwen3.6` y `gemma4` lo acotan, en Chat Completions.');
    expect(card('')).toContain('The reliable fix is reasoning off (reasoning_effort "none" on /chat/completions, reasoning.effort "none" on /responses); a lower effort is a hint on this model, not a cap.');
    expect(card('-es')).toContain('La solución fiable es apagar el razonamiento (reasoning_effort "none" en /chat/completions, reasoning.effort "none" en /responses); un esfuerzo menor es una pista en este modelo, no un tope.');
    for (const locale of ['', '-es'] as const) {
      // "lower the effort" is never offered as an unqualified fix.
      expect(section(locale) + card(locale)).not.toMatch(/lower the effort|baja el esfuerzo/);
    }
  });

  it('mimo-v2.6-flash card: no number, points at Controlling reasoning (en + es)', () => {
    const mimo = (locale: '' | '-es') => cardReasoning(locale, 'mimo-v2.6-flash').join(' ');
    expect(mimo('')).toContain('reasoning counts inside <code>max_tokens</code>');
    expect(mimo('-es')).toContain('el razonamiento cuenta dentro de <code>max_tokens</code>');
    expect(mimo('')).not.toMatch(FLOOR);
    expect(mimo('-es')).not.toMatch(FLOOR);
  });

  for (const locale of ['', '-es'] as const) {
    it(`${locale || 'en'}: the examples paragraph is model-generic`, () => {
      const ex = examples(locale);
      const i = ex.indexOf('`finish_reason: "length"`');
      const para = ex.slice(ex.lastIndexOf('\n\n', i), ex.indexOf('\n\n', i));
      expect(para).not.toContain('deepseek-v4-flash');
    });
  }

  it('en wording', () => {
    expect(card('')).toContain('Your output budget is used exactly as sent, with reasoning on or off');
    expect(card('')).toContain('On /chat/completions the answer then comes back with an empty content and finish_reason "length"');
    expect(card('')).toContain('Or give a generous budget and stream the answer.');
    expect(section('')).toContain('is used exactly as you send it on every model');
    expect(section('')).toContain('[stream the answer](#long-outputs-stream-them)');
  });

  it('es wording', () => {
    expect(card('-es')).toContain('Tu presupuesto de salida se usa tal cual lo envías, con el razonamiento activado o apagado');
    expect(card('-es')).toContain('En /chat/completions la respuesta llega entonces con content vacío y finish_reason "length"');
    expect(card('-es')).toContain('O da un presupuesto generoso y usa streaming.');
    expect(section('-es')).toContain('se usa tal cual lo envías en todos los modelos');
    expect(section('-es')).toContain('[usa streaming](#respuestas-largas-usa-streaming)');
  });

  it('both anchors the prose links to exist as headings', () => {
    expect(page('')).toContain('\n## Long outputs: stream them.\n');
    expect(page('-es')).toContain('\n## Respuestas largas: usa streaming.\n');
  });
});

describe('es: no voseo', () => {
  it('uses "Baja", not "Bajá"', () => {
    expect(page('-es')).not.toContain('Bajá');
  });
});
