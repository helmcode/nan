import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { mdxToText } from '../../lib/mdxToText';

/**
 * The PR gatekeeper guide: a step-by-step walkthrough, with portal captures,
 * of the automation we run on our own repositories (template Pull request
 * review, fresh clone per run, one comment per pull request, cancel the
 * previous run, fully automatic).
 *
 * The labels pinned here are the ones the portal shows (cloud-ui automation
 * editor, triggers panel, run page) as captured on 2026-10-12. The captures
 * were taken from the owner's account, so the tests also guard what must never
 * be published from it: ids, webhook URLs, tokens, addresses, the email.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const pub = resolve(src, '../public');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');

const pages = {
  en: { dir: 'content/docs/', prefix: '', group: 'Guides', guideLink: '(/docs/pr-gatekeeper)' },
  es: { dir: 'content/docs-es/', prefix: '/es', group: 'Guías', guideLink: '(/es/docs/pr-gatekeeper)' },
} as const;

/** The portal captures, in the order the guide shows them. */
const SHOTS = [
  'pg-01-templates',
  'pg-02-agent',
  'pg-03-repository',
  'pg-04-secrets',
  'pg-05-approval',
  'pg-06-limits',
  'pg-07-automations',
  'pg-08-webhook-filter',
  'pg-09-trigger',
  'pg-10-runs',
  'pg-11-run-summary',
  'pg-12-run-output',
  'pg-13-run-proposal',
  'pg-14-apply-run',
  'pg-15-superseded',
  'pg-16-deliveries',
];

/** Labels of the portal the guide walks through (cloud-ui, as captured). */
const PORTAL_LABELS = [
  'New automation', 'Pull request review', 'Create automation', 'Name', 'Instructions', 'Workspace', 'Agent',
  'Time limit (minutes)', 'GitHub repository (optional)', 'Checkout', 'Fresh clone per run',
  'Run pull requests from forks and outside contributors', 'Keep one comment per pull request',
  'Add a secret', 'Actions only (write access)', 'Agent (read access)', 'Fully automatic', 'Custom',
  'Comment on pull requests', 'Needs approval', 'When a run is active', 'Cancel the previous run',
  'Skip the new event', 'Runs per hour', 'Triggers', '+ Webhook', 'GitHub', 'Add webhook', "I've saved them",
  'Rotate', 'Deliveries', 'Ignored by a filter', 'Skipped: a run for the same subject is active', 'Runs',
  'Automatic', 'apply step', 'PR comment', 'One comment, updated each run', 'Output', 'Proposed actions',
  'Applying the actions', 'View on GitHub', 'Succeeded', 'Superseded by run', 'Payload URL', 'Content type',
  'Secret', 'Which events', 'Let me select individual events', 'Pull requests', 'Contents', 'Add secret',
];

const INTERNAL = /firecracker|micro-?vms?\b|\bvm\b|\bkvm\b|kubernetes|\bk8s\b|\br2\b|nan-vmd|systemd|litellm|cgroup|\bvault\b|transit|dynamicuser|ephemeral|ef[ií]mer/i;
/**
 * Never published: UUIDs, private addresses, webhook paths, tokens, the owner's identity.
 * This guards the TEXT only (prose, alt, captions): the pixels of a capture cannot be
 * scanned here, so every new or replaced capture needs a human check for the same things
 * (the delivery ids, run ids in paths, webhook URL and secret hints are redacted).
 */
const PRIVATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.|nan_whk_[A-Za-z0-9_-]{4,}|whsec_[A-Za-z0-9]{4,}|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9]|nan_pat_[A-Za-z0-9]|sk-[A-Za-z0-9]{8,}|@helmcode\.com|cristian|barckcode/i;

