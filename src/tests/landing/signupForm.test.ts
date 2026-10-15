import { describe, expect, test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { t } from '../../lib/i18n';
import { JOB_ROLES } from '../../lib/signup';

/**
 * The home hero is the signup form (OPEN-SIGNUP.md §4). It is vanilla
 * (scripts/signup.ts), not an island: zero framework JS on the home.
 * Validation lives in lib/signup.ts, shared with the Worker route, so the
 * client and the server can never accept different things.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const hero = readFileSync(resolve(root, 'components/nan/home/Hero.astro'), 'utf-8');
const script = readFileSync(resolve(root, 'scripts/signup.ts'), 'utf-8');
const layout = readFileSync(resolve(root, 'layouts/NanPage.astro'), 'utf-8');
const markup = hero.slice(hero.indexOf('---', 4) + 3, hero.indexOf('<style>'));

const locales = ['en', 'es'] as const;

describe('hero signup form: markup', () => {
  test('the hero is anchored as #signup and the form is wired with data-signup', () => {
    expect(markup).toContain('id="signup"');
    expect(markup).toMatch(/<form[^>]*data-signup/);
    expect(markup).not.toMatch(/waitlist/i);
  });

  test('without JS the form still POSTs to the route, never GETs data into the URL', () => {
    const form = markup.match(/<form[^>]*>/)?.[0] ?? '';
    expect(form).toContain('method="post"');
    expect(form).toContain('action="/api/signup"');
  });

  test('has every field of the contract', () => {
    for (const name of ['fullName', 'email', 'jobRole', 'jobRoleOther', 'xUrl', 'linkedinUrl', '_hp']) {
      expect(markup, name).toContain(`name="${name}"`);
    }
    // the old region picker is gone
    expect(markup).not.toContain('name="region"');
  });

  test('required fields carry the required attribute and a visible marker', () => {
    for (const name of ['fullName', 'email', 'jobRole']) {
      const tag = markup.match(new RegExp(`<(input|select)[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
      expect(tag, name).toMatch(/\srequired[\s>]/);
    }
    expect(markup).toContain('signup__req');
  });

  test('optional social fields are not required', () => {
    for (const name of ['xUrl', 'linkedinUrl']) {
      const tag = markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
      expect(tag, name).not.toMatch(/\srequired[\s>]/);
    }
  });

  test('every field has a label bound by for/id', () => {
    for (const name of ['fullName', 'email', 'jobRole', 'jobRoleOther', 'xUrl', 'linkedinUrl']) {
      expect(markup, name).toContain(`for="signup-${name}"`);
      expect(markup, name).toContain(`id="signup-${name}"`);
    }
  });

  test('the job role select offers every enum value', () => {
    expect(markup).toContain('JOB_ROLES.map');
    expect(hero).toContain("from '../../../lib/signup'");
  });

  test('"Other" free text starts hidden and is revealed by the script', () => {
    expect(markup).toMatch(/data-other[^>]*hidden|hidden[^>]*data-other/);
    expect(script).toMatch(/'other'/);
  });

  test('the honeypot is out of the tab order and hidden from assistive tech', () => {
    expect(markup).toMatch(/aria-hidden="true"[\s\S]{0,200}name="_hp"[^>]*tabindex="-1"/);
  });

  test('the status region is polite and live', () => {
    expect(markup).toMatch(/data-status[^>]*role="status"[^>]*aria-live="polite"/);
  });

  test('links the terms and privacy policy next to the submit', () => {
    expect(markup).toMatch(/p\('\/terms'\)/);
    expect(markup).toMatch(/p\('\/privacy'\)/);
  });
});

describe('hero signup form: script', () => {
  test('is a vanilla script loaded by the page layout, no island', () => {
    expect(layout).toContain("from '../scripts/signup'");
    expect(layout).toContain('initSignup()');
    expect(layout).not.toMatch(/waitlist/i);
    expect(hero).not.toMatch(/client:(load|idle|visible)/);
  });

  test('reuses the shared validation instead of reimplementing it', () => {
    expect(script).toContain("from '../lib/signup'");
    expect(script).toContain('validateSignup');
    expect(script).toContain('parseSignupResponse');
    expect(script).toContain('planFromSearch');
    expect(script).not.toMatch(/@\[\^\\s@\]|\[A-Za-z0-9\._%\+-\]\+@/);
  });

  test('posts same-origin to /api/signup (CSP connect-src self)', () => {
    expect(script).toContain("fetch('/api/signup'");
    expect(script).not.toMatch(/fetch\(\s*['"`]https?:/);
  });

  test('the old waitlist pieces are deleted', () => {
    for (const f of ['scripts/waitlist.ts', 'lib/waitlist.ts', 'lib/waitlistClient.ts', 'pages/api/waitlist.ts', 'lib/email.ts']) {
      expect(existsSync(resolve(root, f)), f).toBe(false);
    }
  });
});

describe('hero signup form: copy', () => {
  const keys = [
    'spots', 'signupLine', 'labelFullName', 'labelEmail', 'labelJobRole', 'jobRolePlaceholder',
    'labelJobRoleOther', 'labelXUrl', 'labelLinkedinUrl', 'optional', 'requiredNote',
    'phFullName', 'phEmail', 'phJobRoleOther', 'phXUrl', 'phLinkedinUrl', 'submit', 'sending',
    'okTitle', 'okText', 'errFullName', 'errEmail', 'errJobRole', 'errJobRoleOther', 'errXUrl',
    'errLinkedinUrl', 'errFields', 'errRateLimited', 'errNetwork', 'errGeneric',
    'legalPre', 'legalTerms', 'legalAnd', 'legalPrivacy',
  ];

  test.each(locales)('every hero string exists in %s', (locale) => {
    for (const k of keys) {
      const v = t(`nan.hero.${k}`, locale);
      expect(v, `${locale}.${k}`).not.toBe(`nan.hero.${k}`);
      expect(v.trim().length, `${locale}.${k}`).toBeGreaterThan(0);
    }
  });

  test.each(locales)('every job role has a label in %s', (locale) => {
    for (const role of JOB_ROLES) {
      const v = t(`nan.hero.jobRoles.${role}`, locale);
      expect(v, `${locale}.${role}`).not.toBe(`nan.hero.jobRoles.${role}`);
    }
  });

  test('success copy tells you to check your inbox to confirm and sign in', () => {
    expect(t('nan.hero.okTitle', 'en')).toMatch(/inbox/i);
    expect(t('nan.hero.okTitle', 'en')).toMatch(/sign in/i);
    expect(t('nan.hero.okTitle', 'es')).toMatch(/bandeja/i);
  });

  test('the submit says create account, in both languages', () => {
    expect(t('nan.hero.submit', 'en')).toBe('Create account');
    expect(t('nan.hero.submit', 'es')).toBe('Crear cuenta');
  });
});
