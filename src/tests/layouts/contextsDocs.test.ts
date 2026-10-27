import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { mdxToText } from '../../lib/mdxToText';
import openapi from '../../data/openapi.json';

/**
 * The Contexts page: agent contexts (instructions, skills and reference
 * files), managed from the portal, the CLI and the API, and used by runs and
 * automations.
 *
 * The facts pinned here come from the code, not the design, where they differ:
 * - devops AGENT-CONTEXT.md (§0 to §7, "As built" notes; §7 lists this page).
 * - cloud-api origin/main 715580da: internal/contexts/{types,quota,manifest,
 *   upload,service,errors,scan}.go (limits, formats, quota per plan, error
 *   codes and messages, secret patterns), internal/runs/protocol/ctxpath
 *   (file-name rules), internal/handlers/contexts*.go (routes, credentials),
 *   internal/runs/validate.go (repo or context, at most 5),
 *   internal/automations/validate.go (checkout "none"),
 *   internal/nanrun/{context,prompt}.go and nanrun/adapter/context.go (how Pi
 *   and Hermes see a context: preamble, --append-system-prompt, --skill,
 *   prompt preface, $NAN_CONTEXT_DIR / $NAN_CONTEXT_FILES).
 * - cloud-ui origin/main 4f99a94: pages/Context*Page.tsx,
 *   components/contexts/*, lib/contexts.ts (CONTEXTS_DOCS_URL, labels,
 *   copy), lib/automations.ts (CHECKOUT_NONE_LABEL), Layout nav "Context".
 * - nan-cli origin/main 9ee99eb cmd/context.go (nan context) and
 *   feat/ephemeral-e2-cli 0a1f967 (nan run --context, nan automations
 *   --context / --checkout none).
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');

const pages = {
  en: { dir: 'content/docs/', prefix: '', group: 'Guides', title: 'Contexts' },
  es: { dir: 'content/docs-es/', prefix: '/es', group: 'Guías', title: 'Contextos' },
} as const;

/**
 * Pages this guide links to that live in an open PR (website #198, ephemeral
 * runs). Allowed here only; drop the entry once it merges.
 */
const PENDING_PAGES = new Set(['ephemeral-runs']);

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

const bashBlocks = (b: string) =>
  [...b.matchAll(/```bash\n[\s\S]*?```/g)].map((m) => m[0].replace(/\s+#.*$/gm, '').replace(/^# .*\n/gm, ''));

const INTERNAL = /firecracker|micro-?vms?\b|\bvm\b|\bkvm\b|kubernetes|\bk8s\b|\br2\b|cloudflare|nan-vmd|nan-run|systemd|litellm|cgroup|\bvault\b|durable object|postgres|bucket/i;
/** Never published: UUIDs, private addresses, real-looking tokens, the owner's identity. */
const PRIVATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9]|nan_pat_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9-]{12,}|@helmcode\.com|cristian|barckcode/i;

/** cloud-ui labels the page walks through (ContextsPage, ContextDetailPage, dialogs, ContextPicker, AutomationEditor). */
const PORTAL_LABELS = [
  'Context', 'New context', 'Name', 'Description', 'Save', 'Upload skill folder', 'Upload files', 'Upload folder', 'Publish',
  'Delete', 'Save anyway', 'Contexts (optional)', 'Add', 'New run', 'Ephemeral container', 'GitHub repository (optional)',
  'No repository', 'Checkout',
];

/** contexts.Code values plus the run admission codes (internal/contexts/errors.go, internal/runs/contexts.go). */
const ERROR_CODES = [
  '404 context_not_found', '409 context_name_taken', '409 too_many_contexts', '409 context_in_use', '409 version_conflict',
  '409 blob_busy', '409 upload_in_progress', '400 invalid_path', '415 unsupported_file_type', '422 skill_invalid',
  '422 context_skill_conflict', '413 context_too_large', '413 context_quota_exceeded', '503 storage_unavailable',
  '409 blob_missing', '422 context_secret_detected', '429 rate_limited', '403 credential_not_allowed',
];

