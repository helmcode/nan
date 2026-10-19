import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { mdxToText } from '../../lib/mdxToText';

/**
 * The Ephemeral runs page (ephemeral executors, E2 docs).
 *
 * The facts pinned here come from:
 * - devops AGENT-EPHEMERAL-EXECUTORS.md §5.5 and §6 (owner decisions
 *   2026-10-19: prices, free S-minutes per plan, the S-minute explanation
 *   that must be shown wherever usage is, no EU-only claim).
 * - cloud-api origin/main: internal/runs/ephemeral.go (cap and concurrency
 *   defaults and bounds, reservation = timeout + 150 s, per started minute,
 *   UTC calendar month), internal/runs/validate.go (model and github_repo
 *   required, workspace/cwd/git_isolation refused, ad-hoc runs never get
 *   secrets), internal/runs/api.go (402 ephemeral_cap_reached,
 *   403 token_scope_denied), internal/pat/scopes.go (runs:ephemeral),
 *   cloudflare/ephemeral-runner/README.md (egress rules and byte caps).
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');

const pages = {
  en: { dir: 'content/docs/', prefix: '', group: 'Guides', title: 'Ephemeral runs' },
  es: { dir: 'content/docs-es/', prefix: '/es', group: 'Guías', title: 'Ejecuciones efímeras' },
} as const;

/** Heading ids as the site renders them (github-slugger, as in runsDocs.test.ts). */
const slug = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/ /g, '-');

