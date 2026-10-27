import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDocsApiServer, type DocsApiServer } from '../helpers/docsApiServer';

/**
 * The full docs pages, served by the dev server, for what the sidebar render
 * test cannot see: the breadcrumb and prev/next wired in Docs.astro.
 *
 * A nested page (frontmatter `parent`) keeps a flat URL, so its parent is not
 * in the path: the breadcrumb must slot it in. Prev/next must walk the
 * sidebar's visual order (child right after its parent), not the raw `order`.
 */
let server: DocsApiServer;

const PATHS = ['/docs/pr-gatekeeper', '/docs/secrets', '/docs/notifications', '/docs/contexts', '/docs/automations', '/docs/webhooks'];
const html = new Map<string, string>();

/*
 * Every page is fetched once, up front, with a generous budget: the first SSR
 * of a docs page on a cold dev server compiles the whole collection and can
 * take longer than vitest's 5s per-test default.
 */
beforeAll(async () => {
  server = await startDocsApiServer();
  for (const p of PATHS.flatMap((p) => [p, `/es${p}`])) {
    const res = await server.fetch(p);
    expect(res.status, p).toBe(200);
    html.set(p, (await res.text()).replace(/\s+data-astro-source-[a-z]+="[^"]*"/g, '').replace(/\s+/g, ' '));
  }
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

/** The page HTML without Astro's dev-only source attributes, whitespace collapsed. */
async function page(path: string): Promise<string> {
  const body = html.get(path);
  if (body === undefined) throw new Error(`not prefetched: ${path}`);
  return body;
}

const between = (html: string, start: RegExp, end: string) => {
  const from = html.search(start);
  expect(from, String(start)).toBeGreaterThanOrEqual(0);
  return html.slice(from, html.indexOf(end, from));
};

const LOCALES = [
  { lang: 'en', pfx: '', automations: 'Automations', webhooks: 'Webhooks and schedules', secrets: 'Secrets', notifications: 'Notifications', contexts: 'Contexts' },
  { lang: 'es', pfx: '/es', automations: 'Automatizaciones', webhooks: 'Webhooks y programaciones', secrets: 'Secretos', notifications: 'Notificaciones', contexts: 'Contextos' },
] as const;

for (const { lang, pfx, automations, webhooks, secrets, notifications, contexts } of LOCALES) {
  describe(`nested docs page (${lang})`, () => {
    it('breadcrumb: Docs / parent / current page', async () => {
      const body = await page(`${pfx}/docs/pr-gatekeeper`);
      const crumbs = between(body, /<nav class="breadcrumb"/, '</nav>');
      expect(crumbs).toMatch(
        new RegExp(
          `<a href="${pfx}/docs">Docs</a> <span class="separator">/</span> ` +
            `<a href="${pfx}/docs/automations">${automations}</a> <span class="separator">/</span> ` +
            `<span class="current">PR gatekeeper</span>`,
        ),
      );
    });

    it('prev/next of the first child: its parent, then its next sibling', async () => {
      const body = await page(`${pfx}/docs/pr-gatekeeper`);
      const pn = between(body, /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/automations" class="dpn dpn-prev">.*?${automations}`));
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/secrets" class="dpn dpn-next">.*?${secrets}`));
    });

    it('prev/next of a middle child: its previous sibling, then its next sibling', async () => {
      const body = await page(`${pfx}/docs/secrets`);
      const pn = between(body, /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/pr-gatekeeper" class="dpn dpn-prev">.*?PR gatekeeper`));
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/notifications" class="dpn dpn-next">.*?${notifications}`));
    });

    it('prev/next of a later middle child: its previous sibling, then its next sibling', async () => {
      const body = await page(`${pfx}/docs/notifications`);
      const pn = between(body, /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/secrets" class="dpn dpn-prev">.*?${secrets}`));
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/contexts" class="dpn dpn-next">.*?${contexts}`));
    });

    it('prev/next of the last child: its previous sibling, then the parent\'s next sibling', async () => {
      const body = await page(`${pfx}/docs/contexts`);
      const pn = between(body, /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/notifications" class="dpn dpn-prev">.*?${notifications}`));
      expect(pn).toMatch(new RegExp(`<a href="${pfx}/docs/webhooks" class="dpn dpn-next">.*?${webhooks}`));
    });

    it('breadcrumb of the second child: Docs / parent / current page', async () => {
      const crumbs = between(await page(`${pfx}/docs/secrets`), /<nav class="breadcrumb"/, '</nav>');
      expect(crumbs).toMatch(
        new RegExp(
          `<a href="${pfx}/docs/automations">${automations}</a> <span class="separator">/</span> <span class="current">${secrets}</span>`,
        ),
      );
    });

    it('next of the parent is its child', async () => {
      const pn = between(await page(`${pfx}/docs/automations`), /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toContain(`<a href="${pfx}/docs/pr-gatekeeper" class="dpn dpn-next">`);
    });

    it('prev of the parent\'s next sibling is the last child', async () => {
      const pn = between(await page(`${pfx}/docs/webhooks`), /<nav class="docs-prevnext"/, '</nav>');
      expect(pn).toContain(`<a href="${pfx}/docs/contexts" class="dpn dpn-prev">`);
    });

    it('a top-level page keeps its plain breadcrumb', async () => {
      const crumbs = between(await page(`${pfx}/docs/webhooks`), /<nav class="breadcrumb"/, '</nav>');
      expect(crumbs).not.toContain(`${pfx}/docs/automations`);
      expect(crumbs).toContain(`<span class="current">${webhooks}</span>`);
    });

    it('the sidebar of the full page nests the child under its parent', async () => {
      const side = between(await page(`${pfx}/docs/pr-gatekeeper`), /<nav class="docs-nav"/, '</nav>');
      expect(side).toMatch(
        new RegExp(
          `<a href="${pfx}/docs/automations" class="docs-nav-link is-trail">[^<]*</a> ` +
            `<ul class="docs-nav-sub" data-depth="1"> <li> <a href="${pfx}/docs/pr-gatekeeper" class="docs-nav-link is-active" aria-current="page">`,
        ),
      );
    });
  });
}
