import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { API_DOC_META } from '../../lib/apiDoc';

/**
 * Las guías en español.
 *
 * Existen para que el switcher de idioma de la cabecera de las docs no sea un
 * enlace a un 404: antes de esto, /es/docs y /es/docs/models respondían 404 y
 * solo /es/docs/api tenía versión en español.
 *
 * Las copias en español salen como copias de las inglesas, marcadas con
 * `translated: false`, y la página lo dice en vez de hacer pasar el inglés por
 * una traducción. Estos tests guardan el emparejamiento y el marcador, no la prosa.
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
   * Una página en español que faltara en el lado inglés daría 404 desde el
   * switcher, que es exactamente el problema que esto existe para arreglar.
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
   * La etiqueta de grupo está traducida, así que los dos lados no se pueden
   * comparar como strings. Lo que tiene que cumplirse es la FORMA: las páginas
   * agrupadas juntas en inglés siguen juntas en español. Una errata que partiera
   * un grupo en dos dejaría la nav española con una sección de uno.
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
   * Y la referencia de la API cae en el mismo grupo que sus hermanas de la
   * colección. Su etiqueta no es frontmatter, así que estaba hardcodeada en
   * inglés y el sidebar español salía con "Reference" y "Referencia" como dos
   * secciones separadas. Contar grupos por idioma caza esa división.
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
   * Las páginas en español son traducciones reales, no copias de las inglesas.
   * Salieron primero como copias, detrás de un aviso; esto caza una página que
   * vuelva en silencio al texto inglés.
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
   * Las migas se construyen desde la ruta sin el locale. Contar `/es` como
   * segmento hacía que cada página en español mostrara una miga de más para el índice de docs.
   */
  it('builds the breadcrumb from the path without the locale prefix', () => {
    expect(layout).toContain('const breadcrumb = enPath');
  });

  it('declares both languages to search engines', () => {
    expect(layout).toContain('hreflang="en"');
    expect(layout).toContain('hreflang="es"');
    expect(layout).toContain('hreflang="x-default"');
  });

  /** El aviso, y el flag que había detrás, ya no están ahora que las guías están traducidas. */
  it('carries no leftover of the untranslated notice', () => {
    expect(layout).not.toContain('docs-untranslated');
    expect(layout).not.toContain('translated');
  });
});

/**
 * Los slugs ingleses son lo que /api/docs publica y el bot de Discord indexa, y
 * SAFE_SLUG rechaza barras. Mover las guías bajo `docs/en/…` convertiría cada
 * id en `en/intro` y la ruta del manifest respondería 500 en el primero,
 * llevándose por delante toda la base de conocimiento del bot. Por eso las
 * copias en español viven en su propio directorio.
 */
describe('the English collection is left where it is', () => {
  it('keeps flat, slug-safe ids', () => {
    const SAFE = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const id of ids(enDir)) {
      expect(SAFE.test(id), id).toBe(true);
    }
  });
});
