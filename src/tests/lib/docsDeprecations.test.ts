import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../../data/openapi.json';

/**
 * A deprecation is only a deprecation on the surface that carries it.
 *
 * Web search is being retired, through `POST /v1/search` and through the MCP
 * server alike - and web search is the MCP server's only tool, so the server
 * goes with it. That fact lives in six places at once: two guide pages, two
 * spec operations, two spec tags, and a handful of cross-links from pages
 * about something else entirely.
 *
 * The failure this guards is not "someone forgets to deprecate it". It is the
 * one this repo has already had twice: a change lands in English and the
 * Spanish page goes on quietly recommending the thing. A member reading
 * /es/docs who is never told is exactly the member who builds on it.
 *
 * So the rule is per surface and per language, and it is deliberately blunt:
 * if a page sends a reader to web search or the MCP server, it says it is
 * going away.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(here, '../../content');
const LOCALES = ['docs', 'docs-es'] as const;

/** The marker in each language. Substrings, matched case-insensitively. */
const NOTICE = ['deprecat', 'deprecad'];

const read = (locale: string, file: string) =>
  readFileSync(resolve(CONTENT, locale, file), 'utf-8').replace(/\r\n/g, '\n');

const says = (body: string) => NOTICE.some((w) => body.toLowerCase().includes(w));

/**
 * Frontmatter stripped. The `description` is real coverage - it is what the
 * sidebar and the search results show - but it is not the notice a reader sees
 * once the page is open, and while it counted, deleting the callout outright
 * left every assertion green.
 */
const withoutFrontmatter = (text: string) => text.replace(/^---[^]*?\n---\n/, '');

describe('web search and the MCP server are marked deprecated everywhere', () => {
  /**
   * The two pages that document the feature itself, rather than linking to it.
   * They carry the full notice, so they are asserted by name: losing one is
   * losing the only place a reader is told what to do about it.
   */
  test.each(LOCALES)('%s: the MCP page leads with the notice', (locale) => {
    const body = read(locale, 'mcp.mdx');
    // Above the first H2, so it cannot end up below the configuration block a
    // reader came to copy.
    const head = withoutFrontmatter(body).split('\n## ')[0];
    expect(says(head), `${locale}/mcp.mdx: nothing above the first section says it`).toBe(true);
  });

  test.each(LOCALES)('%s: the web search example carries the notice', (locale) => {
    const body = read(locale, 'examples.md');
    const section = body.split('\n## ').find((s) => s.startsWith('tool: web search'));
    expect(section, `${locale}/examples.md: no web search section at all`).toBeDefined();
    expect(says(section!), `${locale}/examples.md: the web search section`).toBe(true);
  });

  /**
   * And every OTHER page that sends a reader towards either one. Found by
   * scanning rather than listed, so a new page that links to the MCP server
   * has to say it too - the case that cannot be covered by hand, because that
   * page does not exist yet.
   *
   * The two pages above are excluded: they carry ONE notice at the top rather
   * than repeating it on every internal reference, which is how it reads best.
   */
  const LINKS = /\/docs\/mcp|#tag\/mcp|\/v1\/search/;
  const HOME = ['mcp.mdx', 'examples.md'];

  test.each(LOCALES)('%s: every page that links to it says so', (locale) => {
    const offenders: string[] = [];
    const files = readdirSync(resolve(CONTENT, locale))
      .filter((f) => /\.mdx?$/.test(f))
      .filter((f) => !HOME.includes(f));

    for (const file of files) {
      const lines = read(locale, file).split('\n');
      for (const [i, line] of lines.entries()) {
        if (!LINKS.test(line)) continue;
        // A window rather than the line itself: in agent-setup the link is
        // `href:` on one line and the text a reader actually sees is `note:`
        // on another, so a line-only rule cannot see the warning that is
        // there.
        const near = lines.slice(Math.max(0, i - 3), i + 4).join(' ');
        if (!says(near)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      `${locale}: these send a reader to a deprecated feature without saying so:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

describe('the API reference says it too', () => {
  const doc = spec as {
    paths: Record<string, Record<string, { deprecated?: boolean; description?: string }>>;
    tags: Array<{ name: string; description?: string }>;
  };

  test.each(['/search', '/mcp'])('%s is flagged deprecated in the spec', (path) => {
    const op = doc.paths[path].post;
    // The machine-readable flag, which is what Scalar renders as a badge and
    // what a generated client picks up. Prose alone is not enough: nothing
    // downstream reads prose.
    expect(op.deprecated, `${path}: the OpenAPI deprecated flag`).toBe(true);
    expect(says(op.description ?? ''), `${path}: the description`).toBe(true);
  });

  test.each(['Search', 'MCP'])('the %s tag says it as well', (name) => {
    const tag = doc.tags.find((t) => t.name === name);
    expect(tag, `no ${name} tag`).toBeDefined();
    expect(says(tag!.description ?? ''), `${name} tag description`).toBe(true);
  });
});
