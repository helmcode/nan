import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const pub = resolve(src, '../public');
const CREATE_SHOTS = ['create-1-name-ssh', 'create-2-agents', 'create-3-config'];
const PHONE_SHOTS = [
  'phone-01-keychain-menu',
  'phone-02-generate-key',
  'phone-03-add-ssh-key',
  'phone-04-new-host-menu',
  'phone-05-host-address',
  'phone-06-host-credentials',
  'phone-07-connected',
  'phone-08-herdr-computer',
  'phone-09-herdr-phone',
];
/** Screenshots of a computer screen; every other phone-* one is a phone screen. */
const DESKTOP_SHOTS = new Set(['phone-03-add-ssh-key', 'phone-08-herdr-computer']);
const SHOTS = [...CREATE_SHOTS, ...PHONE_SHOTS];
/** Things that must never be published: workspace ids (UUIDs) and private addresses. */
const PRIVATE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\bws-[0-9a-f]{8}\b/i;
const INTERNAL = /firecracker|micro-?vms?\b|\bvm\b|\bkvm\b|kubernetes|\bk8s\b|\br2\b|nan-vmd/i;

interface Shot {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  variant: string;
}

/** Every <Screenshot .../> of a page, in order. */
function screenshots(body: string): Shot[] {
  return [...body.matchAll(/<Screenshot\s([^>]*?)\/>/g)].map((m) => {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    const num = (name: string) => Number(new RegExp(`${name}=\\{(\\d+)\\}`).exec(m[1])?.[1]);
    return {
      src: attr('src'),
      alt: attr('alt'),
      caption: attr('caption'),
      variant: attr('variant') || 'default',
      width: num('width'),
      height: num('height'),
    };
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

  test('says any paying member can buy slots, without listing the plans and their prices', () => {
    expect(flat).toMatch(
      locale === 'en'
        ? /Any \*\*paying member\*\* of NaN can buy workspace slots\./
        : /Cualquier \*\*miembro de pago\*\* de NaN puede comprar slots de workspace\./,
    );
    // Owner decision (2026-10-09): no plan enumeration with prices on this page.
    expect(body).not.toMatch(/14,99€|\b70€|\b200€/);
    expect(body).not.toMatch(/\| (Community|Comunidad|Inference|Inferencia)\b/);
  });

  test('the free workspace is the premium benefit, Micro sized', () => {
    expect(flat).toMatch(
      locale === 'en'
        ? /The Premium plan includes \*\*one free workspace\*\*/
        : /El plan Premium incluye \*\*un workspace gratis\*\*/,
    );
    expect(flat).toContain(locale === 'en' ? '1 vCPU, 2 GiB RAM, 10 GiB disk' : '1 vCPU, 2 GiB de RAM, 10 GiB de disco');
  });

  test('says a slot does not include inference', () => {
    expect(flat).toContain(locale === 'en' ? 'It does not include inference' : 'No incluye inferencia');
  });

  test('documents how to connect: SSH command, SSH keys tab, web terminal', () => {
    expect(body).toContain('ssh <workspace-id>@ssh.nan.builders -p 30222');
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

  test('shows every screenshot once, in order: the create wizard, then the phone guide', () => {
    const shots = screenshots(body);
    expect(shots.map((s) => s.src)).toEqual(SHOTS.map((n) => `/docs/workspaces/${n}.webp`));
  });

  test('phone screens are shown as phone screenshots, computer screens are not', () => {
    for (const shot of screenshots(body)) {
      const name = shot.src.replace(/^.*\/|\.webp$/g, '');
      const phone = name.startsWith('phone-') && !DESKTOP_SHOTS.has(name);
      expect(shot.variant, name).toBe(phone ? 'phone' : 'default');
    }
  });

  test('no workspace id or private address in any file name, alt text or caption', () => {
    for (const shot of screenshots(body)) {
      expect(`${shot.src} ${shot.alt} ${shot.caption}`).not.toMatch(PRIVATE);
    }
    expect(body).not.toMatch(PRIVATE);
  });

  test('the phone guide sits right after creating the workspace, before Connect', () => {
    const create = flat.indexOf(locale === 'en' ? '## Create your workspace' : '## Crea tu workspace');
    const phone = flat.indexOf(
      locale === 'en'
        ? '## Connect from your phone and keep agents running 24/7 with Herdr'
        : '## Conéctate desde el móvil y mantén tus agentes 24/7 con Herdr',
    );
    expect(create).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(create);
    const connect = body.search(locale === 'en' ? /^## Connect$/m : /^## Conectarte$/m);
    expect(connect).toBeGreaterThan(body.indexOf('phone-09-herdr-phone'));
  });

  test('the phone guide gives the exact connection details and the Herdr basics', () => {
    expect(flat).toContain('https://termius.com/download');
    expect(flat).toContain('`ssh.nan.builders`');
    expect(flat).toContain('`30222`');
    // The SSH keys tab shows Username / Hostname / Port as copyable fields now.
    expect(flat).toMatch(
      locale === 'en'
        ? /Copy it from the \*\*Username\*\* field in the \*\*SSH keys\*\* tab/
        : /Cópialo del campo \*\*Username\*\* de la pestaña \*\*SSH keys\*\*/,
    );
    expect(flat).not.toMatch(/may also show it as Username|también puede mostrarlo como Username/);
    expect(flat).toMatch(/Use Mosh\*\* (off|desactivado)/);
    expect(body).toContain('```bash\nherdr\n```');
    expect(flat).toContain('https://herdr.dev');
    expect(flat).toMatch(locale === 'en' ? /Only the public key/ : /Solo la clave pública/);
  });

  test('the SSH command includes the gateway port', () => {
    expect(body).toContain('ssh <workspace-id>@ssh.nan.builders -p 30222');
  });

  test.each(SHOTS)('screenshot %s: file exists, size matches, alt and caption present', (name) => {
    const shot = screenshots(body).find((s) => s.src === `/docs/workspaces/${name}.webp`)!;
    const file = resolve(pub, `docs/workspaces/${name}.webp`);
    expect(existsSync(file)).toBe(true);
    expect(webpSize(file)).toEqual({ width: shot.width, height: shot.height });
    expect(shot.alt.length).toBeGreaterThan(30);
    expect(shot.caption.length).toBeGreaterThan(5);
    // Member-facing: no infrastructure words in what a reader or a screen reader gets.
    expect(`${shot.alt} ${shot.caption}`).not.toMatch(INTERNAL);
  });

  test('explains each step of the wizard', () => {
    expect(flat).toMatch(locale === 'en' ? /## Create your workspace/ : /## Crea tu workspace/);
    expect(flat).toMatch(
      locale === 'en'
        ? /lowercase letters, numbers and hyphens, 20 characters at most/
        : /minúsculas, números y guiones, 20 caracteres como máximo/,
    );
    expect(body).toContain('cat ~/.ssh/id_ed25519.pub');
    expect(body).toContain('ssh-keygen -t ed25519');
    expect(flat).toContain('Need a bigger workspace? Buy a slot');
    expect(flat).toContain('@BotFather');
    expect(flat).toContain('Install gentle-shell');
    expect(flat).toContain('**Create Workspace**');
  });

  test('says a restore does not change the SSH keys managed in the panel', () => {
    expect(flat).toContain(
      locale === 'en'
        ? 'The keys in the **SSH keys** tab are not on the disk, so a restore does not change them.'
        : 'Las claves de la pestaña **SSH keys** no están en el disco, así que restaurar no las cambia.',
    );
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

describe('workspaces screenshots', () => {
  test('the two locales show the same pictures with different, translated alt text', () => {
    const [en, es] = (['en', 'es'] as const).map((l) => screenshots(read(pages[l].file)));
    expect(es.map((s) => s.src)).toEqual(en.map((s) => s.src));
    en.forEach((shot, i) => expect(es[i].alt).not.toBe(shot.alt));
  });

  test('only the published screenshots live in the folder (no raw captures)', () => {
    expect(readdirSync(resolve(pub, 'docs/workspaces')).sort()).toEqual(SHOTS.map((n) => `${n}.webp`).sort());
  });
});

describe('gentle-shell link', () => {
  test.each(['src/content/docs/workspaces.mdx', 'src/content/docs-es/workspaces.mdx'])(
    '%s links gentle-shell to its official repo',
    (rel) => {
      const text = readFileSync(resolve(process.cwd(), rel), 'utf8');
      expect(text).toContain('[gentle-shell](https://github.com/Gentleman-Programming/gentle-shell)');
    },
  );
});
