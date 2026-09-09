import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';
import { API_DOC_META, API_DOC_SLUG } from './apiDoc';
import {
  apiSearchHeadings,
  groupDocsNav,
  isActiveDocPath,
  slugifyAnchor,
  type DocsNavItem,
} from './docsNav';

/**
 * La navegación de docs y el índice de búsqueda.
 *
 * Nada de esto tenía test hasta que se portó el shell, y el port perdió cuatro
 * cosas de golpe sin que fallara ni una comprobación. Los anchors de abajo son
 * la parte que más preocupa: son un contrato con `@scalar/api-reference`,
 * verificado una vez a mano contra la página renderizada, y nada más en el
 * build se enteraría si una versión de Scalar cambiara el esquema.
 */

const item = (over: Partial<DocsNavItem> = {}): DocsNavItem => ({
  slug: '/docs/x',
  label: 'X',
  order: 0,
  group: 'Guides',
  description: '',
  ...over,
});

describe('isActiveDocPath', () => {
  it('matches the exact page', () => {
    expect(isActiveDocPath('/docs/models', '/docs/models')).toBe(true);
  });

  it('ignores a trailing slash on either side', () => {
    expect(isActiveDocPath('/docs/models/', '/docs/models')).toBe(true);
    expect(isActiveDocPath('/docs/models', '/docs/models/')).toBe(true);
  });

  /**
   * El port sustituyó esto por una igualdad simple. Con la colección plana de
   * hoy nada parecía roto, que es justo lo que hace que merezca fijarlo: la
   * regresión solo saldría el día que una guía se anide.
   */
  it('highlights a parent when the page is a nested route', () => {
    expect(isActiveDocPath('/docs/guides/deploy', '/docs/guides')).toBe(true);
  });

  it('does not let /docs highlight on every page of the section', () => {
    expect(isActiveDocPath('/docs/models', '/docs')).toBe(false);
    expect(isActiveDocPath('/docs', '/docs')).toBe(true);
  });

  it('does not match a sibling that merely shares a prefix', () => {
    expect(isActiveDocPath('/docs/models-old', '/docs/models')).toBe(false);
  });
});

describe('groupDocsNav', () => {
  it('orders groups by the lowest order inside each one', () => {
    const groups = groupDocsNav([
      item({ label: 'C', order: 5, group: 'Guides' }),
      item({ label: 'A', order: 0, group: 'Get started' }),
      item({ label: 'B', order: 2, group: 'Reference' }),
      item({ label: 'A2', order: 1, group: 'Get started' }),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Get started', 'Reference', 'Guides']);
    expect(groups[0].items.map((i) => i.label)).toEqual(['A', 'A2']);
  });

  it('keeps every item, without dropping or duplicating any', () => {
    const items = [item({ label: 'A' }), item({ label: 'B', group: 'Other' }), item({ label: 'C' })];
    const flat = groupDocsNav(items).flatMap((g) => g.items.map((i) => i.label));
    expect(flat.sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('slugifyAnchor', () => {
  // Comprobados uno a uno contra los ids que Scalar pinta en la página.
  it.each([
    ['Authentication', 'authentication'],
    ['Making requests', 'making-requests'],
    ['Rate limits', 'rate-limits'],
    ['Versioning & compatibility', 'versioning-compatibility'],
    ['Model catalog', 'model-catalog'],
    ['MCP', 'mcp'],
  ])('%s -> %s', (input, expected) => {
    expect(slugifyAnchor(input)).toBe(expected);
  });
});

describe('apiSearchHeadings', () => {
  const headings = apiSearchHeadings(spec);

  /**
   * Scalar tiene DOS espacios de nombres de anchors y no son intercambiables.
   * La primera versión del índice de búsqueda etiquetaba todo como `tag/`, así
   * que buscar "Authentication" producía un enlace a un id que no existe y el
   * lector aterrizaba en la página sin hacer scroll.
   */
  it('addresses the overview sections as description/, not tag/', () => {
    const auth = headings.find((h) => h.text === 'Authentication');
    expect(auth?.slug).toBe('description/authentication');
    expect(headings.some((h) => h.slug === 'tag/authentication')).toBe(false);
  });

  it('addresses the endpoint groups as tag/', () => {
    for (const tag of spec.tags ?? []) {
      const hit = headings.find((h) => h.text === tag.name);
      expect(hit, tag.name).toBeDefined();
      expect(hit!.slug).toBe(`tag/${slugifyAnchor(tag.name!)}`);
    }
  });

  it('covers every tag the spec declares', () => {
    const tagSlugs = headings.filter((h) => h.slug.startsWith('tag/')).map((h) => h.text);
    expect(tagSlugs.sort()).toEqual((spec.tags ?? []).map((t) => t.name).sort());
  });

  /** agents.md enlaza aquí a mano; si se renombra el tag, ese enlace muere. */
  it('keeps the MCP anchor that agents.md points at', () => {
    expect(headings.some((h) => h.slug === 'tag/mcp')).toBe(true);
  });

  it('takes only level-2 headings, not the level-3 ones nested under them', () => {
    // "Use it as an agent tool" es un `#####` dentro de la descripción de una operación.
    expect(headings.some((h) => h.text === 'Use it as an agent tool')).toBe(false);
  });
});

describe('the API reference entry of the nav', () => {
  it('carries a group per locale, so it does not split the Spanish nav', () => {
    expect(API_DOC_META.group.en).toBe('Reference');
    expect(API_DOC_META.group.es).toBe('Referencia');
  });

  it('keeps the slug the rest of the pipeline addresses it by', () => {
    expect(API_DOC_SLUG).toBe('api');
  });
});
