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

  /**
   * Both surfaces are bilingual now that the guides have Spanish routes. The
   * switcher stays opt-in through the prop rather than always-on, because a
   * page whose Spanish counterpart does not exist would send readers to a 404,
   * which is what it used to do before /es/docs existed.
   */
  it('offers the language switcher on both surfaces', () => {
    expect(topBar).toContain('bilingual');
    expect(layout).toMatch(/<DocsTopBar[^>]*\bbilingual\b/);
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

  /**
   * The list is closed on purpose: a typo in `group` does not fail a build, it
   * silently opens a fourth nav section holding one page. Adding a section is
   * a deliberate act, so it is written here too.
   */
  it('declares a known group on every guide', () => {
    const known = new Set(['Get started', 'Set up your agent', 'Reference', 'Guides']);
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

/**
 * The chrome around the prose, in the reader's language.
 *
 * docsCopyIsEnglish.test.ts guards this same surface in the other direction:
 * Spanish had leaked into the English docs, the copy button said "Copiar" and
 * the toast "¡Copiado al portapapeles!". It was fixed by writing those strings
 * in English - which is right for /docs and leaves /es/docs showing "Copied to
 * clipboard", "Copy", "No results" and an aria-label of "Search documentation"
 * under Spanish prose.
 *
 * The layout already has the table that solves it, `T`, with an `en` branch and
 * an `es` one; these strings are simply the ones that never made it in, because
 * they live down in the client scripts rather than in the markup. So the rule
 * is not "which language is this" but "does it come from the table": a literal
 * a reader can see, sitting outside `T`, is a string that has only one
 * language whichever one it happens to be.
 */
describe('Docs.astro: the chrome comes from the translation table', () => {
  const start = layout.indexOf('const T = {');
  const end = layout.indexOf('}[lang];', start);

  it('has a table to come from', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  const table = layout.slice(start, end);
  const outside = layout.slice(0, start) + layout.slice(end);

  it('translates every key it defines', () => {
    const branch = (name: 'en' | 'es') => {
      const from = table.indexOf(`  ${name}: {`);
      const to = table.indexOf('  },', from);
      return [...table.slice(from, to).matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort();
    };
    expect(branch('es'), 'the es branch is missing keys the en branch has').toEqual(branch('en'));
  });

  /**
   * Written as they appear in the source, because that is what has to go. Each
   * one is a string the reader sees: the toast, the copy button in both of its
   * states, the empty search panel and two aria-labels.
   */
  const HARDCODED = [
    ">Copied to clipboard<",
    "showCopyToast('Copied to clipboard')",
    "'Copy failed'",
    '>No results<',
    '"Search documentation"',
    'aria-label="Documentation"',
    '>Copy</span>',
    "textContent = 'Copied'",
    "textContent = 'Copy'",
    'Copy ${lang.label}',
  ];

  /**
   * The copy button reads its labels off the toast element's dataset, because
   * that script is bundled and typed and so cannot take define:vars. It has no
   * English fallback on purpose - a fallback is exactly how the Spanish pages
   * came to say "Copied to clipboard" - which means a missing data attribute
   * shows as a button with no label instead of a button in the wrong language.
   * Silent either way, so it is pinned here.
   */
  it('hands the bundled script every label it reads', () => {
    const toast = /<div\s+class="copy-toast"[\s\S]*?>/.exec(layout)?.[0] ?? '';
    for (const attr of ['data-toast', 'data-copy', 'data-copied', 'data-failed', 'data-copy-aria']) {
      expect(toast, `the copy toast does not carry ${attr}`).toContain(attr);
    }
    for (const read of ['L.toast', 'L.copy', 'L.copied', 'L.failed', 'L.copyAria']) {
      expect(layout, `nothing reads ${read}`).toContain(read);
    }
  });

  it.each(HARDCODED)('does not hardcode %s', (snippet) => {
    expect(
      outside.includes(snippet),
      `${snippet} is written into the layout instead of coming from T, so it ` +
        `shows in English under the Spanish guides`,
    ).toBe(false);
  });
});
