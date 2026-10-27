import { beforeAll, describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import DocsSidebarNav from '../../components/docs/DocsSidebarNav.astro';
import { API_DOC_META, API_DOC_SLUG } from '../../lib/apiDoc';
import { docsNavItemFromEntry, groupDocsNav, type DocsNavItem } from '../../lib/docsNav';

/**
 * The docs sidebar, rendered for real from the real guides (EN and ES).
 *
 * Owner's ask (2026-10-12): the PR gatekeeper guide must show BELOW
 * Automations as its sub-item, not as a sibling at the same level. This mounts
 * the same component the layout uses, fed by the same mapper, and reads the
 * HTML a browser would get.
 */
const here = dirname(fileURLToPath(import.meta.url));

const LOCALES = {
  en: { dir: '../../content/docs', pfx: '', automations: 'Automations' },
  es: { dir: '../../content/docs-es', pfx: '/es', automations: 'Automatizaciones' },
} as const;

/** The nav items the layout builds, from frontmatter instead of the collection. */
function navItems(lang: keyof typeof LOCALES): DocsNavItem[] {
  const { dir, pfx } = LOCALES[lang];
  const abs = resolve(here, dir);
  const entries = readdirSync(abs)
    .filter((f) => /\.(md|mdx)$/.test(f))
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(resolve(abs, f), 'utf-8')).frontmatter as Record<string, unknown>;
      return {
        id: f.replace(/\.(md|mdx)$/, ''),
        data: {
          title: String(fm.title),
          order: Number(fm.order),
          group: String(fm.group ?? 'Guides'),
          description: String(fm.description ?? ''),
          parent: fm.parent as string | undefined,
        },
      };
    });
  return [
    ...entries.map((e) => docsNavItemFromEntry(e, pfx)),
    {
      slug: `${pfx}/docs/${API_DOC_SLUG}`,
      label: API_DOC_META.title,
      order: API_DOC_META.order,
      group: API_DOC_META.group[lang],
      description: API_DOC_META.description,
    },
  ];
}

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

/** The sidebar's HTML with whitespace collapsed, for structural matching. */
async function sidebar(lang: keyof typeof LOCALES, path: string): Promise<string> {
  const html = await container.renderToString(DocsSidebarNav, {
    props: { groups: groupDocsNav(navItems(lang)), here: path },
  });
  return html.replace(/\s+/g, ' ');
}

for (const lang of ['en', 'es'] as const) {
  const { pfx, automations } = LOCALES[lang];
  const gatekeeper = `${pfx}/docs/pr-gatekeeper`;

  describe(`docs sidebar (${lang})`, () => {
    it('renders PR gatekeeper inside a nested list right under Automations', async () => {
      const html = await sidebar(lang, `${pfx}/docs`);
      const re = new RegExp(
        `<li class="has-children"[^>]*>\\s*<a href="${pfx}/docs/automations"[^>]*>\\s*${automations}\\s*</a>\\s*` +
          `<ul class="docs-nav-sub" data-depth="1"[^>]*>\\s*<li[^>]*>\\s*<a href="${gatekeeper}"`,
      );
      expect(html).toMatch(re);
    });

    it('lists PR gatekeeper exactly once', async () => {
      const html = await sidebar(lang, `${pfx}/docs`);
      expect(html.match(new RegExp(`href="${gatekeeper}"`, 'g'))).toHaveLength(1);
    });

    it('keeps Webhooks at the top level, after the Automations block', async () => {
      const html = await sidebar(lang, `${pfx}/docs`);
      // Closing the sub-list and the Automations item, then the next sibling.
      expect(html).toMatch(
        new RegExp(`href="${gatekeeper}"[\\s\\S]*?</ul>\\s*</li>\\s*<li[^>]*>\\s*<a href="${pfx}/docs/webhooks"`),
      );
      expect(html).toMatch(new RegExp(`<ul data-depth="0"[^>]*>[\\s\\S]*href="${pfx}/docs/webhooks"`));
    });

    it('marks the child as the current page and Automations as the trail when the guide is open', async () => {
      const html = await sidebar(lang, gatekeeper);
      expect(html).toMatch(
        new RegExp(`<a href="${gatekeeper}" class="docs-nav-link is-active" aria-current="page"`),
      );
      expect(html).toMatch(new RegExp(`<a href="${pfx}/docs/automations" class="docs-nav-link is-trail"(?! aria-current)`));
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    });

    // Owner's ask (2026-10-14): the Secrets page is the second sub-item of
    // Automations, right after PR gatekeeper, in the same nested list.
    it('renders Secrets in the same nested list, right after PR gatekeeper', async () => {
      const html = await sidebar(lang, `${pfx}/docs`);
      expect(html).toMatch(
        new RegExp(
          `<ul class="docs-nav-sub" data-depth="1"[^>]*>\\s*<li[^>]*>\\s*<a href="${gatekeeper}"[^>]*>[^<]*</a>\\s*</li>\\s*` +
            `<li[^>]*>\\s*<a href="${pfx}/docs/secrets"[^>]*>[^<]*</a>\\s*</li>`,
        ),
      );
      expect(html.match(new RegExp(`href="${pfx}/docs/secrets"`, 'g'))).toHaveLength(1);
    });

    // Owner's ask (2026-10-14): Notifications is the third sub-item of
    // Automations, right after Secrets. Agent contexts (devops
    // AGENT-CONTEXT.md §7) follow it and close the nested list.
    it('renders Notifications in the same nested list, right after Secrets, and Contexts last', async () => {
      const html = await sidebar(lang, `${pfx}/docs`);
      expect(html).toMatch(
        new RegExp(
          `<ul class="docs-nav-sub" data-depth="1"[^>]*>\\s*<li[^>]*>\\s*<a href="${gatekeeper}"[^>]*>[^<]*</a>\\s*</li>\\s*` +
            `<li[^>]*>\\s*<a href="${pfx}/docs/secrets"[^>]*>[^<]*</a>\\s*</li>\\s*` +
            `<li[^>]*>\\s*<a href="${pfx}/docs/notifications"[^>]*>[^<]*</a>\\s*</li>\\s*` +
            `<li[^>]*>\\s*<a href="${pfx}/docs/contexts"[^>]*>[^<]*</a>\\s*</li>\\s*</ul>`,
        ),
      );
      expect(html.match(new RegExp(`href="${pfx}/docs/notifications"`, 'g'))).toHaveLength(1);
      expect(html.match(new RegExp(`href="${pfx}/docs/contexts"`, 'g'))).toHaveLength(1);
    });

    it('marks Notifications as the current page and Automations as the trail when it is open', async () => {
      const html = await sidebar(lang, `${pfx}/docs/notifications`);
      expect(html).toMatch(new RegExp(`<a href="${pfx}/docs/notifications" class="docs-nav-link is-active" aria-current="page"`));
      expect(html).toMatch(new RegExp(`<a href="${pfx}/docs/automations" class="docs-nav-link is-trail"`));
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    });

    it('marks Secrets as the current page and Automations as the trail when it is open', async () => {
      const html = await sidebar(lang, `${pfx}/docs/secrets`);
      expect(html).toMatch(new RegExp(`<a href="${pfx}/docs/secrets" class="docs-nav-link is-active" aria-current="page"`));
      expect(html).toMatch(new RegExp(`<a href="${pfx}/docs/automations" class="docs-nav-link is-trail"`));
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    });

    it('does not mark the trail on unrelated pages', async () => {
      const html = await sidebar(lang, `${pfx}/docs/webhooks`);
      expect(html).not.toContain('is-trail');
    });
  });
}
