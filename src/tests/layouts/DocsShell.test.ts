import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { API_DOC_META } from '../../lib/apiDoc';

/**
 * The documentation shell, guarded over the source.
 *
 * It exists because of a real case: porting helmcode's shell lost four things
 * from the previous layout (the breadcrumbs, the mobile drawer's close button,
 * the <body> layout utilities and the nav's prefix matching) and neither a test
 * nor the build failed. It only surfaced by diffing the two files by hand.
 *
 * The source is checked rather than the rendered HTML, as in NanBase.test.ts:
 * mounting these pages under SSR drags in the whole collection and the
 * Cloudflare bindings. It is a blunt guard, but it covers exactly the failure
 * mode that happened: a piece of the layout disappearing unnoticed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf-8');

const layout = read('../../layouts/Docs.astro');
const topBar = read('../../components/docs/DocsTopBar.astro');
const shellCss = read('../../styles/docs-shell.css');

describe('Docs.astro: pieces that must not disappear', () => {
  it('renders the breadcrumbs', () => {
    expect(layout).toContain('class="breadcrumb"');
    expect(layout).toContain('aria-label="Breadcrumb"');
  });

  /**
   * And renders them INSIDE the <main>, not as its sibling.
   *
   * `.docs-inner` is a two-column grid (content and TOC). When the breadcrumbs
   * were restored they ended up as a third child of that grid, so they took the
   * first column, the content landed in the TOC's 188px one and the page came
   * out one word per line. Every element was present, which is precisely why an
   * "does it exist?" check missed it: the fault was placement.
   */
  it('puts the breadcrumbs inside main, not as a third child of the grid', () => {
    const main = layout.indexOf('<main id="docs-main"');
    const fin = layout.indexOf('</main>', main);
    const migas = layout.indexOf('class="breadcrumb"');
    expect(main).toBeGreaterThan(-1);
    expect(migas).toBeGreaterThan(main);
    expect(migas).toBeLessThan(fin);
  });

  it('has a skip-to-content link pointing at main', () => {
    expect(layout).toContain('class="skip-link"');
    expect(layout).toContain('href="#docs-main"');
    expect(layout).toContain('id="docs-main"');
  });

  it('keeps the mobile drawer close button, and wired up', () => {
    expect(layout).toContain('id="docs-side-close"');
    expect(layout).toContain("getElementById('docs-side-close')");
    // Without the rule that shows it on mobile, the button exists but is invisible.
    expect(shellCss).toMatch(/\.docs-side-close\s*\{[^}]*display:\s*block/s);
  });

  it('keeps the table of contents and prev/next', () => {
    expect(layout).toContain('id="toc"');
    expect(layout).toContain('class="docs-prevnext"');
    expect(layout).toContain('aria-label="Pagination"');
  });

  it('keeps the search box with its keyboard shortcut', () => {
    expect(layout).toContain('id="docs-search"');
    expect(layout).toMatch(/metaKey \|\| e\.ctrlKey/);
  });

  /**
   * The index is built from the DOM rather than from Astro's `headings`
   * because the h2s rendered by components such as ModelCard do not appear in
   * that list: /docs/models would lose its whole index, and silently.
   */
  it('builds the index from the DOM and honours data-toc-text', () => {
    expect(layout).toContain(".docs-content h2, .docs-content h3");
    expect(layout).toContain('dataset.tocText');
  });

  it('keeps the code-block enhancement and the copy toast', () => {
    expect(layout).toContain('docs-code-block');
    expect(layout).toContain("id=\"copy-toast\"");
    expect(layout).toContain('navigator.clipboard.writeText');
  });
});

describe('body.docs: layout utilities', () => {
  /**
   * The previous layout carried these as Tailwind utilities on the <body> and
   * they were lost in the port: without `min-height` the background does not
   * cover the viewport on a short page, and without `overflow-x` a horizontal
   * overflow stops being clipped.
   */
  it('declares min-height, overflow-x and the background', () => {
    const body = shellCss.slice(shellCss.indexOf('body.docs'));
    expect(body).toMatch(/min-height:\s*100vh/);
    expect(body).toMatch(/overflow-x:\s*hidden/);
    expect(body).toMatch(/background:\s*var\(--doc-bg\)/);
  });

  it('feeds the --doc-* layer from the tokens, with no loose hex', () => {
    const body = shellCss.slice(shellCss.indexOf('body.docs'), shellCss.indexOf('.skip-link'));
    expect(body).toMatch(/--doc-bg:\s*var\(--color-bg\)/);
    expect(body).toMatch(/--doc-tx:\s*var\(--color-body\)/);
    // One hex tolerated: the step above surface the system does not define.
    expect((body.match(/#[0-9a-fA-F]{3,8}/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('DocsTopBar: shared chrome', () => {
  it('is used by both the guides and the API reference', () => {
    expect(layout).toContain('DocsTopBar');
    expect(read('../../components/docs/ApiReference.astro')).toContain('DocsTopBar');
  });

  it('only offers the language switcher where the page exists in both', () => {
    // The guides are not translated: offering ES there leads to a 404.
    expect(topBar).toContain('bilingual');
    expect(layout).not.toMatch(/<DocsTopBar[^>]*\bbilingual\b/);
    expect(read('../../components/docs/ApiReference.astro')).toMatch(
      /<DocsTopBar[^>]*\bbilingual\b/,
    );
  });

  it('uses the brand wordmark, not the bare PNG icon', () => {
    expect(topBar).toContain('docs-wm');
    expect(topBar).not.toContain('nan-logo.png');
  });

  /**
   * Both links carrying ↗ leave the site, so they are absolute. A relative path
   * keeps them on whatever domain you are browsing: on a Cloudflare preview,
   * "nan.builders" left you on *.workers.dev. It came from porting helmcode's
   * relative link, where it is correct because that is their own domain.
   */
  it('uses absolute URLs for the links that leave the site', () => {
    expect(topBar).toContain('https://nan.builders');
    expect(topBar).toContain('https://cloud.nan.builders/');
    expect(topBar).not.toMatch(/href=\{pfx \|\| '\/'\}/);
  });
});

describe('frontmatter of the docs collection', () => {
  const docsDir = resolve(here, '../../content/docs');
  const files = readdirSync(docsDir).filter((f) => /\.(md|mdx)$/.test(f));
  const metas = files.map((f) => ({
    file: f,
    data: parseFrontmatter(readFileSync(resolve(docsDir, f), 'utf-8')).frontmatter as {
      order?: number;
      group?: string;
      title?: string;
    },
  }));

  it('finds guides to guard', () => {
    expect(metas.length).toBeGreaterThan(0);
  });

  it('declares a known group on every guide', () => {
    const known = new Set(['Get started', 'Reference', 'Guides']);
    for (const m of metas) {
      expect(known.has(m.data.group ?? ''), `${m.file}: group=${m.data.group}`).toBe(true);
    }
  });

  /**
   * A repeated `order` breaks neither the build nor any test: it just leaves
   * the navigation in an arbitrary order, which is the kind of thing nobody
   * looks at until a reader gets lost.
   */
  it('repeats no order, counting the reference\'s synthetic entry', () => {
    const orders = [...metas.map((m) => m.data.order), API_DOC_META.order];
    expect(new Set(orders).size, `orders: ${orders.join(', ')}`).toBe(orders.length);
  });

  it('numbers from zero with no gaps', () => {
    const orders = [...metas.map((m) => m.data.order as number), API_DOC_META.order].sort(
      (a, b) => a - b,
    );
    expect(orders).toEqual(orders.map((_, i) => i));
  });
});
