import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { t } from '../../lib/i18n';
import enData from '../../../i18n/en.json' with { type: 'json' };
import esData from '../../../i18n/es.json' with { type: 'json' };

/**
 * Open signup (OPEN-SIGNUP.md §4): the waitlist is gone from the site. Every
 * CTA goes to account creation, and no copy may promise a waitlist that no
 * longer exists. The only exception is the events reserve pool, which is a
 * real, separate waitlist for event seats.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');

const WAITLIST = /wait[\s-]?list|lista de espera|cola de espera|spot in line|plaza reservada en la cola/i;

function flatten(node: unknown, path: string[] = [], out = new Map<string, string>()) {
  if (typeof node === 'string') out.set(path.join('.'), node);
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, [...path, String(i)], out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) flatten(v, [...path, k], out);
  }
  return out;
}

/** The events pool copy is the one legitimate waitlist on the site. */
const isEventsPool = (key: string) => /^(nan\.)?events\./.test(key);

describe('no waitlist copy left', () => {
  test.each([['en', enData], ['es', esData]] as const)('%s dictionary', (_locale, data) => {
    const offenders = [...flatten(data)].filter(([k, v]) => !isEventsPool(k) && WAITLIST.test(v)).map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  test('the events pool copy is untouched', () => {
    expect(t('events.capacity.poolExplain', 'en')).toMatch(/waitlist/i);
    expect(t('events.capacity.poolExplain', 'es')).toMatch(/lista de espera/i);
  });

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (['tests', 'content', '__fixtures__', 'data'].includes(name)) continue;
        walk(p, out);
      } else if (/\.(astro|ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
        out.push(p);
      }
    }
    return out;
  }

  test('no page, component, script or lib mentions the waitlist', () => {
    const offenders = walk(src)
      .filter((f) => WAITLIST.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });

  test('no link targets the old #waitlist anchor', () => {
    const offenders = walk(src)
      .filter((f) => readFileSync(f, 'utf-8').includes('#waitlist'))
      .map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });
});

describe('CTAs go to account creation', () => {
  const pricing = read('components/nan/home/Pricing.astro');
  const tiers = pricing.slice(0, pricing.indexOf('---', 4));

  test('pricing tiers link to the platform signup with their plan', () => {
    expect(tiers).toContain("href: signupUrl('premium')");
    expect(tiers).toContain("href: signupUrl('inference')");
    expect(tiers).toContain("href: signupUrl('community')");
    expect(tiers).not.toMatch(/premium=1|#signup|\/community#/);
  });

  test('the workspaces block has a signup CTA with plan=workspace', () => {
    expect(pricing).toContain("signupUrl('workspace')");
    expect(t('nan.pricing.workspaces.signupCta', 'en')).not.toBe('nan.pricing.workspaces.signupCta');
    expect(t('nan.pricing.workspaces.signupCta', 'es')).not.toBe('nan.pricing.workspaces.signupCta');
  });

  test('nav shows "Create account" next to Login', () => {
    const nav = read('components/nan/Nav.astro');
    const login = nav.indexOf('{tt.login}');
    const signup = nav.indexOf('{tt.signup}');
    expect(signup).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(-1);
    expect(nav).toContain('href={signupUrl()}');
    expect(t('nan.nav.signup', 'en')).toBe('Create account');
    expect(t('nan.nav.signup', 'es')).toBe('Crear cuenta');
  });

  test('models, footer and 404 point at the hero signup form', () => {
    expect(read('components/nan/home/Models.astro')).toContain('${home}#signup');
    expect(read('components/nan/Footer.astro')).toContain('${home}#signup');
    expect(read('pages/404.astro')).toContain('${home}#signup');
  });

  test('/community sends people to the platform signup with plan=community', () => {
    const page = read('pages/_community.astro');
    expect(page).toContain("signupUrl('community')");
    expect(page).not.toContain('CommunitySignupForm');
  });

  test('the payment-first community signup is deleted', () => {
    for (const f of ['components/landing/CommunitySignupForm.tsx', 'pages/api/community-signup.ts', 'lib/communitySignup.ts']) {
      expect(existsSync(resolve(src, f)), f).toBe(false);
    }
  });
});

describe('legal pages cover the account data', () => {
  test.each([['privacy.astro'], ['es/privacy.astro']])('%s lists name, email, job role and social profiles', (file) => {
    const page = read(`pages/${file}`);
    expect(page).not.toMatch(WAITLIST);
    expect(page).toMatch(/LinkedIn/);
    expect(page).toMatch(/\bX\b/);
    if (file.startsWith('es/')) {
      expect(page).toMatch(/nombre/i);
      expect(page).toMatch(/rol profesional/i);
    } else {
      expect(page).toMatch(/full name/i);
      expect(page).toMatch(/job role/i);
    }
  });

  test.each([['terms.astro'], ['es/terms.astro']])('%s has no waitlist', (file) => {
    expect(read(`pages/${file}`)).not.toMatch(WAITLIST);
  });
});
