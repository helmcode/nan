import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { t } from '../../lib/i18n';
import { heroSignupHref, LOGIN_URL, SIGNUP_BASE_URL } from '../../lib/signup';

/**
 * Owner decision (2026-10-15): the hero has no form. Account creation lives on
 * cloud.nan.builders; the landing only points there with two buttons and one
 * reassurance line, so the hero is short and stays in the design language.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');
const hero = read('components/nan/home/Hero.astro');
const markup = hero.slice(hero.indexOf('---', 4) + 3, hero.indexOf('<style>'));

describe('hero CTA hrefs', () => {
  test('no plan: the bare platform signup', () => {
    expect(heroSignupHref('')).toBe('https://cloud.nan.builders/signup');
    expect(SIGNUP_BASE_URL).toBe('https://cloud.nan.builders/signup');
  });

  test('a known ?plan= is carried through', () => {
    for (const plan of ['community', 'inference', 'premium', 'workspace', 'space']) {
      expect(heroSignupHref(`?plan=${plan}`)).toBe(`https://cloud.nan.builders/signup?plan=${plan}`);
    }
  });

  test('the legacy ?premium=1 maps to plan=premium', () => {
    expect(heroSignupHref('?premium=1')).toBe('https://cloud.nan.builders/signup?plan=premium');
  });

  test('an unknown plan is dropped, never echoed into the link', () => {
    expect(heroSignupHref('?plan=gold')).toBe('https://cloud.nan.builders/signup');
    expect(heroSignupHref('?plan=%22%3E%3Cscript%3E')).toBe('https://cloud.nan.builders/signup');
  });

  test('login goes to the platform root', () => {
    expect(LOGIN_URL).toBe('https://cloud.nan.builders/');
  });
});

describe('hero markup', () => {
  test('has no form and no inputs', () => {
    expect(markup).not.toMatch(/<form|<input|<select|<textarea/i);
    expect(markup).not.toMatch(/data-signup|data-status/);
  });

  test('primary Create account and secondary Log in buttons', () => {
    expect(markup).toMatch(/class="btn btn-primary[^"]*"\s+href=\{signupHref\}/);
    expect(markup).toMatch(/class="btn btn-secondary[^"]*"\s+href=\{LOGIN_URL\}/);
    expect(hero).toContain('heroSignupHref(Astro.url.search)');
  });

  test('only the two buttons after the copy: no reassurance line (owner decision)', () => {
    expect(markup).not.toMatch(/reassure|spots__dot/);
    const after = markup.slice(markup.indexOf('{tt.ctaSecondary}'));
    expect(after).not.toMatch(/<p\b/);
  });

  test('ships no signup script', () => {
    expect(read('layouts/NanPage.astro')).not.toMatch(/scripts\/signup|initSignup/);
    expect(hero).not.toMatch(/client:(load|idle|visible)/);
  });
});

describe('hero copy', () => {
  test('buttons', () => {
    expect(t('nan.hero.ctaPrimary', 'en')).toBe('Create account');
    expect(t('nan.hero.ctaPrimary', 'es')).toBe('Crear cuenta');
    expect(t('nan.hero.ctaSecondary', 'en')).toBe('Log in');
    expect(t('nan.hero.ctaSecondary', 'es')).toBe('Entrar');
  });

  test.each(['en', 'es'] as const)('the hero dictionary in %s is headline + two buttons only', (locale) => {
    expect(t('nan.hero.reassure', locale)).toBe('nan.hero.reassure');
  });

  test.each(['en', 'es'] as const)('the old form strings are gone from %s', (locale) => {
    for (const k of ['labelFullName', 'jobRoles', 'okTitle', 'errEmail', 'legalPre', 'submit', 'sending']) {
      expect(t(`nan.hero.${k}`, locale), k).toBe(`nan.hero.${k}`);
    }
  });
});

describe('dead code is gone', () => {
  test('route, server lib, no-JS page and form script are deleted', () => {
    for (const f of ['pages/api/signup.ts', 'lib/signupServer.ts', 'lib/signupNoJs.ts', 'scripts/signup.ts']) {
      expect(existsSync(resolve(src, f)), f).toBe(false);
    }
  });

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (['tests', 'content', '__fixtures__'].includes(name)) continue;
        walk(p, out);
      } else if (/\.(astro|ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  test('no link points at #signup or #waitlist', () => {
    const offenders = walk(src)
      .filter((f) => /href=[{"'`][^>]*#(signup|waitlist)\b/.test(readFileSync(f, 'utf-8')) || /`\$\{home\}#(signup|waitlist)`/.test(readFileSync(f, 'utf-8')))
      .map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });
});
