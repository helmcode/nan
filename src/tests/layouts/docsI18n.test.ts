import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { API_DOC_META } from '../../lib/apiDoc';

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
  it('agree on order, so the nav lists pages in the same sequence', () => {
    for (const id of ids(enDir)) {
      const file = readdirSync(enDir).find((f) => f.startsWith(`${id}.`))!;
      const esFile = readdirSync(esDir).find((f) => f.startsWith(`${id}.`))!;
      const en = parseFrontmatter(read(resolve(enDir, file))).frontmatter as Record<string, unknown>;
      const es = parseFrontmatter(read(resolve(esDir, esFile))).frontmatter as Record<string, unknown>;
      expect(es.order, `${id}: order`).toBe(en.order);
    }
  });

  /**
   * The group label is translated, so the two sides cannot be compared as
   * strings. What has to hold is the SHAPE: pages grouped together in English
   * stay together in Spanish. A typo that splits a group in two would leave
   * the Spanish nav with a section of one.
   */
  it('group pages the same way, whatever the label says', () => {
    const groupsOf = (dir: string) => {
      const byGroup = new Map<string, string[]>();
      for (const id of ids(dir)) {
        const file = readdirSync(dir).find((f) => f.startsWith(`${id}.`))!;
        const fm = parseFrontmatter(read(resolve(dir, file))).frontmatter as { group?: string };
        const key = fm.group ?? '';
        byGroup.set(key, [...(byGroup.get(key) ?? []), id]);
      }
      return [...byGroup.values()].map((v) => v.sort().join(',')).sort();
    };
    expect(groupsOf(esDir)).toEqual(groupsOf(enDir));
  });

  /**
   * And the API reference lands in the same group as its collection siblings.
   * Its label is not frontmatter, so it was hardcoded in English and the
   * Spanish sidebar came out with "Reference" and "Referencia" as two separate
   * sections. Counting groups per language catches that split.
   */
  it('leaves both navs with the same number of groups', () => {
    const labels = (dir: string, apiGroup: string) => {
      const set = new Set<string>([apiGroup]);
      for (const id of ids(dir)) {
        const file = readdirSync(dir).find((f) => f.startsWith(`${id}.`))!;
        const fm = parseFrontmatter(read(resolve(dir, file))).frontmatter as { group?: string };
        set.add(fm.group ?? '');
      }
      return set.size;
    };
    expect(labels(esDir, API_DOC_META.group.es)).toBe(labels(enDir, API_DOC_META.group.en));
  });

  /**
   * The Spanish pages are real translations, not copies of the English ones.
   * They shipped as copies first, behind a notice; this catches a page that
   * silently reverts to the English text.
   */
  it('holds Spanish prose, not the English original', () => {
    for (const f of readdirSync(esDir).filter((f) => /\.(md|mdx)$/.test(f))) {
      const es = read(resolve(esDir, f));
      const en = read(resolve(enDir, f));
      const body = (t: string) => t.replace(/^---[\s\S]*?\n---\n/, '');
      expect(body(es), f).not.toBe(body(en));
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

  /** The notice, and the flag behind it, are gone now that the guides are translated. */
  it('carries no leftover of the untranslated notice', () => {
    expect(layout).not.toContain('docs-untranslated');
    expect(layout).not.toContain('translated');
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
