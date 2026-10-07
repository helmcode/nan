import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { REMOVED_DOCS } from '../../middleware';

/**
 * The Workspaces guide is the page the portal, the pricing section and the
 * terms point members at when Workspaces open to the whole community. These
 * tests pin the facts it must state and keep them in agreement with the other
 * surfaces that quote the same numbers (the pricing section and the terms).
 *
 * Sizes come from cloud-api's tier catalogue (internal/workspace/tiers.go),
 * backup prices from cmd/stripe-bootstrap/workspace_backups.go, slot prices
 * from the live EUR Stripe prices.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');

const pages = {
  en: { file: 'content/docs/workspaces.mdx', terms: 'pages/terms.astro', prefix: '' },
  es: { file: 'content/docs-es/workspaces.mdx', terms: 'pages/es/terms.astro', prefix: '/es' },
} as const;

/** The catalogue the guide and the pricing section must both publish. */
const CATALOGUE = [
  { size: 'micro', vcpu: 1, ram: 2, disk: 10, slot: '4,99€', backups: '0,99€' },
  { size: 'nano', vcpu: 2, ram: 4, disk: 20, slot: '8,99€', backups: '1,49€' },
  { size: 'basic', vcpu: 4, ram: 8, disk: 40, slot: '16,99€', backups: '2,49€' },
  { size: 'medium', vcpu: 8, ram: 16, disk: 80, slot: '32,99€', backups: '3,99€' },
  { size: 'large', vcpu: 8, ram: 32, disk: 160, slot: '60,99€', backups: '6,99€' },
];

/** The size rows of the guide's price table, as `size|vcpu|ram|disk|slot|backups`. */
function tableRows(body: string): string[] {
  return body
    .split('\n')
    .filter((l) => /^\|\s*(Micro|Nano|Basic|Medium|Large)\s*\|/.test(l))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim().replace(/\s*\/\s*(month|mes)$/, '').replace(/ GiB$/, ''))
        .join('|')
        .toLowerCase(),
    );
}

const expectedRows = CATALOGUE.map((t) => [t.size, t.vcpu, t.ram, t.disk, t.slot, t.backups].join('|'));

