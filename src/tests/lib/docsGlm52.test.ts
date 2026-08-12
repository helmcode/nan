import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getApiDocText } from '../../lib/apiDoc';
import { DEFAULT_RATE_LIMITS } from '../../lib/rateLimits';
import { mdxToText } from '../../lib/mdxToText';

/**
 * What docs/models#glm-5-2 and the API reference publish about glm5.2.
 *
 * Both pages described a model that does not exist: "not available yet",
 * "requests naming it return a model error" and a 256K context, while the
 * model was being served in production and a premium member was using it. The
 * asserts here are on the text /api/docs actually serves (same extractor the
 * Discord bot consumes), so the page and the API are covered at once.
 *
 * Since the Scalar migration, the `api` half no longer comes from `api.mdx` but
 * from the spec (src/data/openapi.json) via openapiToText. The wording changed
 * with it; what is asserted is still the same: that glm5.2 is published as
 * callable, with its real limits and without saying where it is sourced from.
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
  api = getApiDocText(DEFAULT_RATE_LIMITS);
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
  test('is listed among the chat models the `model` field accepts', () => {
    const row = api.split('\n').find((l) => /^\|\s*`model`\s*\|/.test(l));
    expect(row).toBeDefined();
    expect(row).toContain('`glm5.2`');
  });

  test('no surface still says it is coming soon or not callable', () => {
    expect(api).not.toMatch(/coming soon/i);
    expect(api).not.toMatch(/not callable/i);
    expect(api).not.toMatch(/not available yet/i);
  });

  test('the model catalog carries its context and the tier it needs', () => {
    const row = api.split('\n').find((l) => /^\|\s*`glm5\.2`\s*\|/.test(l));
    expect(row).toBeDefined();
    expect(row).toContain('500K-token context');
    expect(row).toMatch(/premium tier/i);
    expect(row).not.toContain('256K');
  });

  test('the 4h window is spelled out, not left as small print', () => {
    expect(api).toContain('400M tokens per rolling 4 hours');
    expect(api).toContain('3,000M-token allowance');
    expect(api).toMatch(/rolling, not a daily reset/);
    expect(api).toMatch(/billing period starts/);
  });

  test('the errors table documents the statuses the limits return', () => {
    // The "## Errors" table, not the per-endpoint ones (web search has its own
    // 429 rows and would answer first).
    const section = api.slice(api.indexOf('## Errors'));
    expect(section.length).toBeGreaterThan(0);
    const rows = section.split('\n').filter((l) => l.startsWith('|'));
    const status = (code: string) =>
      rows.find((l) => new RegExp(`^\\|\\s*\`${code}\`\\s*\\|`).test(l));
    expect(status('402')).toMatch(/token allowance for the billing period is spent/i);
    expect(status('402')).toContain('monthly_cap_reached');
    expect(status('429')).toMatch(/rolling 4h token budget of `glm5\.2`/);
  });

  /**
   * The 402 stopped being helmcode's prepaid credit. If rebuilding the spec
   * brings that text back, we would again publish a billing model NaN does not
   * have.
   */
  test('does not describe a prepaid-credit billing model', () => {
    expect(api).not.toMatch(/prepaid|credit balance|credits_exhausted|top ?up/i);
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