describe.each(Object.entries(pages))('Contexts page (%s)', (_locale, page) => {
  const raw = read(page.dir + 'contexts.mdx');
  const fm = parseFrontmatter(raw).frontmatter as { title: string; order: number; group: string; parent?: string; description: string };
  const body = strip(raw);
  const flat = body.replace(/\s+/g, ' ');
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const order = (f: string) => (parseFrontmatter(read(page.dir + f)).frontmatter as { order: number }).order;

  test('is nested under Automations, after Notifications and before Webhooks', () => {
    expect(fm.title).toBe(page.title);
    expect(fm.group).toBe(page.group);
    expect(fm.parent).toBe('automations');
    expect(fm.description.length).toBeGreaterThan(40);
    expect(fm.order).toBe(order('notifications.mdx') + 1);
    expect(order('webhooks.mdx')).toBe(fm.order + 1);
  });

  test('is the page the portal and the CLI link to (CONTEXTS_DOCS_URL, contextsDocs)', () => {
    // cloud-ui lib/contexts.ts and nan-cli cmd/context.go: https://nan.builders/docs/contexts, no anchor.
    expect(existsSync(resolve(src, page.dir + 'contexts.mdx'))).toBe(true);
  });

  test('is served by /api/docs without errors', async () => {
    const text = await mdxToText(body);
    expect(text).toContain(page.title);
    expect(text).toContain('/v1/contexts');
  });

  test('every link to a docs page and anchor resolves, in the same locale (pending pages excepted)', () => {
    const links = [...body.matchAll(/\]\(((?:\/es)?\/docs\/[\w-]+)?(#[^)\s]+)?\)/g)];
    expect(links.length).toBeGreaterThan(8);
    const tags = new Set((openapi as { tags: Array<{ name: string }> }).tags.map((t) => `#tag/${t.name.toLowerCase()}`));
    for (const [, target, anchor] of links) {
      if (!target && !anchor) continue;
      if (target) {
        expect(target.startsWith(`${page.prefix}/docs/`), target).toBe(true);
        const name = target.slice(`${page.prefix}/docs/`.length);
        if (name === 'api') {
          expect(tags.has(anchor ?? ''), `${target}${anchor}`).toBe(true);
          continue;
        }
        if (PENDING_PAGES.has(name)) continue;
        const file = readdirSync(resolve(src, page.dir)).find((f) => f.replace(/\.mdx?$/, '') === name);
        expect(file, `${target} has no page`).toBeDefined();
        if (anchor) expect(headingIds(strip(read(page.dir + file!))).has(decodeURIComponent(anchor.slice(1))), `${target}${anchor}`).toBe(true);
      } else {
        expect(headingIds(body).has(decodeURIComponent(anchor.slice(1))), anchor).toBe(true);
      }
    }
    // The repo-less runs point at the ephemeral runs guide (website #198).
    expect(body).toContain(`](${page.prefix}/docs/ephemeral-runs)`);
  });

  test('walks through the labels the portal shows', () => {
    for (const label of PORTAL_LABELS) expect(body, label).toContain(`**${label}**`);
    // lib/contexts.ts CONFLICT_COPY, contexts adapter errContextLoad.
    expect(body).toContain('"Changed elsewhere. Reload."');
    expect(body).toContain('"the context could not be loaded"');
  });

  test('the layout: AGENTS.md, skills/<name>/SKILL.md with name and description, files/, mcp/ reserved', () => {
    for (const fact of ['`AGENTS.md`', '`skills/<', '`SKILL.md`', '`files/', '`mcp/`', '`name`', '`description`']) expect(flat, fact).toContain(fact);
    // The example skill has the strict frontmatter: exactly name and description, name = folder.
    const md = [...body.matchAll(/```markdown\n---\n([\s\S]*?)\n---/g)].map((m) => m[1]);
    expect(md).toHaveLength(1);
    expect(md[0].split('\n').map((l) => l.split(':')[0])).toEqual(['name', 'description']);
    expect(md[0]).toContain('name: release-notes');
    expect(body).toContain('skills/release-notes/SKILL.md');
  });

  test('how each agent sees it: Pi before the repo AGENTS.md, skills index, Hermes preface, read-only files', () => {
    for (const agent of ['**Pi**', '**Pi + Gentle Shell**', '**Hermes**']) expect(body, agent).toContain(`| ${agent} |`);
    expect(flat).toMatch(/\*\*(before|antes)\*\* (the repository's|del) `AGENTS.md`/);
    expect(flat).toMatch(/(skills index|índice de skills)/);
    for (const v of ['$NAN_CONTEXT_DIR', '$NAN_CONTEXT_FILES', '## Context: <']) expect(body, v).toContain(v);
    expect(flat).toMatch(/(read-only|solo lectura)/);
    expect(flat).toMatch(/(never into the repository|nunca dentro del repositorio)/);
  });

  test('versions: every save, runs pin at queue time, automations follow the latest', () => {
    expect(flat).toMatch(/(Every save is a new version|Cada guardado es una versión nueva)/);
    expect(flat).toMatch(/(A run pins its versions when it is queued|Un run fija sus versiones cuando entra en cola)/);
    expect(flat).toMatch(/(An automation follows the latest version|Una automatización sigue la última versión)/);
    expect(body).toContain('`contexts: [{id, name, version, tree_sha256}]`');
  });

  test('runs without a repository: repo or context, checkout none', () => {
    for (const v of ['`"executor": "ephemeral"`', '`checkout: none`', '`github_repo`', '--context', '--checkout none']) expect(flat, v).toContain(v);
    expect(body).not.toMatch(/nan run --ephemeral [^\n`]*--repo[^\n`]*--context/);
  });

  test('storage per plan and every limit from the code', () => {
    // contexts.Quota* (quota.go).
    for (const row of ['| Premium | 5 GiB |', '| Inference | 2 GiB |', '| Community | 500 MiB |']) expect(body, row).toContain(row);
    expect(body).toMatch(/\| (No membership|Sin membresía) \| 100 MiB \|/);
    // types.go, manifest.go, upload.go, ctxpath.
    for (const [en, es] of [
      ['| Contexts | 20 per member |', '| Contextos | 20 por miembro |'],
      ['| Contexts per run or automation | 5 |', '| Contextos por run o automatización | 5 |'],
      ['| File size | 100 MiB |', '| Tamaño de un archivo | 100 MiB |'],
      ['| `AGENTS.md` | 32 KiB |', '| `AGENTS.md` | 32 KiB |'],
      ['| `SKILL.md` | 64 KiB |', '| `SKILL.md` | 64 KiB |'],
      ['| Files per context | 1000 |', '| Archivos por contexto | 1000 |'],
      ['| Skills per context | 30 |', '| Skills por contexto | 30 |'],
      ['| Size of one version | 250 MiB |', '| Tamaño de una versión | 250 MiB |'],
      ['| Everything one run loads | 250 MiB, 5000 files and 64 KiB of instructions |', '| Todo lo que carga un run | 250 MiB, 5000 archivos y 64 KiB de instrucciones |'],
      ['| Uploads | 2 GiB per hour, 8 open at once |', '| Subidas | 2 GiB por hora, 8 abiertas a la vez |'],
      ['| Publish attempts | 120 per hour |', '| Intentos de publicación | 120 por hora |'],
      ['| Downloads | 1000 per hour |', '| Descargas | 1000 por hora |'],
    ]) {
      expect(body, en).toContain(page.prefix ? es : en);
    }
    expect(flat).toContain('`Retry-After`');
    expect(flat).toContain('16 MiB');
  });

  test('allowed types and file names mirror types.go and ctxpath', () => {
    for (const ext of ['.md', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.docx', '.xlsx', '.pptx', 'Dockerfile', 'Makefile']) {
      expect(flat, ext).toContain(ext);
    }
    for (const reserved of ['`CON`', '`PRN`', '`AUX`', '`NUL`', '`COM1`', '`LPT1`']) expect(flat, reserved).toContain(reserved);
    expect(flat).toContain('`. _ - ( ) + , @`');
    expect(flat).toContain('NFC');
    expect(flat).toMatch(/512 bytes[^.]*128 bytes[^.]*8/);
    expect(flat).toContain('`unsupported_file_type`');
  });

  test('the secret-like rule: Save anyway, --allow-secrets, allow_secret_like, and the commit warning', () => {
    expect(body).toContain('**Save anyway**');
    expect(body).toContain('`--allow-secrets`');
    expect(body).toContain('`"allow_secret_like": true`');
    expect(body).toContain(`](${page.prefix}/docs/secrets)`);
    expect(body).toMatch(/<Callout title="(An agent may copy a context file into a commit|Un agente puede copiar un archivo del contexto en un commit)" variant="warning">/);
    // Binary files are never scanned (§1.5).
    expect(flat).toMatch(/(are not checked|no se revisan)/);
  });

  test('deleting is refused while an automation uses it', () => {
    expect(flat).toContain('`409 context_in_use`');
    expect(flat).toContain('`DELETE /v1/contexts/{id}`');
    expect(flat).toContain('`nan context rm`');
  });

  test('the CLI: every command and the flags that change what push does', () => {
    for (const cmd of ['nan context create', 'nan context push', 'nan context pull', 'nan context ls', 'nan context show', 'nan context edit', 'nan context rm', 'nan run --context', 'nan automations create']) {
      expect(body, cmd).toContain(cmd);
    }
    for (const flag of ['--dry-run', '--skip-invalid', '--allow-secrets', '--create', '--from', '--force', '--yes']) expect(body, flag).toContain(flag);
    // nan-cli has no `pull --version` (the design had one).
    expect(body).not.toMatch(/nan context pull[^\n]*--version/);
    expect(flat).toMatch(/0 [^,]*, 1 [^,]*, 64 [^,]*, 65 .*?, 69 /);
  });

  test('the API: routes in the reference, credentials, uploads, publish and runs', () => {
    const paths = (openapi as { paths: Record<string, Record<string, unknown>> }).paths;
    const used = [...body.matchAll(/`(GET|POST|PATCH|PUT|DELETE) (\/v1\/[^`?\s]+)/g)];
    expect(used.length).toBeGreaterThan(3);
    for (const [, method, path] of used) {
      const p = path.replace(/^\/v1/, '').replace('{id_or_name}', '{id}');
      expect(paths[p]?.[method.toLowerCase()], `${method} ${path}`).toBeDefined();
    }
    for (const fact of ['/v1/contexts/blobs/check', '/uploads', '/parts/', '/complete', '/versions', '"base_version"', '"contexts"', '`contexts:read`', '`contexts:write`', '`Idempotency-Key`', 'X-Nan-Filename']) {
      expect(flat, fact).toContain(fact);
    }
    expect(flat).toContain('`403 credential_not_allowed`');
  });

  test('every error code it names is a real one', () => {
    for (const code of ERROR_CODES) expect(flat, code).toContain(code.split(' ')[1]);
  });

  test('the bash examples are the same in both languages (comments aside)', () => {
    const other = page.prefix ? pages.en : pages.es;
    expect(bashBlocks(body)).toEqual(bashBlocks(strip(read(other.dir + 'contexts.mdx'))));
  });

  test('the Spanish page has the same structure', () => {
    expect(headingShape(body)).toBe(headingShape(strip(read(pages.en.dir + 'contexts.mdx'))));
  });

  test('keeps infrastructure words and private data out, and no em-dashes', () => {
    expect(prose).not.toMatch(INTERNAL);
    expect(body).not.toMatch(PRIVATE);
    expect(raw).not.toContain('—');
  });
});

describe.each(Object.entries(pages))('the other guides point at Contexts (%s)', (_locale, page) => {
  const link = `${page.prefix}/docs/contexts`;

  test.each(['runs.mdx', 'automations.mdx', 'nan-cli.mdx', 'secrets.mdx'])('%s links it', (file) => {
    expect(read(page.dir + file)).toContain(`](${link}`);
  });

  test('every link into the Contexts page, from any guide, lands on a heading that exists', () => {
    const ids = headingIds(strip(read(page.dir + 'contexts.mdx')));
    let n = 0;
    for (const f of readdirSync(resolve(src, page.dir))) {
      for (const m of read(page.dir + f).matchAll(new RegExp(`\\]\\(${link.replace(/\//g, '\\/')}#([^)\\s]+)\\)`, 'g'))) {
        n++;
        expect(ids.has(decodeURIComponent(m[1])), `${f}: #${m[1]}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(5);
  });

  test('runs: the portal field, the CLI flag and the API field', () => {
    const runs = read(page.dir + 'runs.mdx');
    expect(runs).toContain('| **Contexts (optional)** |');
    expect(runs).toContain('| `--context NAME` |');
    expect(runs).toContain('"contexts": ["acme-api", "style-guide"]');
  });

  test('automations: the editor field, the API field, checkout none, without naming the executor', () => {
    const auto = read(page.dir + 'automations.mdx');
    expect(auto).toContain('| **Contexts (optional)** |');
    expect(auto).toContain('`checkout: none`');
    expect(auto).toContain('**No repository**');
    expect(auto).toContain('`409 context_in_use`');
    expect(auto).toContain('--checkout none');
  });

  test('nan-cli: nan context and --context', () => {
    const cli = read(page.dir + 'nan-cli.mdx');
    for (const cmd of ['nan context push', 'nan context pull', 'nan run --context', '--context acme-api']) expect(cli, cmd).toContain(cmd);
  });

  test('secrets: credentials go in Secrets, not in a context', () => {
    expect(read(page.dir + 'secrets.mdx')).toContain(`](${link}#`);
  });
});
