import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { mdxToText } from '../../lib/mdxToText';
import openapi from '../../data/openapi.json';

/**
 * The Secrets page: member secrets (generic and BYOK provider keys), managed
 * from the portal, the CLI and the API, and how automations use them.
 *
 * Owner's ask (2026-10-14): secrets get their own page, nested under
 * Automations in the sidebar, and the other guides keep short sections that
 * point at it.
 *
 * The facts pinned here come from:
 * - cloud-api origin/main 95414e4: internal/secrets/api.go (limits, codes,
 *   Hint, ValidateValue, ValidateProviderKey), internal/handlers/account_secrets.go
 *   (the /v1/secrets routes, secretWriteBurst/RatePerSec, MaxRequestBody),
 *   internal/runs/protocol/byok.go (providers, BaseURLProblem),
 *   internal/runs/protocol/v2.go (reserved env names, 16 KiB / 48 KiB),
 *   internal/nanrun/mask/mask.go (Marker "[masked]", MinSecretLen and
 *   MinPrefixLen 8).
 * - devops AGENT-AUTOMATIONS-PHASE2.md §3, AGENT-AUTOMATIONS-PHASE3-BYOK.md §2,
 *   AGENT-AUTOMATIONS-PHASE3-WRITE-API.md §2 and §4.
 * - cloud-ui origin/main fd930a3: components/SecretsSection.tsx,
 *   components/automations/SecretAssignments.tsx, lib/inference.ts,
 *   lib/updated-by.ts (the labels the portal shows).
 * - nan-cli origin/main 0.1.33: cmd/secrets.go (commands and flags).
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');

const pages = {
  en: { dir: 'content/docs/', prefix: '', group: 'Guides', title: 'Secrets' },
  es: { dir: 'content/docs-es/', prefix: '/es', group: 'Guías', title: 'Secretos' },
} as const;

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

const codeBlocks = (b: string) => [...b.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
/** Code blocks without their comments, which are translated. */
const codeNoComments = (b: string) => codeBlocks(b).map((c) => c.replace(/\s+#.*$/gm, ''));

const INTERNAL = /firecracker|micro-?vms?\b|\bvm\b|\bkvm\b|kubernetes|\bk8s\b|\br2\b|nan-vmd|systemd|litellm|cgroup|\bvault\b|transit|dynamicuser|ephemeral|ef[ií]mer|\/etc\/|hermes\/env|ramfs|LoadCredential/i;
/** Never published: UUIDs, private addresses, real-looking tokens, the owner's identity. */
const PRIVATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.|nan_whk_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9]|nan_pat_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9-]{12,}|@helmcode\.com|cristian|barckcode/i;

/** cloud-ui labels the page walks through (SecretsSection, SecretAssignments, inference.ts, updated-by.ts). */
const PORTAL_LABELS = [
  'Settings', 'Secrets', 'Tokens', 'Add secret', 'Name', 'Kind', 'Secret', 'Provider key', 'Provider', 'Base URL', 'Value',
  'Description', 'Save secret', 'Replace value', 'Delete', 'Anthropic', 'OpenAI', 'Google Gemini', 'OpenAI-compatible',
  'Provider key · Anthropic', 'Used by', 'Not used by any automation', 'Updated', 'Last used', 'never', 'Last changed from',
  'Browser', 'CLI', 'API token', 'Add a secret', 'Agent (read access)', 'Actions only (write access)', 'Inference',
  'My own key', 'Model', 'Browser session needed', 'Fresh clone per run',
];

/** secrets.ErrorCode (internal/secrets/api.go) plus the credential and rate-limit refusals of the handler. */
const ERROR_CODES = [
  '400 invalid_request', '404 not_found', '409 name_taken', '409 too_many_secrets', '409 secret_in_use',
  '409 secrets_too_large', '503 secrets_unavailable', '403 browser_session_required', '403 platform_access_required',
  '409 idempotency_key_reused', '429 rate_limited', '403 credential_not_allowed', '403 workspace_key_not_allowed',
  '403 token_scope_denied',
];

/** protocol.reservedEnv and reservedEnvPrefixes (internal/runs/protocol/v2.go). */
const RESERVED = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'HOME', 'USER', 'PATH', 'LANG', 'CREDENTIALS_DIRECTORY', 'NAN_', 'PI_', 'HERMES_'];

