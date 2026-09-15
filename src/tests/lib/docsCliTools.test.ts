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

/**
 * Every other tool page says where its tool comes from - Hermes links Nous
 * Research, Gentle-AI links its repo - and the Pi page said only what Pi is,
 * so a reader who did not already have it had nowhere to go. The CLI's README
 * had a link and it pointed at pi.ai, which is Inflection's consumer chatbot
 * and a different piece of software entirely.
 */
describe.each(['docs', 'docs-es'] as const)('the Pi page in %s', (locale) => {
  const body = () => read(locale, 'pi');

  test('says where Pi comes from', () => {
    expect(body(), 'no link to the Pi project').toContain('https://pi.dev');
  });

  test('does not send anyone to the Inflection chatbot', () => {
    expect(body()).not.toContain('pi.ai');
  });

  test('says how to install it, on both kinds of machine', () => {
    const text = body();
    expect(text, 'no install command').toContain('pi.dev/install.sh');
    expect(text, 'nothing for Windows').toContain('install.ps1');
  });
});

/**
 * Windows, told once.
 *
 * The page acquired its PowerShell installer in #60 and kept everything that
 * was written when Windows had no binary: "This is the path on Windows" in
 * Building from source, and a known issue saying the published releases carry
 * macOS and Linux only. So the same page offered a one-liner at the top and
 * told you to install Go two screens down, in both languages.
 *
 * Both halves cannot be true at once, and the release settles it: v0.1.19
 * publishes windows_amd64.zip and windows_arm64.zip. What this pins is the
 * shape of the mistake - a page that ships an installer for a platform and
 * also tells that platform to compile - because the next platform added will
 * arrive the same way, by adding the new text and leaving the old.
 */
describe.each(['docs', 'docs-es'] as const)('the Windows story on the CLI page in %s', (locale) => {
  const body = read(locale, 'nan-cli');

  test('publishes the PowerShell installer', () => {
    expect(body).toContain('install.ps1');
  });

  /**
   * Building from source stays on the page - it is the right answer for
   * working on the CLI itself. What it may not be is the answer for a
   * platform we publish a binary for.
   */
  test('never sends Windows off to compile', () => {
    const WINDOWS = /windows/i;
    const BUILD = /go build|go\.dev|compilar|compile|build from source|desde el c[óo]digo/i;
    const guilty = body
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => WINDOWS.test(line) && BUILD.test(line))
      .map(({ line, n }) => `${n}: ${line}`);
    expect(
      guilty,
      `${locale}/nan-cli: the page installs Windows from a published binary and ` +
        `these lines still tell it to build:\n${guilty.join('\n')}`,
    ).toEqual([]);
  });
});