function headingIds(body: string): Set<string> {
  const ids = new Set<string>();
  let inFence = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && /^#{1,6}\s+(.*)$/.exec(line);
    if (m) ids.add(slug(m[1].replace(/`/g, '')));
  }
  return ids;
}

/** No vendor or infrastructure names in member copy, and no EU-only claim. */
const INTERNAL = /cloudflare|durable object|worker|firecracker|micro-?vms?\b|\bvm\b|kubernetes|\bk8s\b|litellm|nan-vmd|systemd|\bvault\b|analytics engine/i;
const EU_CLAIM = /\bEU\b|europe|europa|\bUE\b/i;

describe.each(Object.entries(pages))('ephemeral runs guide (%s)', (_locale, page) => {
  const raw = read(page.dir + 'ephemeral-runs.mdx');
  const fm = parseFrontmatter(raw).frontmatter as { title?: string; group?: string; parent?: string; order?: number };
  const body = strip(raw);
  const flat = body.replace(/\s+/g, ' ');

  test('is nested under Agent runs, in the guides group', () => {
    expect(fm.title).toBe(page.title);
    expect(fm.group).toBe(page.group);
    expect(fm.parent).toBe('runs');
  });

  test('publishes the confirmed sizes and prices, per started minute', () => {
    for (const row of [/\| \*\*S\*\* \| 1 \| 4 GiB \| 10 GB \| (€0\.003|0,003 €) \|/, /\| \*\*M\*\* \| 2 \| 8 GiB \| 16 GB \| (€0\.006|0,006 €) \|/, /\| \*\*L\*\* \| 4 \| 12 GiB \| 20 GB \| (€0\.012|0,012 €) \|/])
      expect(body).toMatch(row);
    expect(flat).toMatch(/per started minute|por minuto empezado/);
    expect(flat).toMatch(/14 (seconds|segundos) (counts as|cuenta como) 1/);
  });

  test('free minutes per plan, explained as S-minutes with the worked example', () => {
    expect(body).toMatch(/\| Community \| 100 \|/);
    expect(body).toMatch(/\| Inference \| 300 \|/);
    expect(body).toMatch(/\| Premium \| 1000 \|/);
    expect(flat).toMatch(/Free minutes are S-minutes|Los minutos gratis son minutos S/);
    expect(flat).toMatch(/\| \*\*M\*\* \| 2 /);
    expect(flat).toMatch(/\| \*\*L\*\* \| 4 /);
    expect(flat).toMatch(/100 (free minutes are|minutos gratis son) 100 (minutes of|minutos de) \*\*S\*\*, (or|o) 50 (of|de) \*\*M\*\*, (or|o) 25 (of|de) \*\*L\*\*/);
    // 100 M (200) + 30 L (120) = 320 S-minutes; 20 over at the S price.
    expect(flat).toMatch(/20 × (€0\.003|0,003 €) = \*\*(€0\.06|0,06 €)\*\*/);
  });

  test('says billing is not active yet', () => {
    expect(body).toMatch(/<Callout title="(Billing is not active yet|El cobro aún no está activo)">/);
  });

  test('documents the member limits with their defaults and ranges', () => {
    expect(body).toMatch(/\| (€100|100 €) \| (€0 to €1000|De 0 € a 1000 €) \|/);
    expect(body).toMatch(/\| 50 \| (1 to 50|De 1 a 50) \|/);
    expect(body).toContain('`402 ephemeral_cap_reached`');
    expect(flat).toContain('Settings → Ephemeral runs');
    // Reservation: ceil((1800 + 150) / 60) = 33 minutes of S.
    expect(flat).toMatch(/33 (minutes|minutos), (€0\.099|0,099 €)/);
  });

  // E3 (cloud-api #379): only chargeable money counts against the cap, so a
  // EUR 0 cap still admits runs the free S-minutes fully cover.
  test('spend cap counts only chargeable money; a EUR 0 cap allows fully free runs', () => {
    expect(flat).toMatch(/only money that would be charged counts|solo cuenta el dinero que se cobraría/);
    expect(flat).toMatch(/never below zero|nunca por debajo de cero/);
    expect(flat).toMatch(/A cap of €0 allows only the runs your free minutes fully cover|Un límite de 0 € solo permite los runs que tus minutos gratis cubren por completo/);
    expect(flat).not.toMatch(/stops every ephemeral run|frena todas las ejecuciones/);
  });

  test('uses the exact portal labels (cloud-ui EPHEMERAL_LABEL, EphemeralSection, counters)', () => {
    expect(body).toContain('**Where it runs** ');
    expect(body).toContain('**Ephemeral container**');
    expect(body).not.toMatch(/\*\*Ephemeral\*\*/);
    for (const label of ['Monthly spend cap (€)', 'Concurrent ephemeral runs', 'Add a payment method', 'Switch billing to EUR', 'Elapsed', 'Started minutes', 'Minutes billed', 'S-minutes', 'Estimated cost', 'Free S-minutes left', 'Chargeable so far'])
      expect(body, label).toContain(`**${label}**`);
  });

  // cloud-ui #177 (1b964d0): labels that change with billing on/off, and the
  // cost note converting free S-minutes to the chosen size.
  test('describes the labels in both billing states and the per-size free minutes note', () => {
    expect(body).toContain('`measured per container minute (not charged yet)`');
    expect(body).toContain('`billed per container minute`');
    expect(body).toContain('`80 free S-minutes left this month = 40 minutes of M.`');
    expect(body).not.toContain('Settings → Billing');
  });

  test('owner decisions: payment method always, membership-only free minutes, EUR only, no workspace needed', () => {
    expect(body).toContain('`402 payment_method_required`');
    expect(body).toContain('`402 currency_migration_required`');
    expect(body).toMatch(/\| (No membership|Sin membresía) \| 0 \|/);
    expect(flat).toMatch(/billed in euros only|se facturan solo en euros/);
    expect(flat).toMatch(/without any workspace, your automations can only be ephemeral|sin ningún workspace, tus automatizaciones solo pueden ser efímeras/);
  });

  test('network: HTTP and HTTPS only, no SSH or SMTP, the byte caps', () => {
    expect(flat).toMatch(/HTTP (and|y) HTTPS/);
    expect(flat).toContain('SSH');
    expect(flat).toContain('SMTP');
    expect(flat).toMatch(/2 GiB/);
    expect(flat).toMatch(/512 MiB/);
    expect(body).toContain('`egress_limit`');
  });

  test('the CLI, the API and the token scope', () => {
    expect(body).toContain('nan run --ephemeral --repo acme/api --model');
    expect(body).toContain('--size s');
    expect(body).toContain('"executor": "ephemeral"');
    expect(body).toContain('"github_repo": "acme/api"');
    expect(body).not.toMatch(/"workspace":/);
    expect(body).toContain('`runs:ephemeral`');
    expect(body).toContain('`403 token_scope_denied`');
  });

  test('automations: executor, size, fresh checkout, and private repositories need a GITHUB_TOKEN', () => {
    expect(body).toContain('executor: ephemeral');
    expect(body).toContain('checkout: fresh');
    expect(flat).toMatch(/`GITHUB_TOKEN` (with|con) \*\*Agent \(read access\)\*\*/);
    expect(flat).toMatch(/never receives secrets|nunca recibe secretos/);
  });

  test('the API example is valid JSON', () => {
    const json = /-d '(\{[\s\S]*?\})'/.exec(body)![1];
    const req = JSON.parse(json);
    expect(req).toMatchObject({ executor: 'ephemeral', size: 's', github_repo: 'acme/api' });
    expect(req.model).toBeTruthy();
  });

  test('no vendor names, no EU-only claim, no em-dashes', () => {
    expect(body).not.toMatch(INTERNAL);
    expect(body).not.toMatch(EU_CLAIM);
    expect(body).not.toContain('—');
  });

  test('in-page anchors point at headings that exist', () => {
    const ids = headingIds(body);
    const anchors = [...body.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(ids.has(a), a).toBe(true);
  });

  test('links to other docs pages land on pages and headings that exist, in the same locale', () => {
    const links = [...body.matchAll(/\]\((\/[^)\s]+)\)/g)].map((m) => m[1]).filter((l) => l.includes('/docs/'));
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) {
      const m = new RegExp(`^${page.prefix}/docs/([\\w-]+)(?:#(.+))?$`).exec(l);
      expect(m, `${l} in the wrong locale`).not.toBeNull();
      const [, target, anchor] = m!;
      const file = [`${target}.mdx`, `${target}.md`].map((f) => resolve(src, page.dir, f)).find((f) => existsSync(f));
      expect(file, l).toBeDefined();
      if (anchor) expect(headingIds(strip(readFileSync(file!, 'utf-8'))).has(anchor), l).toBe(true);
    }
  });

  test('Agent runs and Automations link to it', () => {
    expect(read(page.dir + 'runs.mdx')).toContain(`(${page.prefix}/docs/ephemeral-runs)`);
    expect(read(page.dir + 'automations.mdx')).toMatch(new RegExp(`\\(${page.prefix}/docs/ephemeral-runs#`));
  });

  test('is served by /api/docs without errors', async () => {
    const text = await mdxToText(body);
    expect(text).toContain(page.title);
  });
});

describe('ephemeral runs guide, both locales', () => {
  test('the Spanish page is a translation with the same structure', () => {
    const [en, es] = [pages.en, pages.es].map((p) => strip(read(p.dir + 'ephemeral-runs.mdx')));
    const shape = (b: string) => (b.match(/^#{1,3} /gm) ?? []).join('');
    expect(shape(es)).toEqual(shape(en));
    expect(es).not.toEqual(en);
    const count = (b: string, re: RegExp) => (b.match(re) ?? []).length;
    for (const re of [/```bash/g, /```yaml/g, /<Details /g, /<Callout /g, /^\|/gm]) expect(count(es, re), String(re)).toBe(count(en, re));
  });
});