/** MountV1SecretsRoutes (internal/handlers/account_secrets.go): route and scope. */
const ROUTES: Array<[string, string, string]> = [
  ['GET', '/v1/secrets', 'secrets:read'],
  ['GET', '/v1/secrets/{id}', 'secrets:read'],
  ['POST', '/v1/secrets', 'secrets:write'],
  ['PUT', '/v1/secrets/{id}/value', 'secrets:write'],
  ['PATCH', '/v1/secrets/{id}', 'secrets:write'],
  ['DELETE', '/v1/secrets/{id}', 'secrets:write'],
];

describe.each(Object.entries(pages))('Secrets page (%s)', (_locale, page) => {
  const raw = read(page.dir + 'secrets.mdx');
  const fm = parseFrontmatter(raw).frontmatter as { title: string; order: number; group: string; parent?: string; description: string };
  const body = strip(raw);
  const flat = body.replace(/\s+/g, ' ');
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const order = (f: string) => (parseFrontmatter(read(page.dir + f)).frontmatter as { order: number }).order;

  test('is nested under Automations, after PR gatekeeper and before Notifications', () => {
    expect(fm.title).toBe(page.title);
    expect(fm.group).toBe(page.group);
    expect(fm.parent).toBe('automations');
    expect(fm.description.length).toBeGreaterThan(40);
    expect(fm.order).toBe(order('pr-gatekeeper.mdx') + 1);
    expect(order('notifications.mdx')).toBe(fm.order + 1);
    expect(order('contexts.mdx')).toBe(fm.order + 2);
    expect(order('webhooks.mdx')).toBe(fm.order + 3);
  });

  test('is served by /api/docs without errors', async () => {
    const text = await mdxToText(body);
    expect(text).toContain(page.title);
    expect(text).toContain('/v1/secrets');
  });

  test('every link to a docs page and anchor resolves, in the same locale', () => {
    const links = [...body.matchAll(/\]\(((?:\/es)?\/docs\/[\w-]+)?(#[^)\s]+)?\)/g)];
    expect(links.length).toBeGreaterThan(15);
    const tags = new Set((openapi.tags as Array<{ name: string }>).map((t) => `#tag/${t.name.toLowerCase()}`));
    for (const [, target, anchor] of links) {
      if (!target && !anchor) continue;
      if (target) expect(target.startsWith(`${page.prefix}/docs/`), `${target} in the wrong locale`).toBe(true);
      if (target?.endsWith('/api')) {
        expect(tags.has(anchor ?? ''), `${target}${anchor}`).toBe(true);
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

  test('write-only, stored encrypted, only a hint of the last characters', () => {
    expect(flat).toMatch(/\*\*(write-only|solo escritura)\*\*/);
    expect(flat).toMatch(/(encrypted with a key that belongs to your account alone|se cifra con una clave que pertenece solo a tu cuenta)/);
    // secrets.Hint: last 4 characters, value >= 20 bytes, [A-Za-z0-9_-]{4}; the API renders "…a1b2".
    expect(body).toContain('`…a1b2`');
    expect(flat).toMatch(/(at least 20 characters|al menos 20 caracteres)/);
    expect(flat).toMatch(/(not even a hash|ni siquiera un hash)/);
    // No outbound validation call (PHASE2 §3.4).
    expect(flat).toMatch(/(NaN never sends a secret anywhere to check it|NaN nunca envía un secreto a ningún sitio para comprobarlo)/);
  });

  test('the two kinds and the four providers, with the API values', () => {
    for (const v of ['`generic`', '`provider_key`', '`anthropic`', '`openai`', '`gemini`', '`openai_compatible`']) expect(body, v).toContain(v);
    // ValidateValue / ValidateProviderKey.
    expect(flat).toContain('16 KiB');
    expect(flat).toMatch(/8 (to|a) 4096/);
    expect(flat).toMatch(/(never trimmed|nunca se recorta)/);
    // The provider and the kind are fixed at create (CLI: "the kind is fixed when a secret is created").
    expect(flat).toMatch(/(fixed when you create it|se fija al crear)/);
  });

  test('base URL rules mirror protocol.BaseURLProblem, with the warning', () => {
    for (const fact of ['`https`', '512', '`localhost`', '`.local`', '`.internal`', '`.lan`', '`.home.arpa`', '`.svc`', '`nan.builders`', '`helmcode.com`', '`user:password@`', '`?...`', '`#...`']) {
      expect(flat, fact).toContain(fact);
    }
    expect(flat).toMatch(/(never connects to it|nunca se conecta a ella)/);
    expect(body).toMatch(/<Callout title="(Never put a token in the base URL|Nunca pongas un token en la URL base)" variant="warning">/);
  });

  test('the CLI: every command, values only from a file or a pipe', () => {
    for (const cmd of ['nan secrets ls', 'nan secrets show', 'nan secrets set', 'nan secrets edit', 'nan secrets rm']) expect(body, cmd).toContain(cmd);
    for (const flag of ['--value-file', '--value-stdin', '--kind', '--provider', '--base-url', '--description', '--json', '--yes', '--token-file']) {
      expect(body, flag).toContain(flag);
    }
    expect(body).toContain('**0.1.33**');
    // A value never goes on the command line: every `nan secrets set` reads it from a file or a pipe.
    const sets = [...body.matchAll(/nan secrets set [^\n`]*/g)].map((m) => m[0]);
    expect(sets.length).toBeGreaterThan(4);
    for (const s of sets) expect(s, s).toMatch(/--value-(file|stdin)|NAME --value-file/);
    expect(flat).toMatch(/(exit with code 64|salen con código 64)/);
    expect(flat).toMatch(/`--token-file`[^.]*`nan auth login`[^.]*`NAN_TOKEN`/);
  });

  test('the API: routes, scopes, credentials, idempotency, rate limit, never a value', () => {
    for (const [method, path, scope] of ROUTES) {
      expect(body, `${method} ${path}`).toMatch(new RegExp(`\\| \`${method} ${path.replace(/[{}]/g, '\\$&')}\` \\| \`${scope}\` \\|`));
    }
    // The documented routes exist in the API reference, with the same methods.
    const paths = (openapi as { paths: Record<string, Record<string, unknown>> }).paths;
    for (const [method, path] of ROUTES) {
      const p = path.replace(/^\/v1/, '');
      expect(paths[p]?.[method.toLowerCase()], `${method} ${p} in openapi.json`).toBeDefined();
    }
    for (const fact of ['`Idempotency-Key`', '`200`', '`201`', '`204`', '`404`', '32 KiB', '`updated_by`', '`browser_session`', '`cli_session`', '`platform_token`']) {
      expect(flat, fact).toContain(fact);
    }
    // secretWriteBurst = 30, secretWriteRatePerSec = 120/h, shared by every mount.
    expect(flat).toMatch(/30 [^.|]*120 (per hour|por hora)/);
    // The JSON example is the secretView: no value, no ciphertext.
    const json = codeBlocks(body).find((c) => c.startsWith('```json'))!;
    const obj = JSON.parse(json.replace(/^```json\n/, '').replace(/```$/, ''));
    expect(Object.keys(obj)).toEqual([
      'id', 'object', 'name', 'kind', 'provider', 'base_url', 'hint', 'value_bytes', 'description', 'used_by', 'updated_by',
      'created_at', 'updated_at', 'last_used_at',
    ]);
    expect(Object.keys((openapi as any).components.schemas.Secret.properties)).toEqual(expect.arrayContaining(Object.keys(obj)));
    expect(obj).not.toHaveProperty('value');
    // An API key never reads or writes secrets.
    expect(flat).toMatch(/(Never an API key|Nunca una API key) \(`sk-\.\.\.`\)/);
  });

  test('automations: assignment by name, env var, exposures, the GitHub token pattern and BYOK', () => {
    for (const r of RESERVED) expect(body, r).toContain(`\`${r}\``);
    expect(body).toContain('| **Agent (read access)** | `agent` |');
    expect(body).toContain('| **Actions only (write access)** | `actions` |');
    expect(flat).toMatch(/\*\*(The agent never sees an `actions` secret|El agente nunca ve un secreto `actions`)\.\*\*/);
    expect(body).toContain('{ secret: GITHUB_READ_TOKEN, env: GITHUB_TOKEN, exposure: agent }');
    expect(body).toContain('{ secret: GITHUB_WRITE_TOKEN, env: GITHUB_TOKEN, exposure: actions }');
    expect(body).toContain('| `GITHUB_READ_TOKEN` |');
    expect(body).toContain('| `GITHUB_WRITE_TOKEN` |');
    expect(flat).toMatch(/20 (secrets|secretos)/);
    expect(flat).toContain('48 KiB');
    expect(body).toContain('--byok-secret');
    expect(body).toContain(`${page.prefix}/docs/runs#`);
  });

  test('safety: masking as nan-run does it, the agent, write scopes, rotation, replace and delete', () => {
    expect(body).toContain('`[masked]`');
    expect(body).not.toContain('`***`');
    // mask.MinSecretLen / MinPrefixLen = 8; encodings; prefix fragments.
    expect(flat).toMatch(/(shorter than 8 characters|de menos de 8 caracteres)/);
    expect(flat).toMatch(/(base64, URL-encoded and JSON-escaped|base64, codificado para URL y escapado para JSON)/);
    // protocol.MaskProposal: exact fields (branch, labels) are never rewritten, the proposal is refused.
    const masked = body.split('\n').find((l) => l.includes('`[masked]`') === false && /^- (In the run|En los eventos)/.test(l))!;
    expect(masked).toBeDefined();
    expect(masked).not.toMatch(/labels|branch|etiquetas|rama/);
    expect(flat).toMatch(/(fragment of 8 characters or more|fragmento de 8 caracteres o más)/);
    expect(flat).toContain('`proposal_invalid`');
    // What an agent-exposed secret means, and who is responsible.
    expect(flat).toMatch(/(is your responsibility|es responsabilidad tuya)/);
    expect(flat).toMatch(/prompt injection/);
    // Write scopes are as good as reading every secret; never log in inside a workspace.
    expect(flat).toContain('`secrets:write`');
    expect(flat).toContain('`automations:write`');
    expect(flat).toMatch(/`nan auth login`[^.]*(never inside a workspace|nunca dentro de un workspace)/);
    // Rotation: replace keeps the name and assignments; NaN cannot revoke at the source.
    expect(flat).toMatch(/(NaN cannot revoke a token for you|NaN no puede revocar un token por ti)/);
    // Replace: next run, queued included; running runs keep theirs. Delete: 409 while assigned.
    expect(flat).toMatch(/(including runs already queued|incluidos los que ya están en cola)/);
    expect(flat).toMatch(/(Runs already working keep the value|Los runs que ya están trabajando conservan el valor)/);
    expect(flat).toContain('`409 secret_in_use`');
    expect(flat).toContain('`409 secrets_too_large`');
    expect(flat).toContain('`secret_missing`');
  });

  test('limits: the constants of cloud-api', () => {
    const limits = body.slice(body.search(/^## (Limits|Límites)$/m), body.search(/^## (If something goes wrong|Si algo sale mal)$/m));
    const row = (en: string, es: string, value: RegExp) =>
      expect(limits, en).toMatch(new RegExp(`^\\| (${en}|${es}) \\| ${value.source}`, 'm'));
    row('Secrets', 'Secretos', /100 /);
    row('Name', 'Nombre', /(Up to|Hasta) 64 /);
    row('Value of a \\*\\*Secret\\*\\*', 'Valor de un \\*\\*Secret\\*\\*', /(Up to|Hasta) 16 KiB/);
    row('Value of a \\*\\*Provider key\\*\\*', 'Valor de una \\*\\*Provider key\\*\\*', /(8 to|De 8 a) 4096 /);
    row('Description', 'Descripción', /(Up to|Hasta) 256 /);
    row('Base URL', 'URL base', /(Up to|Hasta) 512 /);
    row('Secrets per automation', 'Secretos por automatización', /20 \|/);
    row('Everything one run receives', 'Todo lo que recibe un run', /48 KiB/);
    row('Changes to secrets', 'Cambios en secretos', /(A burst of|Una ráfaga de) 30[^|]*120 (per hour|por hora)/);
    row('API request body', 'Cuerpo de una petición a la API', /32 KiB/);
  });

  test('troubleshooting lists every error a member can see', () => {
    const table = body.slice(body.search(/^## (If something goes wrong|Si algo sale mal)$/m));
    for (const code of ERROR_CODES) expect(table, code).toContain(`\`${code}\``);
    for (const code of ['`secrets_unavailable`', '`secret_missing`', '`config_error`']) expect(table, code).toContain(code);
    // Exit code 64 is the CLI's generic usage code (nan-cli exitUsage): the row says how to tell the write API case apart.
    expect(table).toMatch(/^\| (The CLI exits with code 64 and tells you to use the portal|La CLI sale con código 64 y te dice que uses el portal) \|/m);
  });

  test('no em-dashes, no internals, nothing private, never the portal route', () => {
    expect(raw).not.toContain('—');
    expect(prose).not.toMatch(INTERNAL);
    expect(body).not.toMatch(INTERNAL);
    expect(body).not.toMatch(PRIVATE);
    expect(body).not.toContain('/api/account/secrets');
  });
});

describe('Secrets page, both locales', () => {
  const [en, es] = [pages.en, pages.es].map((p) => strip(read(p.dir + 'secrets.mdx')));

  test('the Spanish page is a translation with the same structure', () => {
    expect(headingShape(es)).toEqual(headingShape(en));
    expect(es).not.toEqual(en);
    const outside = (b: string) => b.replace(/```[\s\S]*?```/g, '');
    const count = (b: string, re: RegExp) => (outside(b).match(re) ?? []).length;
    for (const re of [/<Callout /g, /^\|/gm, /^- /gm, /^\d+\. /gm, /```/g]) expect(count(es, re), String(re)).toBe(count(en, re));
  });

  test('the code blocks are the same, comments aside', () => {
    expect(codeNoComments(es)).toEqual(codeNoComments(en));
  });
});

describe.each(Object.entries(pages))('the other guides point at the Secrets page (%s)', (_locale, page) => {
  const link = `${page.prefix}/docs/secrets`;

  test.each(['automations.mdx', 'runs.mdx', 'nan-cli.mdx', 'webhooks.mdx', 'pr-gatekeeper.mdx', 'intro.md'])('%s links it', (file) => {
    expect(read(page.dir + file)).toContain(`](${link}`);
  });

  test('every link into the Secrets page, from any guide, lands on a heading that exists', () => {
    const ids = headingIds(strip(read(page.dir + 'secrets.mdx')));
    let n = 0;
    for (const f of readdirSync(resolve(src, page.dir))) {
      for (const m of read(page.dir + f).matchAll(new RegExp(`\\]\\(${link.replace(/\//g, '\\/')}#([^)\\s]+)\\)`, 'g'))) {
        n++;
        expect(ids.has(decodeURIComponent(m[1])), `${f}: #${m[1]}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(5);
  });

  test('runs: BYOK keeps a short version of the base URL rules and links the full list', () => {
    const runs = strip(read(page.dir + 'runs.mdx'));
    expect(runs).toContain(`${link}#${page.prefix ? 'reglas-de-la-url-base' : 'base-url-rules'}`);
    // The rules list and its callout moved to the Secrets page.
    expect(runs).not.toContain('`.home.arpa`');
  });

  test('automations keeps the short version of secrets and links each moved part', () => {
    const auto = strip(read(page.dir + 'automations.mdx'));
    const section = auto.slice(auto.search(/^## (Secrets|Secretos)$/m), auto.search(/^### (Assign secrets to an automation|Asigna secretos a una automatización)$/m));
    expect(section.length).toBeGreaterThan(200);
    expect(section.length).toBeLessThan(1600);
    expect(section).toContain(`${link})`);
    const cli = auto.slice(auto.search(/^### (Secrets from the CLI|Secretos desde la CLI)$/m), auto.search(/^### (Automations from the CLI|Automatizaciones desde la CLI)$/m));
    expect(cli).toContain(`${link}#`);
    expect(cli).not.toMatch(/^- /m);
  });

  test('webhooks: the signing secret is not one of your Secrets', () => {
    const hooks = read(page.dir + 'webhooks.mdx').replace(/\s+/g, ' ');
    expect(hooks).toMatch(/(The signing secret belongs to the trigger, not to your|El signing secret pertenece al trigger, no a tus) \[/);
  });
});

describe('the API reference sends readers to the Secrets page', () => {
  test('the Secrets tag and the Secret schema link /docs/secrets', () => {
    const tag = (openapi.tags as Array<{ name: string; description: string }>).find((t) => t.name === 'Secrets')!;
    expect(tag.description).toContain('https://nan.builders/docs/secrets)');
    expect(JSON.stringify(openapi)).not.toContain('docs/automations#secrets');
  });
});
