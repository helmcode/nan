import { describe, expect, test } from 'vitest';
import { t, tArr, tObj, getLocale, withLang, switchLocalePath } from '../../lib/i18n';

/**
 * Los asserts de t/tArr/tObj se anclan a `hackaton.*` a propósito: es copy que
 * las páginas del hackatón renderizan de verdad. Antes apuntaban a `founder.*`,
 * que se quedó huérfano al retirar la landing anterior y era lo único que
 * mantenía vivo aquel bloque del diccionario. Si hay que reapuntarlos otra vez,
 * elegir copy que alguna página use.
 */

describe('i18n', () => {
  describe('t()', () => {
    test('returns English string by default (no locale arg)', () => {
      expect(t('hackaton.label')).toBe('// hackathon');
    });

    test('returns Spanish string when locale is "es"', () => {
      expect(t('hackaton.label', 'es')).toBe('// hackatón');
    });

    test('returns English string when locale is "en"', () => {
      expect(t('hackaton.label', 'en')).toBe('// hackathon');
    });

    test('returns the key string for missing keys', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    test('falls back to Spanish for unknown locale', () => {
      // The i18n fallback is translations.es, so unknown locales return Spanish
      expect(t('hackaton.label', 'fr')).toBe('// hackatón');
    });

    test('returns the key string for missing keys regardless of locale', () => {
      expect(t('nonexistent.key', 'en')).toBe('nonexistent.key');
      expect(t('nonexistent.key', 'es')).toBe('nonexistent.key');
    });
  });

  describe('tArr()', () => {
    test('returns array of strings by default', () => {
      const points = tArr('hackaton.me.reassignInfo.points');
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);
      points.forEach((item) => expect(typeof item).toBe('string'));
    });

    test('returns Spanish array when locale is "es"', () => {
      const points = tArr('hackaton.me.reassignInfo.points', 'es');
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);
    });
  });

  describe('tObj()', () => {
    test('returns object by default', () => {
      const obj = tObj('hackaton');
      expect(typeof obj).toBe('object');
      expect(obj).not.toBeNull();
      expect(obj.label).toBeDefined();
    });

    test('returns object for Spanish locale', () => {
      const obj = tObj('hackaton', 'es');
      expect(typeof obj).toBe('object');
      expect(obj).not.toBeNull();
    });
  });

  describe('getLocale()', () => {
    test('returns "en" for the root path', () => {
      expect(getLocale('/')).toBe('en');
    });

    test('returns "en" for an unprefixed path', () => {
      expect(getLocale('/hackaton/me')).toBe('en');
    });

    test('returns "es" for the /es root', () => {
      expect(getLocale('/es')).toBe('es');
    });

    test('returns "es" for a prefixed path', () => {
      expect(getLocale('/es/hackaton/me')).toBe('es');
    });

    test('accepts a URL as well as a pathname', () => {
      expect(getLocale(new URL('https://nan.builders/es/community'))).toBe('es');
      expect(getLocale(new URL('https://nan.builders/community'))).toBe('en');
    });

    test('does not treat a lookalike segment as Spanish', () => {
      expect(getLocale('/espanol')).toBe('en');
    });

    test('ignores a leftover ?lang query param', () => {
      expect(getLocale(new URL('https://nan.builders/?lang=es'))).toBe('en');
    });
  });

  describe('withLang()', () => {
    test('prefixes /es for Spanish locale', () => {
      expect(withLang('/hackaton/me', 'es')).toBe('/es/hackaton/me');
    });

    test('returns path as-is for English locale', () => {
      expect(withLang('/hackaton/me', 'en')).toBe('/hackaton/me');
    });

    test('maps the root to /es', () => {
      expect(withLang('/', 'es')).toBe('/es');
      expect(withLang('/', 'en')).toBe('/');
    });

    test('keeps query params untouched', () => {
      expect(withLang('/page?x=1', 'es')).toBe('/es/page?x=1');
    });
  });

  describe('switchLocalePath()', () => {
    test('adds the prefix going to Spanish', () => {
      expect(switchLocalePath('/community', 'es')).toBe('/es/community');
      expect(switchLocalePath('/', 'es')).toBe('/es');
    });

    test('strips the prefix going to English', () => {
      expect(switchLocalePath('/es/community', 'en')).toBe('/community');
      expect(switchLocalePath('/es', 'en')).toBe('/');
    });

    test('is idempotent when already in the target locale', () => {
      expect(switchLocalePath('/es/community', 'es')).toBe('/es/community');
      expect(switchLocalePath('/community', 'en')).toBe('/community');
    });
  });
});
