import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { API_DOC_META } from '../../lib/apiDoc';

/**
 * El shell de la documentación, guardado sobre el fuente.
 *
 * Existe por un caso real: al portar el shell de helmcode se perdieron cuatro
 * cosas del layout anterior (las migas, el botón de cerrar del drawer móvil,
 * las utilidades de layout del <body> y el prefix matching de la nav) y no
 * falló ni un test ni el build. Solo salió a la luz diffeando los dos ficheros a mano.
 *
 * Se comprueba el fuente y no el HTML renderizado, como en NanBase.test.ts:
 * montar estas páginas bajo SSR arrastra toda la colección y los bindings de
 * Cloudflare. Es una guarda burda, pero cubre exactamente el modo de fallo que
 * ocurrió: un trozo del layout desapareciendo sin que nadie lo note.
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
   * Y las renderiza DENTRO del <main>, no como hermano suyo.
   *
   * `.docs-inner` es un grid de dos columnas (contenido y TOC). Cuando se
   * restauraron las migas acabaron como tercer hijo de ese grid, así que se
   * quedaron la primera columna, el contenido cayó en la de 188px del TOC y la
   * página salió con una palabra por línea. Todos los elementos estaban, que es
   * justo por lo que una comprobación de "¿existe?" no lo vio: el fallo era la colocación.
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
    // Sin la regla que lo muestra en móvil, el botón existe pero es invisible.
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
   * El índice se construye desde el DOM y no desde los `headings` de Astro
   * porque los h2 que renderizan componentes como ModelCard no aparecen en esa
   * lista: /docs/models perdería el índice entero, y en silencio.
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
   * El layout anterior las llevaba como utilidades de Tailwind en el <body> y
   * se perdieron en el port: sin `min-height` el fondo no cubre el viewport en
   * una página corta, y sin `overflow-x` un desbordamiento horizontal deja de
   * recortarse.
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
    // Se tolera un hex: el escalón por encima de surface que el sistema no define.
    expect((body.match(/#[0-9a-fA-F]{3,8}/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('DocsTopBar: shared chrome', () => {
  it('is used by both the guides and the API reference', () => {
    expect(layout).toContain('DocsTopBar');
    expect(read('../../components/docs/ApiReference.astro')).toContain('DocsTopBar');
  });

  /**
   * Las dos superficies son bilingües ahora que las guías tienen rutas en
   * español. El switcher sigue siendo opt-in vía prop y no siempre activo,
   * porque una página sin contraparte en español mandaría a los lectores a un
   * 404, que es lo que hacía antes de que existiera /es/docs.
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
   * Los dos enlaces que llevan ↗ salen del sitio, así que son absolutos. Una
   * ruta relativa te deja en el dominio que estés navegando: en una preview de
   * Cloudflare, "nan.builders" te dejaba en *.workers.dev. Venía de portar el
   * enlace relativo de helmcode, donde es correcto porque ese es su propio dominio.
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
   * Un `order` repetido no rompe ni el build ni ningún test: solo deja la
   * navegación en un orden arbitrario, que es el tipo de cosa que nadie mira
   * hasta que un lector se pierde.
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
