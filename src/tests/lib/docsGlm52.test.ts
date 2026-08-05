import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mdxToText } from '../../lib/mdxToText';

/**
 * What docs/models#glm-5-2 and docs/api#rate-limits publish about glm5.2.
 *
 * Both pages described a model that does not exist: "not available yet",
 * "requests naming it return a model error" and a 256K context, while the
 * model was being served in production and a premium member was using it. The
 * asserts here are on the text /api/docs actually serves (same extractor the
 * Discord bot consumes), so the page and the API are covered at once.
 */

const here = dirname(fileURLToPath(import.meta.url));

function docBody(slug: string): string {
  const raw = readFileSync(resolve(here, `../../content/docs/${slug}.mdx`), 'utf-8');
  // getEntry().body hands mdxToText the content without frontmatter.
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
}

let models = '';
let api = '';

beforeAll(async () => {
  models = await mdxToText(docBody('models'));
  api = await mdxToText(docBody('api'));
});

/** The glm5.2 card only, so a 256K from another model cannot pass for it. */
function glmSection(text: string): string {
  const start = text.indexOf('### glm5.2');
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\n### ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('docs/models — the glm5.2 card', () => {
  test('does not say the model is unavailable', () => {
    const section = glmSection(models);
    expect(section).not.toMatch(/coming soon/i);
    expect(section).not.toMatch(/not available yet/i);
    expect(section).not.toMatch(/not published on the community api/i);
    expect(section).not.toMatch(/return a model error/i);
  });

  test('publishes the 500K context and not the old 256K', () => {
    const section = glmSection(models);
    expect(section).toContain('500K token');
    expect(section).toContain('Context: 500K tokens');
    expect(section).not.toContain('256K');
  });

  /**
   * The spec label named the wrong window: `Monthly quota` sat two lines under a
   * description saying the counter goes back to zero when the BILLING PERIOD
   * starts. glm5.2 is the one model whose cap is not the calendar month
   * (usage_quota.go clears the month default and stamps the Stripe period), so
   * it uses the label RateLimits.astro already publishes for it.
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

describe('docs/api — glm5.2 is callable', () => {
  test('is listed among the compatible chat models', () => {
    const line = api.split('\n').find((l) => l.includes('Compatible models:'));
    expect(line).toBeDefined();
    expect(line).toContain('`glm5.2`');
  });

  test('no surface still says it is coming soon or not callable', () => {
    expect(api).not.toMatch(/coming soon/i);
    expect(api).not.toMatch(/not callable/i);
  });

  test('the model field accepts it', () => {
    // The extractor pads the table columns, hence the loose left edge.
    const row = api.split('\n').find((l) => /^\|\s*`model`\s*\|/.test(l));
    expect(row).toBeDefined();
    expect(row).toContain('glm5.2');
  });

  test('the rate limits block carries the four limits', () => {
    expect(api).toContain('Rolling 4h window: 400M tokens');
    expect(api).toContain('Allowance / billing period: 3,000M tokens');
    expect(api).toContain('Context window: 500K tokens');
    expect(api).toContain('Concurrent requests: 5');
  });

  test('the 4h window is spelled out, not left as small print', () => {
    expect(api).toContain('400M tokens per rolling 4 hours');
    expect(api).toMatch(/rolling window, not a daily reset/);
  });

  test('the errors table documents the statuses the limits return', () => {
    // The "## Errors" table, not the per-endpoint ones (web search has its own
    // 429 rows and would answer first).
    const section = api.slice(api.indexOf('## Errors'));
    expect(section.length).toBeGreaterThan(0);
    const rows = section.split('\n').filter((l) => l.startsWith('|'));
    const status = (code: string) => rows.find((l) => new RegExp(`^\\|\\s*${code}\\s*\\|`).test(l));
    expect(status('402')).toMatch(/Token allowance for the billing period exhausted/);
    expect(status('402')).toContain('monthly_cap_reached');
    expect(status('429')).toMatch(/rolling 4h token budget of `glm5\.2`/);
  });
});

describe('no published surface reveals how glm5.2 is sourced', () => {
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
