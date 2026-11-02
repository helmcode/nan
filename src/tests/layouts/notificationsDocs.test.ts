import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mdxToText } from '../../lib/mdxToText';
import openapi from '../../data/openapi.json';

/**
 * The Notifications page: notification channels (Slack, Teams, Discord,
 * HTTPS) for automation events, managed from the portal, the CLI and the API.
 *
 * Owner's ask (2026-10-14): its own page, nested under Automations right
 * after Secrets, linked from Automations, Secrets and the NaN CLI.
 *
 * The facts pinned here come from:
 * - devops AGENT-AUTOMATIONS-PHASE3-NOTIFICATIONS.md §2, §4, §5, §6, §7, §8.
 * - cloud-api 0.8.263 (approval call to action, PR feat/notif-approval-cta): handlers/notification_channels.go
 *   (routes, notifWriteBurst/RatePerSec, views), notifications/service.go
 *   (codes, limits), notifications/payload.go (titles), signing.go
 *   (nan_nsec_, v1= HMAC of "<ts>.<body>", 24 h grace) and the golden files in
 *   internal/notifications/testdata, copied to src/tests/fixtures/notifications.
 * - nan-cli 0.1.34: cmd notifications (commands and flags).
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const strip = (raw: string) => raw.replace(/^---[\s\S]*?\n---\n/, '');
const golden = (name: string) => JSON.parse(read(`tests/fixtures/notifications/${name}.json`));

const pages = {
  en: { dir: 'content/docs/', prefix: '', group: 'Guides', title: 'Notifications' },
  es: { dir: 'content/docs-es/', prefix: '/es', group: 'Guías', title: 'Notificaciones' },
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
/** Code blocks without their comments (`#` and `//`), which are translated. */
const codeNoComments = (b: string) => codeBlocks(b).map((c) => c.replace(/\s+(#|\/\/) .*$/gm, ''));
const jsonBlocks = (b: string) => [...b.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));

const INTERNAL = /firecracker|micro-?vms?\b|\bvm\b|\bkvm\b|kubernetes|\bk8s\b|\br2\b|nan-vmd|systemd|litellm|cgroup|\bvault\b|transit|outbox|singleton|replica|dynamicuser|\/etc\/|netguard|traefik/i;
/** Never published: UUIDs, private addresses, real-looking tokens or webhook URLs, the owner's identity. */
const PRIVATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.|nan_nsec_[A-Za-z0-9_-]{8,}|nan_pat_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9-]{12,}|hooks\.slack\.com\/services\/T[A-Z0-9]{4,}|discord\.com\/api\/webhooks\/\d{5,}|@helmcode\.com|cristian|barckcode/i;

const EVENTS = ['approval.pending', 'run.failed', 'automation.disabled', 'trigger.failing', 'run.finished'];
const DEFAULT_EVENTS = EVENTS.slice(0, 4);

/** notifications.APICode plus the credential and gate refusals of the handler. */
const ERROR_CODES = [
  '400 invalid_request', '400 invalid_url', '403 credential_not_allowed', '403 token_scope_denied', '403 workspace_key_not_allowed',
  '403 browser_session_required', '404 not_found', '404 automation_not_found', '409 name_taken',
  '409 too_many_channels', '409 channel_disabled', '409 signing_not_supported', '429 rate_limited',
  '503 notifications_unavailable',
];

/** MountV1NotificationChannelsRoutes and the route -> scope table (middleware/pat_scopes.go). */
const ROUTES: Array<[string, string, string]> = [
  ['GET', '/v1/notification-channels', 'notifications:read'],
  ['GET', '/v1/notification-channels/{id}', 'notifications:read'],
  ['GET', '/v1/notification-channels/{id}/deliveries?limit=', 'notifications:read'],
  ['POST', '/v1/notification-channels', 'notifications:write'],
  ['PATCH', '/v1/notification-channels/{id}', 'notifications:write'],
  ['DELETE', '/v1/notification-channels/{id}', 'notifications:write'],
  ['PUT', '/v1/notification-channels/{id}/subscriptions', 'notifications:write'],
  ['POST', '/v1/notification-channels/{id}/test', 'notifications:write'],
  ['POST', '/v1/notification-channels/{id}/rotate-signing-secret', 'notifications:write'],
];

/** The provider host allowlists of §8.2. */
const PROVIDER_HOSTS = ['hooks.slack.com', 'webhook.office.com', 'logic.azure.com', 'powerplatform.com', 'discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'];

/** cloud-ui labels the page walks through (Settings > Notifications, the add dialog, the automation card). */
const PORTAL_LABELS = [
  'Settings', 'Notifications', 'Secrets', 'Add channel', 'Where', 'Slack', 'Microsoft Teams', 'Discord', 'HTTPS endpoint',
  'Name', 'Slack URL', 'Events', 'Approval needed', 'Run failed', 'Automation turned off', 'Webhook signatures failing',
  'Run succeeded', 'Automations', 'All automations, including new ones', 'Test', 'Edit', 'New URL (optional)',
  'Rotate secret', 'Turn off', 'Turn on', 'Delete', 'Deliveries', 'On', 'Deliveries failing', 'Off',
  'Turned off: failing', 'Turned off: URL refused', 'Manage notifications',
];

/** cloud-api notifications/payload.go actionLabel: the call to action of each event. */
const CTA_LABELS = ['Review and approve', 'View run', 'Open automation', 'View triggers'];

/** nan-cli 0.1.34 `nan notifications` subcommands and the flags the page names. */
const CLI_COMMANDS = ['ls', 'show', 'add', 'edit', 'rm', 'test', 'rotate', 'deliveries', 'subscriptions'];
const CLI_FLAGS = ['--kind', '--url-file', '--url-stdin', '--event', '--no-events', '--automation', '--name', '--enable', '--disable', '--limit', '--set', '--add', '--remove', '--clear', '--yes', '--json'];

describe.each(Object.entries(pages))('Notifications page (%s)', (_locale, page) => {
  const raw = read(page.dir + 'notifications.mdx');
  const fm = parseFrontmatter(raw).frontmatter as { title: string; order: number; group: string; parent?: string; description: string };
  const body = strip(raw);
  const flat = body.replace(/\s+/g, ' ');
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const order = (f: string) => (parseFrontmatter(read(page.dir + f)).frontmatter as { order: number }).order;
  const code = codeBlocks(body).join('\n');

  test('is nested under Automations, after Secrets and before Contexts and Webhooks', () => {
    expect(fm.title).toBe(page.title);
    expect(fm.group).toBe(page.group);
    expect(fm.parent).toBe('automations');
    expect(fm.description.length).toBeGreaterThan(40);
    expect(fm.order).toBe(order('secrets.mdx') + 1);
    expect(order('contexts.mdx')).toBe(fm.order + 1);
    expect(order('webhooks.mdx')).toBe(fm.order + 2);
  });

  test('is served by /api/docs without errors', async () => {
    const text = await mdxToText(body);
    expect(text).toContain(page.title);
    expect(text).toContain('/v1/notification-channels');
  });

  test('every link to a docs page and anchor resolves, in the same locale', () => {
    const links = [...body.matchAll(/\]\(((?:\/es)?\/docs\/[\w-]+)?(#[^)\s]+)?\)/g)];
    expect(links.length).toBeGreaterThan(10);
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

  test('the four kinds and where to get each provider URL', () => {
    for (const kind of ['`slack`', '`teams`', '`discord`', '`https`']) expect(body).toContain(kind);
    expect(body).toContain('https://api.slack.com/apps');
    expect(body).toContain('**Incoming Webhooks**');
    expect(body).toContain('**Workflows**');
    expect(body).toContain('**Post to a channel when a webhook request is received**');
    expect(body).toContain('**Manage Webhooks**');
    expect(body).toContain('**Copy Webhook URL**');
    const teams = golden('teams_run_failed').attachments[0].content;
    expect(teams.actions[0].title).toBe('View run');
    expect(golden('discord_run_failed').allowed_mentions).toEqual({ parse: [] });
  });

  // Owner decision 2026-10-14: approval.pending carries a prominent
  // "Review and approve" call to action (approvals stay in the browser), and
  // the other events a "View run" / "Open automation" / "View triggers" link.
  test('the approval call to action and the link of every event, as the providers render them', () => {
    for (const label of CTA_LABELS) expect(body, label).toContain(`**${label}**`);
    const slack = golden('slack_approval_pending').blocks.find((b: { type: string }) => b.type === 'actions').elements[0];
    expect(slack.text.text).toBe('Review and approve');
    expect(slack.style).toBe('primary');
    const teams = golden('teams_approval_pending').attachments[0].content.actions[0];
    expect(teams.title).toBe('Review and approve');
    expect(teams.type).toBe('Action.OpenUrl');
    const discord = golden('discord_approval_pending').embeds[0];
    expect(discord.url).toMatch(/\?approval=1$/);
    expect(discord.fields.map((f: { name: string }) => f.name)).toEqual(expect.arrayContaining(['Automation', 'Workspace', 'Expires', 'Needs approval', 'Next step']));
    expect(slack.url).toBe(golden('https_approval_pending').approve_url);
    expect(body).toContain('`?approval=1`');
    // Digests and test messages keep the generic label.
    expect(body).toContain('**Open in NaN**');
    expect(flat).toMatch(/never approve from Slack, Teams or Discord|Nunca se aprueba desde Slack, Teams o Discord/);
    expect(flat).toMatch(/up to 5 actions|hasta 5 acciones/);
    expect(flat).toMatch(/no longer pending|ya no está pendiente/);
  });

  test('events: the five, four on by default, run.finished opt-in, only automation runs, never cancelled', () => {
    const table = body.slice(body.search(/^## (Events|Eventos)$/m));
    for (const e of EVENTS) expect(table).toMatch(new RegExp(`^\\| \`${e.replace('.', '\\.')}\` \\|`, 'm'));
    for (const e of DEFAULT_EVENTS) expect(table).toMatch(new RegExp(`^\\| \`${e.replace('.', '\\.')}\` \\|.*\\| (Yes|Sí) \\|$`, 'm'));
    expect(table).toMatch(/^\| `run\.finished` \|.*\| No: (opt in|actívalo tú) \|$/m);
    expect(table).toContain('`timed_out`');
    expect(flat).toMatch(/Only automation runs notify|Solo notifican los runs de automatizaciones/);
    expect(flat).toMatch(/cancelled run never notifies|run cancelado nunca notifica/);
    expect(flat).toMatch(/up to 50 of these subscriptions|hasta 50 de estas suscripciones/);
  });

  test('digests, rate limits, retries and auto-disable mirror §7', () => {
    expect(flat).toMatch(/more than 3 notifications|más de 3 notificaciones/);
    expect(flat).toMatch(/up to 10 of them|hasta 10 de ellas/);
    expect(flat).toMatch(/30 messages a minute and 1,000 a day|30 mensajes por minuto y 1\.000 al día/);
    expect(flat).toMatch(/3,000 messages a day|3\.000 mensajes al día/);
    expect(flat).toMatch(/1 minute, 5 minutes, 30 minutes and 2 hours|1 minuto, 5 minutos, 30 minutos y 2 horas/);
    expect(flat).toMatch(/\*\*20 (failed attempts in a row|intentos fallidos seguidos)\*\*/);
    for (const reason of ['`failing`', '`invalid_url`', '`member`']) expect(body).toContain(reason);
    expect(flat).toMatch(/24 hours|24 horas/);
  });

  test('signature: the inbound scheme, the four headers, any v1= within 5 minutes', () => {
    for (const h of ['X-Nan-Event', 'X-Nan-Delivery', 'X-Nan-Timestamp', 'X-Nan-Signature']) expect(body).toContain(`\`${h}\``);
    expect(body).toContain(`${page.prefix}/docs/webhooks#`);
    expect(body).toContain('`<timestamp>.<body>`');
    expect(body).toContain('nan_nsec_');
    expect(flat).toMatch(/\*\*(any|cualquier)\*\* (`v1=` value|valor `v1=`)/);
    expect(flat).toMatch(/5 minutes|5 minutos/);
    expect(code).toContain('openssl dgst -sha256 -hmac');
    expect(code).toContain('hmac.compare_digest');
    expect(code).toContain('timingSafeEqual');
    expect(code).toMatch(/> 300/);
  });

  test('the published test vector is the one signing_test.go pins', () => {
    // cloud-api internal/notifications/signing_test.go: secret "nan_nsec_test", timestamp 1700000000, body {"a":1}.
    const hex = createHmac('sha256', 'nan_nsec_test').update('1700000000.{"a":1}').digest('hex');
    expect(hex).toBe('5c39c853e058b14c0d0e29bbdeb6d0dc325318231d07d1df377a284c89ad4e01');
    expect(body).toContain(`\`v1=${hex}\``);
    expect(body).toContain('`nan_nsec_test`');
    expect(body).toContain('`1700000000`');
  });

  test('the Node example verifies: any v1= matches, wrong or stale signatures and junk timestamps fail', () => {
    const js = codeBlocks(body).find((c) => c.startsWith('```js'))!;
    const fn = js.slice(js.indexOf('function verify'), js.indexOf('createServer((req'));
    const secret = 'nan_nsec_example';
    const verify = new Function('createHmac', 'timingSafeEqual', 'secret', `${fn}; return verify;`)(createHmac, timingSafeEqual, secret);
    const raw = Buffer.from(JSON.stringify(golden('https_test')));
    const now = String(Math.floor(Date.now() / 1000));
    const sig = (key: string, ts: string) => 'v1=' + createHmac('sha256', key).update(`${ts}.`).update(raw).digest('hex');
    expect(verify(raw, now, sig(secret, now))).toBe(true);
    expect(verify(raw, now, `${sig('nan_nsec_new', now)},${sig(secret, now)}`)).toBe(true);
    expect(verify(raw, now, sig('nan_nsec_other', now))).toBe(false);
    const old = String(Number(now) - 301);
    expect(verify(raw, old, sig(secret, old))).toBe(false);
    expect(verify(raw, undefined, sig(secret, now))).toBe(false);
    expect(verify(raw, 'soon', sig(secret, now))).toBe(false);
    expect(verify(Buffer.concat([raw, Buffer.from(' ')]), now, sig(secret, now))).toBe(false);
  });

  test('the Python example verifies the same way', () => {
    const py = codeBlocks(body).find((c) => c.startsWith('```python'))!.replace(/^```python\n|```$/g, '');
    const now = Math.floor(Date.now() / 1000);
    const raw = '{"a":1}';
    const good = createHmac('sha256', 'nan_nsec_...').update(`${now}.${raw}`).digest('hex');
    const script = `${py}
b = b'{"a":1}'
print(verify(b, "${now}", "v1=${good}"), verify(b, "${now}", "v1=00,v1=${good}"), verify(b, "${now}", "v1=${'0'.repeat(64)}"), verify(b, "${now - 301}", "v1=${good}"), verify(b, None, "v1=${good}"))`;
    const out = execFileSync('python3', ['-c', script], { encoding: 'utf-8' }).trim();
    expect(out).toBe('True True False False False');
  });

  test('payload: the documented bodies match the golden files', () => {
    const blocks = jsonBlocks(body);
    const byEvent = (e: string) => blocks.find((b) => b.version === 1 && b.event === e);
    const keys = (o: object) => Object.keys(o).sort();

    const failed = byEvent('run.failed');
    expect(keys(failed)).toEqual(keys(golden('https_run_failed')));
    expect(keys(failed.run)).toEqual(keys(golden('https_run_failed').run));
    expect(failed.text).toBe(golden('https_run_failed').text);

    const digest = byEvent('digest');
    expect(keys(digest)).toEqual(keys(golden('https_digest')));
    expect(keys(digest.items[0])).toEqual(keys(golden('https_digest').items[0]));
    expect(digest.text).toBe(golden('https_digest').text);
    expect(digest.url).toBe(golden('https_digest').url);

    const approval = byEvent('approval.pending');
    const g = golden('https_approval_pending');
    expect(keys(approval)).toEqual(keys(g));
    expect(keys(approval.approval)).toEqual(keys(g.approval));
    expect(keys(approval.approval.actions[0])).toEqual(keys(g.approval.actions[0]));
    expect(keys(approval.workspace)).toEqual(keys(g.workspace));
    expect(approval.text).toBe(g.text);
    expect(approval.approval.actions.map((a: { text: string }) => a.text)).toEqual(g.approval.actions.map((a: { text: string }) => a.text));
    expect(approval.actions_url).toMatch(/\/runs\/…\?approval=1$/);
    for (const f of ['actions_url', 'approve_url', 'workspace', 'approval', 'approval.state', 'approval.expires_at', 'approval.approval_kinds', 'approval.actions', 'approval.actions_total']) {
      expect(body, f).toContain(`| \`${f}\` |`);
    }

    const t = byEvent('test');
    expect(keys(t)).toEqual(keys(golden('https_test')));
    expect(t.text).toBe(golden('https_test').text);
    expect(t.url).toBe(golden('https_test').url);

    for (const title of [golden('https_approval_pending').text, golden('https_run_timed_out').text, golden('https_automation_disabled').text]) {
      expect(body, title).toContain(`\`${title}\``);
    }
    expect(body).toContain('`User-Agent: NaN-Notifications/1`');
    for (const r of ['member', 'workspace_deleted', 'secret_deleted', 'bad_signature']) expect(body).toContain(`\`${r}\``);
    expect(flat).toMatch(/280 (characters|caracteres)/);
  });

  test('security: URLs are credentials, the hint, what is never sent, the URL rules', () => {
    expect(flat).toMatch(/\*\*(write-only|solo escritura)\*\*/);
    expect(body).toContain('`hooks.slack.com/…/abcd`');
    expect(golden('slack_run_failed').text).toBe(golden('https_run_failed').text);
    for (const host of PROVIDER_HOSTS) expect(body, host).toContain(`\`${host}\``);
    for (const p of ['`/services/`', '`/api/webhooks/`', '`nan.builders`', '`helmcode.com`', '`3xx`']) expect(body).toContain(p);
    expect(flat).toMatch(/port 443|puerto 443/);
  });

  test('the CLI: every command and flag, the URL only from a file or a pipe', () => {
    for (const c of CLI_COMMANDS) expect(code, c).toContain(`nan notifications ${c}`);
    for (const f of CLI_FLAGS) expect(body, f).toContain(f);
    expect(body).toContain('**0.1.34**');
    // A URL is a credential: never an argument, never a --url flag.
    expect(code).not.toMatch(/--url[ =]/);
    expect(code).not.toMatch(/nan notifications \w+ [^\n]*https:\/\//);
    for (const exit of ['64', '65', '69']) expect(flat).toContain(exit);
  });

  test('the API: routes, scopes, credentials, rate limits, never a URL', () => {
    for (const [method, path, scope] of ROUTES) {
      expect(body).toMatch(new RegExp(`^\\| \`${method} ${path.replace(/[?{}]/g, '\\$&')}\` \\| \`${scope}\` \\|`, 'm'));
    }
    expect(flat).toMatch(/`notifications:write` (does not include|no incluye) `notifications:read`/);
    expect(flat).toMatch(/30,? (then|y luego) 120 (per hour|por hora)/);
    expect(flat).toMatch(/(up to 5 in a row, then 1 a minute|hasta 5 seguidas y luego 1 por minuto)/);
    const channel = jsonBlocks(body).find((b) => b.object === 'notification_channel');
    expect(Object.keys(channel)).toEqual([
      'id', 'object', 'name', 'kind', 'url_hint', 'enabled', 'disabled_reason', 'consecutive_failures', 'last_delivery_at',
      'last_delivery_status', 'subscriptions', 'signing', 'updated_by', 'created_at', 'updated_at',
    ]);
    expect(channel.subscriptions.map((s: { event: string }) => s.event)).toEqual(DEFAULT_EVENTS);
    expect(channel).not.toHaveProperty('url');
    expect(body).toContain('`signing_secret`');
    expect(body).toContain('/docs/api#tag/notifications');
  });

  test('limits: the constants of cloud-api', () => {
    const table = body.slice(body.search(/^## (Limits|Límites)$/m), body.search(/^## (If something goes wrong|Si algo sale mal)$/m));
    for (const v of ['10', '50', '64', '2048', '20', '24', '30', '120', '8 KiB']) expect(table, v).toContain(v);
  });

  test('troubleshooting lists every error a member can see', () => {
    const table = body.slice(body.search(/^## (If something goes wrong|Si algo sale mal)$/m));
    for (const c of ERROR_CODES) expect(table, c).toContain(`\`${c}\``);
    for (const s of ['`failed`', '`blocked`', '`rate_limited`', '**Turned off: failing**']) expect(table, s).toContain(s);
  });

  test('no em-dashes, no internals, nothing private, never the portal route', () => {
    expect(raw).not.toContain('—');
    expect(prose).not.toMatch(INTERNAL);
    expect(body).not.toMatch(INTERNAL);
    expect(body).not.toMatch(PRIVATE);
    expect(body).not.toContain('/api/account/notification-channels');
  });
});

describe('Notifications page, both locales', () => {
  const [en, es] = [pages.en, pages.es].map((p) => strip(read(p.dir + 'notifications.mdx')));

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

describe.each(Object.entries(pages))('the other guides point at the Notifications page (%s)', (_locale, page) => {
  const link = `${page.prefix}/docs/notifications`;

  test.each(['automations.mdx', 'secrets.mdx', 'nan-cli.mdx'])('%s links it', (file) => {
    expect(read(page.dir + file)).toContain(`](${link}`);
  });

  test('automations lists the two notification scopes in its token table', () => {
    const auto = read(page.dir + 'automations.mdx');
    expect(auto).toMatch(/^\| `notifications:read` \|/m);
    expect(auto).toMatch(/^\| `notifications:write` \|/m);
  });

  test('every link into the Notifications page lands on a heading that exists', () => {
    const ids = headingIds(strip(read(page.dir + 'notifications.mdx')));
    for (const f of readdirSync(resolve(src, page.dir))) {
      for (const m of read(page.dir + f).matchAll(new RegExp(`\\]\\(${link.replace(/\//g, '\\/')}#([^)\\s]+)\\)`, 'g'))) {
        expect(ids.has(decodeURIComponent(m[1])), `${f}: #${m[1]}`).toBe(true);
      }
    }
  });
});
