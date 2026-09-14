import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The list of tools the CLI configures on its own is published in two places:
 * the table on /docs/nan-cli, and the one-line note on the NaN CLI card in
 * /docs/agent-setup. Four times two, because each exists in English and in
 * Spanish.
 *
 * They drifted the first time the CLI learned a new tool: the table gained a
 * row and the card went on saying "OpenCode, Codex, Pi and droid", so which
 * answer a member got depended on which page they landed on. Nothing in the
 * build compares the two - they are prose in different files - so this does.
 *
 * It does not check the CLI itself: the Go source is another repository and
 * this suite cannot see it. What it pins is that the site agrees with the
 * site, in both languages, which is the half that kept going wrong.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(here, '../../content');

/** Named in the CLI's own README as the tools its Setup tab writes. */
const TOOLS = ['OpenCode', 'Codex', 'Pi', 'droid', 'Hermes'] as const;

const read = (locale: string, page: string) =>
  readFileSync(resolve(CONTENT, locale, `${page}.mdx`), 'utf8');

describe.each(['docs', 'docs-es'] as const)('what the CLI configures, in %s', (locale) => {
  test('the table on the CLI page has a row for every tool', () => {
    const body = read(locale, 'nan-cli');
    // The table ends where the next heading starts; a mention further down the
    // page is not a row and must not pass for one.
    const table = body.split('\n## ')[1] ?? '';
    for (const tool of TOOLS) {
      expect(table, `${tool} is missing from the table on /docs/nan-cli`).toContain(tool);
    }
  });

  test('the card on the agent-setup page names the same tools', () => {
    const body = read(locale, 'agent-setup');
    const card = body
      .split('\n')
      .find((line) => line.includes('shows you your usage') || line.includes('te enseña tu consumo'));
    expect(card, 'the NaN CLI card has no note to check').toBeDefined();
    for (const tool of TOOLS) {
      expect(card, `${tool} is missing from the NaN CLI card on /docs/agent-setup`).toContain(tool);
    }
  });
});

/**
 * Hermes is configured through `hermes config set` rather than by writing its
 * YAML, and its config is not where the page used to say it was on Windows.
 * Both are things a member acts on, so both stay published.
 */
describe.each(['docs', 'docs-es'] as const)('the Hermes page in %s', (locale) => {
  const body = () => read(locale, 'hermes');

  test('does not publish the Unix path as the only one', () => {
    const text = body();
    expect(text).toContain('~/.hermes/config.yaml');
    expect(text, 'the Windows path is not published').toContain('LOCALAPPDATA');
    expect(text, 'nothing tells a member how to ask Hermes itself').toContain('hermes config path');
  });

  test('points at the CLI as the shortcut', () => {
    expect(body()).toContain('nan-cli');
  });
});
