import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';

/**
 * The Spanish guides.
 *
 * They exist so the language switcher in the docs header is not a link into a
 * 404: before this, /es/docs and /es/docs/models answered 404 and only
 * /es/docs/api had a Spanish version.
 *
 * The Spanish copies ship as copies of the English ones, marked
 * `translated: false`, and the page says so rather than passing English off as
 * a translation. These tests guard the pairing and the marker, not the prose.
 */

const here = dirname(fileURLToPath(import.meta.url));
const enDir = resolve(here, '../../content/docs');
const esDir = resolve(here, '../../content/docs-es');
const read = (p: string) => readFileSync(p, 'utf-8');
const ids = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.(md|mdx)$/.test(f))
    .map((f) => f.replace(/\.(md|mdx)$/, ''))
    .sort();

describe('the two guide collections', () => {
  it('hold the same set of pages', () => {
    expect(ids(esDir)).toEqual(ids(enDir));
  });

  /**
   * A Spanish page missing from the English side would 404 from the switcher,
   * which is the exact problem this exists to fix.
   */
  it('agree on order and group, so the nav reads the same in both', () => {
    for (const id of ids(enDir)) {
      const file = readdirSync(enDir).find((f) => f.startsWith(`${id}.`))!;
      const esFile = readdirSync(esDir).find((f) => f.startsWith(`${id}.`))!;
      const en = parseFrontmatter(read(resolve(enDir, file))).frontmatter as Record<string, unknown>;
      const es = parseFrontmatter(read(resolve(esDir, esFile))).frontmatter as Record<string, unknown>;
      expect(es.order, `${id}: order`).toBe(en.order);
      expect(es.group, `${id}: group`).toBe(en.group);
    }
  });

  it('marks every untranslated Spanish page, so the notice shows', () => {
    for (const f of readdirSync(esDir).filter((f) => /\.(md|mdx)$/.test(f))) {
      const fm = parseFrontmatter(read(resolve(esDir, f))).frontmatter as { translated?: boolean };
      // Once a guide is really translated, flip this to true and the notice goes.
      expect(typeof fm.translated, `${f}`).toBe('boolean');
    }
  });
});

describe('the docs layout', () => {
  const layout = read(resolve(here, '../../layouts/Docs.astro'));

  it('reads the Spanish collection when the page is Spanish', () => {
    expect(layout).toContain("getCollection(lang === 'es' ? 'docsEs' : 'docs')");
  });

  /**
   * The breadcrumb is built from the locale-stripped path. Counting `/es` as a
   * segment made every Spanish page show an extra crumb for the docs index.
   */
  it('builds the breadcrumb from the path without the locale prefix', () => {
    expect(layout).toContain('const breadcrumb = enPath');
  });

  it('declares both languages to search engines', () => {
    expect(layout).toContain('hreflang="en"');
    expect(layout).toContain('hreflang="es"');
    expect(layout).toContain('hreflang="x-default"');
  });

  it('shows the untranslated notice only when the flag says so', () => {
    expect(layout).toContain('!translated && <p class="docs-untranslated">');
  });
});

/**
 * The English slugs are what /api/docs publishes and the Discord bot indexes,
 * and SAFE_SLUG rejects slashes. Moving the guides under `docs/en/…` would
 * turn every id into `en/intro` and the manifest route would answer 500 on the
 * first one, taking the bot's whole knowledge base with it. That is why the
 * Spanish copies live in their own directory instead.
 */
describe('the English collection is left where it is', () => {
  it('keeps flat, slug-safe ids', () => {
    const SAFE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const id of ids(enDir)) {
      expect(SAFE.test(id), id).toBe(true);
    }
  });
});
