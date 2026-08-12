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
 * The docs navigation and the search index.
 *
 * None of this had a test until the shell was ported, and the port lost four
 * things in one go without a single check failing. The anchors below are the
 * part that worries most: they are a contract with `@scalar/api-reference`,
 * verified once by hand against the rendered page, and nothing else in the
 * build would notice if a version of Scalar changed the scheme.
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
   * The port replaced this with plain equality. With today's flat collection
   * nothing looked broken, which is exactly what makes it worth pinning: the
   * regression would only surface the day a guide gets nested.
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
   * Scalar has TWO anchor namespaces and they are not interchangeable. The
   * first version of the search index labelled everything `tag/`, so searching
   * "Authentication" produced a link to an id that does not exist and the
   * reader landed on the page without scrolling.
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

  /** agents.md links here by hand; if the tag is renamed, that link dies. */
  it('keeps the MCP anchor that agents.md points at', () => {
    expect(headings.some((h) => h.slug === 'tag/mcp')).toBe(true);
  });

  it('takes only level-2 headings, not the level-3 ones nested under them', () => {
    // "Use it as an agent tool" is a `#####` inside an operation description.
    expect(headings.some((h) => h.text === 'Use it as an agent tool')).toBe(false);
  });
});

describe('the API reference entry of the nav', () => {
  it('carries a group so it does not fall into the default bucket', () => {
    expect(API_DOC_META.group).toBe('Reference');
  });

  it('keeps the slug the rest of the pipeline addresses it by', () => {
    expect(API_DOC_SLUG).toBe('api');
  });
});