describe.each(Object.entries(pages))('workspaces guide (%s)', (locale, page) => {
  const raw = read(page.file);
  const fm = parseFrontmatter(raw).frontmatter as { order?: number; group?: string };
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '');
  const flat = body.replace(/\s+/g, ' ');

  test('exists and sits in the guides group, before examples and apps', () => {
    expect(fm.group).toBe(locale === 'en' ? 'Guides' : 'Guías');
    for (const sibling of ['examples.md', 'apps.md']) {
      const dir = page.file.replace('workspaces.mdx', '');
      const other = parseFrontmatter(read(dir + sibling)).frontmatter as { order: number };
      expect(fm.order!).toBeLessThan(other.order);
    }
  });

  test('publishes every size with its specs, slot price and backup price', () => {
    expect(tableRows(body)).toEqual(expectedRows);
  });

  test('the free workspace is the premium benefit, Micro sized', () => {
    expect(flat).toMatch(/\| (Premium), 200€ \| \*\*(One, included|Uno, incluido)\*\* \|/);
    expect(flat).toMatch(/\| (Inference|Inferencia), 70€ \| No \|/);
    expect(flat).toMatch(/\| (Community|Comunidad), 14,99€ \| No \|/);
    expect(flat).toContain(locale === 'en' ? '1 vCPU, 2 GiB RAM, 10 GiB disk' : '1 vCPU, 2 GiB de RAM, 10 GiB de disco');
  });

  test('says a slot does not include inference', () => {
    expect(flat).toContain(locale === 'en' ? 'It does not include inference' : 'No incluye inferencia');
  });

  test('documents how to connect: SSH command, SSH keys tab, web terminal', () => {
    expect(body).toContain('ssh <workspace-id>@ssh.nan.builders');
    expect(body).toContain('**SSH keys**');
    expect(body).toContain('**Console**');
    expect(flat).toContain('authorized_keys');
  });

  test('documents the Software panel and the agents', () => {
    expect(body).toContain('**Software**');
    for (const agent of ['Pi', 'Hermes', 'gentle-shell', 'Herdr']) expect(body).toContain(agent);
  });

  test('documents the network rules', () => {
    expect(flat).toMatch(/80 (and|y) 443/);
    expect(flat).toContain('SMTP');
    expect(flat).toMatch(/Tailscale, cloudflared (or|o) ngrok/);
  });

  test('documents backups: daily, 7 days, 3 restores per 24 hours, 14-day re-enable', () => {
    expect(flat).toMatch(/\*\*(once a day|una vez al día)\*\*/);
    expect(flat).toMatch(/\*\*7 (days|días)\*\*/);
    expect(flat).toMatch(/\*\*3 (times per workspace in any 24 hours|veces por workspace en cualquier periodo de 24 horas)\*\*/);
    expect(flat).toMatch(/\*\*14 (days|días)\*\*/);
  });

  test('documents the 7-day grace, the rescue session and permanent deletion', () => {
    expect(flat).toMatch(/\*\*(7-day grace period|periodo de gracia de 7 días)\*\*/);
    expect(flat).toMatch(/(rescue session|sesión de rescate)/);
    expect(flat).toMatch(/\*\*(deleted permanently|borran de forma permanente)\*\*/);
  });

  test('links to anchors that exist in the terms of the same locale', () => {
    const terms = read(page.terms);
    const anchors = [...body.matchAll(new RegExp(`\\(${page.prefix}/terms#([\\w-]+)\\)`, 'g'))].map((m) => m[1]);
    expect(anchors).toEqual(expect.arrayContaining(['workspace-backups', 'workspace-acceptable-use']));
    for (const a of anchors) expect(terms, a).toContain(`id="${a}"`);
  });

  test('links only to docs pages that exist in the same locale', () => {
    const dir = page.file.replace('workspaces.mdx', '');
    const slugs = [...body.matchAll(new RegExp(`\\(${page.prefix}/docs/([\\w-]+)\\)`, 'g'))].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      expect(existsSync(resolve(src, dir, `${slug}.md`)) || existsSync(resolve(src, dir, `${slug}.mdx`)), slug).toBe(true);
    }
  });

  test('no em-dashes in the copy', () => {
    expect(body).not.toContain('—');
  });

  test('the docs introduction links to it', () => {
    const intro = read(page.file.replace('workspaces.mdx', 'intro.md'));
    expect(intro).toContain(`(${page.prefix}/docs/workspaces)`);
  });
});

describe('the pricing section publishes the same workspace catalogue', () => {
  const pricing = read('components/nan/home/Pricing.astro');

  test('same sizes, specs and prices as the guide', () => {
    const rows = [
      ...pricing.matchAll(
        /\{ size: '(\w+)', vcpu: (\d+), ram: (\d+), disk: (\d+), slot: '([\d,]+€)', backups: '([\d,]+€)' \}/g,
      ),
    ].map((m) => m.slice(1).join('|'));
    expect(rows).toEqual(expectedRows);
  });

  test('links to the guide in both locales', () => {
    expect(pricing).toContain("lang === 'es' ? '/es/docs/workspaces' : '/docs/workspaces'");
  });
});

describe('retired v1 agents docs now point at the workspaces guide', () => {
  test('/docs/agents redirects to workspaces', () => {
    expect(REMOVED_DOCS.agents).toBe('workspaces');
  });

  test.each(Object.entries(REMOVED_DOCS))('redirect target of %s is a live page in both locales', (_slug, target) => {
    for (const dir of ['content/docs', 'content/docs-es']) {
      const live = ['md', 'mdx'].some((ext) => existsSync(resolve(src, dir, `${target}.${ext}`)));
      expect(live, `${dir}/${target}`).toBe(true);
    }
  });
});
