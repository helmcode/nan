import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { REMOVED_DOCS } from '../../middleware';

/**
 * Retired docs pages are redirected by the middleware (`REMOVED_DOCS`). These
 * tests keep the redirect and the content in agreement: a retired slug must not
 * come back as a live page (the redirect would shadow it), and nothing on the
 * site should keep linking to it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const root = resolve(src, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const slugs = Object.keys(REMOVED_DOCS);

const copyFiles = [
  ...walk(join(src, 'content')),
  ...walk(join(src, 'pages')),
  ...walk(join(src, 'components')),
  ...walk(join(src, 'layouts')),
  ...walk(join(root, 'i18n')),
].filter((p) => /\.(md|mdx|astro|ts|tsx|json)$/.test(p));

describe('retired docs pages', () => {
  test('agents (v1) is retired', () => {
    expect(slugs).toContain('agents');
  });

  test.each(slugs)('%s has no live page in either locale', (slug) => {
    for (const dir of ['content/docs', 'content/docs-es']) {
      for (const ext of ['md', 'mdx']) {
        expect(existsSync(join(src, dir, `${slug}.${ext}`)), `${dir}/${slug}.${ext}`).toBe(false);
      }
    }
  });

  test.each(slugs)('nothing links to /docs/%s', (slug) => {
    const link = new RegExp(`/docs/${slug}(?![\\w-])`);
    const hits = copyFiles.filter((f) => link.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(root.length + 1))).toEqual([]);
  });

  test('the retired v1 agents screenshots are gone', () => {
    expect(existsSync(join(root, 'public/docs/agents'))).toBe(false);
  });

  test('no copy points members at the retired portal agents page', () => {
    const hits = copyFiles.filter((f) => /cloud\.nan\.builders\/agents\b/.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
