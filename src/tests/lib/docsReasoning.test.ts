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

  it('max_tokens: the deepseek floor applies only while reasoning is on', () => {
    expect(chatBody.max_tokens.description).toContain(
      'On `deepseek-v4-flash`, while reasoning is on, a smaller value is raised to 16384 so the reasoning fits, so a prompt within 16384 tokens of its 1,048,576-token window is rejected with a `400` even with a small `max_tokens`; with reasoning off (`reasoning_effort: "none"` or an alias) the value is used as sent.',
    );
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

describe('deepseek-v4-flash card: the max_tokens floor only applies while reasoning is on (en + es)', () => {
  const card = (locale: '' | '-es') => {
    const text = page(locale);
    const start = text.indexOf('name="deepseek-v4-flash"');
    return text.slice(start, text.indexOf('/>', start));
  };

  it('en', () => {
    expect(card('')).toContain(
      'While reasoning is on, an output budget below 16384 is raised to 16384 so the reasoning fits (max_tokens and max_completion_tokens on /chat/completions, max_output_tokens on /responses, the same on both routes), so a prompt within 16384 tokens of the 1,048,576-token window is rejected with a 400 even with a small budget (usually Context length exceeded, sometimes a generic Invalid request). With reasoning off (reasoning_effort "none" or any of its aliases) your budget is used as sent. A budget above 16384 is never lowered.',
    );
  });

  it('es', () => {
    expect(card('-es')).toContain('Con el razonamiento activado, un presupuesto de salida por debajo de 16384 se sube a 16384');
    expect(card('-es')).toContain('Con el razonamiento apagado (reasoning_effort "none" o cualquiera de sus alias) tu presupuesto se usa tal cual.');
    expect(card('-es')).toContain('Un presupuesto por encima de 16384 nunca se baja.');
  });
});

describe('es: no voseo', () => {
  it('uses "Baja", not "Bajá"', () => {
    expect(page('-es')).not.toContain('Bajá');
  });
});
