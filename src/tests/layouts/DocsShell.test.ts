import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { API_DOC_META } from '../../lib/apiDoc';

/**
 * El shell de la documentación, vigilado sobre el código fuente.
 *
 * Existe por un caso real: al portar el shell de helmcode se perdieron cuatro
 * cosas del layout anterior (las migas, el botón de cerrar del cajón móvil, las
 * utilidades de layout del <body> y la coincidencia por prefijo del nav) y no
 * falló ni un test ni el build. Solo se vio comparando los dos ficheros a mano.
 *
 * Se comprueba la fuente y no el HTML renderizado, igual que NanBase.test.ts:
 * montar estas páginas en SSR arrastra la colección entera y los bindings de
 * Cloudflare. Es un guard tosco, pero cubre justo el modo de fallo que ocurrió:
 * que un trozo del layout desaparezca sin que nadie se entere.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf-8');

const layout = read('../../layouts/Docs.astro');
const topBar = read('../../components/docs/DocsTopBar.astro');
const shellCss = read('../../styles/docs-shell.css');

describe('Docs.astro — piezas que no pueden desaparecer', () => {
  it('pinta las migas de pan', () => {
    expect(layout).toContain('class="breadcrumb"');
    expect(layout).toContain('aria-label="Breadcrumb"');
  });

  it('tiene enlace de saltar al contenido, apuntando al main', () => {
    expect(layout).toContain('class="skip-link"');
    expect(layout).toContain('href="#docs-main"');
    expect(layout).toContain('id="docs-main"');
  });

  it('mantiene el botón de cerrar del cajón móvil, y cableado', () => {
    expect(layout).toContain('id="docs-side-close"');
    expect(layout).toContain("getElementById('docs-side-close')");
    // Sin la regla que lo enseña en móvil, el botón existe pero no se ve.
    expect(shellCss).toMatch(/\.docs-side-close\s*\{[^}]*display:\s*block/s);
  });

  it('conserva el índice de contenidos y el prev/next', () => {
    expect(layout).toContain('id="toc"');
    expect(layout).toContain('class="docs-prevnext"');
    expect(layout).toContain('aria-label="Pagination"');
  });

  it('conserva el buscador con su atajo de teclado', () => {
    expect(layout).toContain('id="docs-search"');
    expect(layout).toMatch(/metaKey \|\| e\.ctrlKey/);
  });

  /**
   * El índice se construye desde el DOM y no desde los `headings` de Astro
   * porque las h2 que pintan componentes como ModelCard no aparecen en esa
   * lista: /docs/models perdería su índice entero, y en silencio.
   */
  it('construye el índice desde el DOM y respeta data-toc-text', () => {
    expect(layout).toContain(".docs-content h2, .docs-content h3");
    expect(layout).toContain('dataset.tocText');
  });

  it('mantiene el enriquecimiento de bloques de código y el aviso de copiado', () => {
    expect(layout).toContain('docs-code-block');
    expect(layout).toContain("id=\"copy-toast\"");
    expect(layout).toContain('navigator.clipboard.writeText');
  });
});

describe('body.docs — utilidades de layout', () => {
  /**
   * El layout anterior las llevaba como utilidades de Tailwind en el <body> y
   * se perdieron al portar: sin `min-height` el fondo no cubre el viewport en
   * una página corta, y sin `overflow-x` una fuga horizontal deja de
   * recortarse.
   */
  it('declara min-height, overflow-x y el fondo', () => {
    const body = shellCss.slice(shellCss.indexOf('body.docs'));
    expect(body).toMatch(/min-height:\s*100vh/);
    expect(body).toMatch(/overflow-x:\s*hidden/);
    expect(body).toMatch(/background:\s*var\(--doc-bg\)/);
  });

  it('alimenta la capa --doc-* desde los tokens, sin hex sueltos', () => {
    const body = shellCss.slice(shellCss.indexOf('body.docs'), shellCss.indexOf('.skip-link'));
    expect(body).toMatch(/--doc-bg:\s*var\(--color-bg\)/);
    expect(body).toMatch(/--doc-tx:\s*var\(--color-body\)/);
    // Un solo hex tolerado, el escalón sobre surface que el sistema no tiene.
    expect((body.match(/#[0-9a-fA-F]{3,8}/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('DocsTopBar — chrome compartido', () => {
  it('lo usan tanto las guías como la referencia de API', () => {
    expect(layout).toContain('DocsTopBar');
    expect(read('../../components/docs/ApiReference.astro')).toContain('DocsTopBar');
  });

  it('solo ofrece el selector de idioma cuando la página existe en los dos', () => {
    // Las guías no están traducidas: ofrecer ES ahí lleva a un 404.
    expect(topBar).toContain('bilingual');
    expect(layout).not.toMatch(/<DocsTopBar[^>]*\bbilingual\b/);
    expect(read('../../components/docs/ApiReference.astro')).toMatch(
      /<DocsTopBar[^>]*\bbilingual\b/,
    );
  });

  it('usa el logotipo de marca, no el isotipo suelto en PNG', () => {
    expect(topBar).toContain('docs-wm');
    expect(topBar).not.toContain('nan-logo.png');
  });
});

describe('frontmatter de la colección de docs', () => {
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

  it('encuentra guías que vigilar', () => {
    expect(metas.length).toBeGreaterThan(0);
  });

  it('declara un grupo conocido en cada guía', () => {
    const known = new Set(['Get started', 'Reference', 'Guides']);
    for (const m of metas) {
      expect(known.has(m.data.group ?? ''), `${m.file}: group=${m.data.group}`).toBe(true);
    }
  });

  /**
   * Un `order` repetido no rompe el build ni ningún test: solo deja la
   * navegación en un orden arbitrario, que es de las cosas que nadie mira
   * hasta que un lector se pierde.
   */
  it('no repite ningún order, contando la entrada sintética de la referencia', () => {
    const orders = [...metas.map((m) => m.data.order), API_DOC_META.order];
    expect(new Set(orders).size, `orders: ${orders.join(', ')}`).toBe(orders.length);
  });

  it('numera sin huecos desde cero', () => {
    const orders = [...metas.map((m) => m.data.order as number), API_DOC_META.order].sort(
      (a, b) => a - b,
    );
    expect(orders).toEqual(orders.map((_, i) => i));
  });
});
