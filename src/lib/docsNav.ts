/**
 * Navigation and search-index logic for the docs shell.
 *
 * It lives here rather than inline in Docs.astro so it can be unit-tested: a
 * layout is only reachable through a full SSR render, and these are exactly the
 * parts that break silently. The nav is what a reader uses to find anything,
 * and the anchors below are a contract with a third-party package.
 */

export interface DocsNavItem {
  slug: string;
  label: string;
  order: number;
  group: string;
  description: string;
}

export interface DocsNavGroup {
  group: string;
  items: DocsNavItem[];
}

/** A search hit target: a heading inside a docs page. */
export interface DocsHeading {
  text: string;
  /** Fragment WITHOUT the leading '#'. */
  slug: string;
}

/**
 * Scalar's slug rules for a heading, reproduced.
 *
 * Verified against the rendered page: "Versioning & compatibility" becomes
 * `versioning-compatibility` and "Making requests" becomes `making-requests`.
 */
export function slugifyAnchor(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Where a heading of the API reference lives, as a fragment.
 *
 * Scalar has TWO anchor namespaces and they are not interchangeable: the
 * sections of the overview (which come from `info.description`) are addressed
 * as `description/<slug>`, and the endpoint groups as `tag/<slug>`. Sending a
 * reader to `tag/authentication` lands them on the page without scrolling,
 * because that id does not exist.
 *
 * This is a coupling to `@scalar/api-reference` that nothing else enforces, so
 * it is pinned by tests: if a version of Scalar changes the scheme, the search
 * results start pointing nowhere and no build fails.
 */
export function apiSearchHeadings(spec: {
  info?: { description?: string };
  tags?: Array<{ name?: string }>;
}): DocsHeading[] {
  const overview = (spec.info?.description ?? '')
    .split('\n')
    // `^##\s` only matches level 2: a `###` has a '#' where the space must be.
    .flatMap((line) => {
      const m = /^##\s+(.+)$/.exec(line);
      return m ? [m[1].trim()] : [];
    })
    .map((text) => ({ text, slug: `description/${slugifyAnchor(text)}` }));

  const tags = (spec.tags ?? [])
    .map((t) => t.name)
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ text: name, slug: `tag/${slugifyAnchor(name)}` }));

  return [...overview, ...tags];
}

/**
 * Whether a nav entry should read as the current page.
 *
 * Prefix matching, not just equality, so a nested route highlights its parent.
 * `/docs` is excluded from the prefix branch or it would highlight on every
 * page of the section.
 */
export function isActiveDocPath(here: string, slug: string): boolean {
  const target = slug.replace(/\/+$/, '');
  const current = here.replace(/\/+$/, '') || '/docs';
  return current === target || (target !== '/docs' && current.startsWith(`${target}/`));
}

/**
 * Groups the nav, preserving the order the items already carry.
 *
 * The group order follows the lowest `order` in each group rather than a list
 * written by hand in the layout, so adding a guide stays a matter of creating
 * one file.
 */
export function groupDocsNav(items: DocsNavItem[]): DocsNavGroup[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const groups: DocsNavGroup[] = [];
  for (const item of sorted) {
    const existing = groups.find((g) => g.group === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}