interface Shot {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

function screenshots(body: string): Shot[] {
  return [...body.matchAll(/<Screenshot\s([^>]*?)\/>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    const num = (name: string) => Number(new RegExp(`${name}=\\{(\\d+)\\}`).exec(m[1])?.[1]);
    return { src: attr('src'), alt: attr('alt'), caption: attr('caption'), width: num('width'), height: num('height') };
  });
}

/** Pixel size of a WebP (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
}

/** Heading ids as the site renders them (github-slugger), skipping code fences. */
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

/** The headings outside code fences, as `#`-level markers. */
function headingShape(body: string): string {
  let inFence = false;
  const out: string[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && /^(#{1,6})\s/.exec(line);
    if (m) out.push(m[1]);
  }
  return out.join(' ');
}

const codeBlocks = (b: string) => [...b.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);

describe.each(Object.entries(pages))('PR gatekeeper guide (%s)', (_locale, page) => {
  const raw = read(page.dir + 'pr-gatekeeper.mdx');
  const fm = parseFrontmatter(raw).frontmatter as { title: string; order: number; group: string };
  const body = strip(raw);
  const flat = body.replace(/\s+/g, ' ');
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const shots = screenshots(body);
  const blocks = codeBlocks(body);
  const instructions = blocks.find((b) => b.startsWith('```text')) ?? '';

  /**
   * Owner's call (2026-10-12): the guide lives UNDER Automations in the
   * sidebar, as its sub-item, not as a sibling. Its order is the slot right
   * after Automations so the flat order (the /api/docs manifest) and the
   * sidebar's visual order agree; Webhooks comes next.
   */
  test('is nested under Automations, right after it and before Webhooks', () => {
    expect(fm.title).toBe('PR gatekeeper');
    expect(fm.group).toBe(page.group);
    expect((fm as { parent?: string }).parent).toBe('automations');
    const order = (f: string) => (parseFrontmatter(read(page.dir + f)).frontmatter as { order: number }).order;
    expect(fm.order).toBe(order('automations.mdx') + 1);
    // Secrets, Notifications and Contexts are the next sub-items of Automations, then Webhooks.
    expect(order('secrets.mdx')).toBe(fm.order + 1);
    expect(order('notifications.mdx')).toBe(fm.order + 2);
    expect(order('contexts.mdx')).toBe(fm.order + 3);
    expect(order('webhooks.mdx')).toBe(fm.order + 4);
    expect(order('examples.md')).toBe(order('webhooks.mdx') + 1);
    expect(order('apps.md')).toBe(order('examples.md') + 1);
  });

  test('is served by /api/docs without errors', async () => {
    const text = await mdxToText(body);
    expect(text).toContain('PR gatekeeper');
    expect(text).toContain('/docs/pr-gatekeeper/pg-01-templates.webp');
  });

  test('shows every capture, in order, with alt text and a caption', () => {
    expect(shots.map((s) => s.src)).toEqual(SHOTS.map((n) => `/docs/pr-gatekeeper/${n}.webp`));
    for (const s of shots) {
      expect(s.alt.length, s.src).toBeGreaterThan(30);
      expect(s.caption.length, s.src).toBeGreaterThan(5);
      expect(`${s.src} ${s.alt} ${s.caption}`, s.src).not.toMatch(PRIVATE);
      expect(`${s.alt} ${s.caption}`, s.src).not.toMatch(INTERNAL);
    }
  });

  test.each(SHOTS)('capture %s: file exists and its size matches the markup', (name) => {
    const shot = shots.find((s) => s.src === `/docs/pr-gatekeeper/${name}.webp`);
    expect(shot, `${name} is not in the markup`).toBeDefined();
    const file = resolve(pub, `docs/pr-gatekeeper/${name}.webp`);
    expect(existsSync(file)).toBe(true);
    expect(webpSize(file)).toEqual({ width: shot!.width, height: shot!.height });
  });

  test('every link to a docs page and anchor resolves, in the same locale', () => {
    const links = [...body.matchAll(/\]\(((?:\/es)?\/docs\/[\w-]+)?(#[^)\s]+)?\)/g)];
    expect(links.length).toBeGreaterThan(15);
    for (const [, target, anchor] of links) {
      if (!target && !anchor) continue;
      if (target) expect(target.startsWith(`${page.prefix}/docs/`), `${target} in the wrong locale`).toBe(true);
      if (target?.endsWith('/api')) {
        expect(anchor).toBe('#tag/automations');
        continue;
      }
      if (target) {
        const name = target.split('/').pop()!;
        const file = readdirSync(resolve(src, page.dir)).find((f) => f.replace(/\.mdx?$/, '') === name);
        expect(file, `${target} has no page`).toBeDefined();
        if (anchor) expect(headingIds(strip(read(page.dir + file!))).has(decodeURIComponent(anchor.slice(1))), `${target}${anchor}`).toBe(true);
      } else {
        expect(headingIds(body).has(decodeURIComponent(anchor.slice(1))), anchor).toBe(true);
      }
    }
  });

  test('walks through the labels the portal shows', () => {
    for (const label of PORTAL_LABELS) expect(body, label).toContain(`**${label}**`);
  });

  test('recommends the gatekeeper settings: fresh clone, one comment, cancel, fully automatic, forks off', () => {
    expect(flat).toMatch(/\*\*Checkout\*\*: \*\*Fresh clone per run\*\*/);
    expect(flat).toMatch(/\*\*When a run is active\*\*: \*\*Cancel the previous run\*\*/);
    expect(flat).toMatch(/\*\*Keep one comment per pull request\*\*: (on|activado)/);
    expect(flat).toMatch(/\*\*Run pull requests from forks and outside contributors\*\*: (leave it off|déjalo desactivado)/);
    expect(flat).toMatch(/(Choose|Elige) \*\*Fully automatic\*\*/);
    // The template's own default is skip; the guide says to change it.
    expect(flat).toMatch(/(The template comes with|La plantilla viene con) \*\*Skip the new event\*\*/);
  });

  test('keeps the write token away from the agent', () => {
    expect(body).toContain('| `GITHUB_WRITE_TOKEN` |');
    expect(body).toContain('| `GITHUB_READ_TOKEN` |');
    expect(flat).toMatch(/`GITHUB_WRITE_TOKEN`[^.]*\*\*Actions only \(write access\)\*\*/);
    expect(flat).toMatch(/`GITHUB_READ_TOKEN` (as|como) `GITHUB_TOKEN`, (with|con) \*\*Agent \(read access\)\*\*/);
    expect(flat).toMatch(/\*\*Pull requests\*\* (read and write|de lectura y escritura)/);
    expect(body).toMatch(/<Callout title="(Why two tokens|Por qué dos tokens)" variant="warning">/);
  });

  test('the webhook: the template filter and the GitHub side', () => {
    for (const a of ['`synchronize`', '`ready_for_review`', '`ping`', '`application/json`']) expect(body, a).toContain(a);
    expect(body).toContain(`${page.prefix}/docs/webhooks#`);
    // Neither a real webhook URL nor its signing secret is ever shown.
    expect(body).not.toMatch(/api\.nan\.builders\/hooks\//);
  });

  test('the instructions: the five checks, NaN does the checkout, exactly one comment, untrusted event', () => {
    expect(instructions.length).toBeGreaterThan(1500);
    for (const check of ['Tests exist for the claimed scope', 'Tests pass', 'Security', 'Improvements', 'VERSION', 'ONE comment', 'untrusted data']) {
      expect(instructions, check).toContain(check);
    }
    expect(instructions).toMatch(/current\s+folder/);
    expect(instructions).toContain('"body_artifact":"artifacts/comment.md"');
    expect(instructions).toContain('"kind":"github_pr_comment"');
    expect(instructions).toContain('$NAN_RUN_ARTIFACTS/actions.json');
    expect(instructions).not.toMatch(/git clone|rm -rf|git checkout|\.local\/go|DATABASE_URL/);
    // A fenced code block must not close early on a nested fence.
    expect(instructions.match(/```/g)?.length).toBe(2);
  });

  test('the example comments: a red verdict with what is missing, then a green one', () => {
    const md = blocks.filter((b) => b.startsWith('```markdown'));
    expect(md).toHaveLength(2);
    expect(md[0]).toContain('**PR gatekeeper: ❌ changes needed**');
    expect(md[0]).toContain('## What is missing');
    expect(md[1]).toContain('**PR gatekeeper: ✅ meets the minimum bar**');
    for (const b of md) {
      expect(b).toMatch(/Reviewed commit: `[0-9a-f]{12}`/);
      // Only the harmless test package of the example, nothing else from a private repository.
      for (const path of b.matchAll(/`((?:internal|cmd|src)\/[^`:]+)/g)) expect(path[1]).toMatch(/^internal\/gktest(\/| )/);
    }
  });

  test('troubleshooting covers the delivery reasons and the invalid proposal', () => {
    for (const code of ['`event_filter`', '`actor_filter`', '`untrusted_head`', '`proposal_invalid`', '`action_failed`', '`artifacts/', '`401`']) {
      expect(prose, code).toContain(code);
    }
    expect(prose).toContain('nan automations deliveries');
  });

  test('says what it costs and links the limits', () => {
    expect(body).toContain(`${page.prefix}/docs/automations#`);
    expect(flat).toMatch(/430K/);
    expect(flat).toMatch(/(8 to 20 minutes|de 8 a 20 minutos)/);
  });

  test('no em-dashes, no internals, nothing private', () => {
    expect(body).not.toContain('—');
    expect(prose).not.toMatch(INTERNAL);
    expect(body).not.toMatch(PRIVATE);
  });
});

describe('PR gatekeeper guide, both locales', () => {
  const [en, es] = [pages.en, pages.es].map((p) => strip(read(p.dir + 'pr-gatekeeper.mdx')));

  test('the Spanish page is a translation with the same structure', () => {
    expect(headingShape(es)).toEqual(headingShape(en));
    expect(es).not.toEqual(en);
    const count = (b: string, re: RegExp) => (b.match(re) ?? []).length;
    for (const re of [/<Details /g, /<Callout /g, /^\|/gm, /^- /gm, /^\d+\. /gm]) {
      const outside = (b: string) => b.replace(/```[\s\S]*?```/g, '');
      expect(count(outside(es), re), String(re)).toBe(count(outside(en), re));
    }
  });

  test('the code blocks (example comments and instructions) are identical', () => {
    expect(codeBlocks(es)).toEqual(codeBlocks(en));
  });

  test('both show the same captures at the same size', () => {
    const dims = (b: string) => screenshots(b).map((s) => [s.src, s.width, s.height]);
    expect(dims(es)).toEqual(dims(en));
  });
});

describe('PR gatekeeper captures on disk', () => {
  const dir = resolve(pub, 'docs/pr-gatekeeper');

  test('the folder holds exactly the captures the guide uses', () => {
    expect(readdirSync(dir).sort()).toEqual(SHOTS.map((n) => `${n}.webp`).sort());
  });

  test.each(SHOTS)('%s stays small (under 300 KB)', (name) => {
    expect(statSync(resolve(dir, `${name}.webp`)).size).toBeLessThan(300 * 1024);
  });
});

describe.each(Object.entries(pages))('the other guides point at the PR gatekeeper guide (%s)', (_locale, page) => {
  test('the automations recipe links it and stays the short version', () => {
    const auto = strip(read(page.dir + 'automations.mdx'));
    const recipe = auto.slice(auto.search(/^## (Recipe|Receta): PR gatekeeper$/m), auto.search(/^## (FAQ|Preguntas frecuentes)$/m));
    expect(recipe).toContain(page.guideLink);
    // The link sits before the steps, where a reader looking for the full walkthrough starts.
    expect(recipe.indexOf(page.guideLink)).toBeLessThan(recipe.indexOf('<Steps>'));
    expect(recipe).not.toContain('<Screenshot');
  });

  test('the introduction lists it among the guides', () => {
    const intro = read(page.dir + 'intro.md');
    expect(intro).toContain(page.guideLink);
    expect(intro.indexOf(page.guideLink)).toBeGreaterThan(intro.indexOf(`(${page.prefix}/docs/webhooks)`));
  });
});
