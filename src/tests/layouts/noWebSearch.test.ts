import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { REMOVED_DOCS } from '../../middleware';

/**
 * Web search is gone from NaN (the /v1/search endpoint and the MCP server
 * whose only tool it was). Nothing on the site may document or sell it, and
 * the old docs URL keeps redirecting instead of 404ing.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');

const WEB_SEARCH = /web[\s_-]?search|\/v1\/search|b[uú]squeda web|search tool/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (['tests', 'node_modules', 'dist', '.astro', 'fixtures'].includes(name)) continue;
      walk(p, out);
    } else if (/\.(astro|ts|tsx|mdx?|json|txt)$/.test(name) && !name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('no web search on the site', () => {
  test('no page, doc, dictionary, spec or public file mentions it', () => {
    const files = [...walk(resolve(repo, 'src')), ...walk(resolve(repo, 'public')), ...walk(resolve(repo, 'i18n'))];
    const offenders = files
      .filter((f) => !f.endsWith('middleware.ts')) // documents the redirect below
      .filter((f) => WEB_SEARCH.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(repo, f));
    expect(offenders).toEqual([]);
  });

  test('the OpenAPI spec has no search path', () => {
    const spec = JSON.parse(readFileSync(resolve(repo, 'src/data/openapi.json'), 'utf-8'));
    expect(Object.keys(spec.paths).filter((p) => /search|mcp/i.test(p))).toEqual([]);
  });

  test('the removed MCP/search docs page still redirects', () => {
    expect(REMOVED_DOCS.mcp).toBeTruthy();
  });
});
