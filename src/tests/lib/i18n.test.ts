import { describe, expect, test } from 'vitest';
import { t, tArr, tObj, getLocale, withLang, switchLocalePath } from '../../lib/i18n';

describe('i18n', () => {
  describe('t()', () => {
    test('returns English string by default (no locale arg)', () => {
      expect(t('founder.heading')).toBe('The NaN community is led by Cristian Córdova and Borja Perez.');
    });

    test('returns Spanish string when locale is "es"', () => {
      expect(t('founder.heading', 'es')).toBe('La comunidad NaN la dirigen Cristian Córdova y Borja Perez.');
    });

    test('returns English string when locale is "en"', () => {
      expect(t('founder.heading', 'en')).toBe('The NaN community is led by Cristian Córdova and Borja Perez.');
    });

    test('returns the key string for missing keys', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    test('falls back to Spanish for unknown locale', () => {
      // The i18n fallback is translations.es, so unknown locales return Spanish
      expect(t('founder.heading', 'fr')).toBe('La comunidad NaN la dirigen Cristian Córdova y Borja Perez.');
    });

    test('returns the key string for missing keys regardless of locale', () => {
      expect(t('nonexistent.key', 'en')).toBe('nonexistent.key');
      expect(t('nonexistent.key', 'es')).toBe('nonexistent.key');
    });
  });

  describe('tArr()', () => {
    test('returns array of strings by default', () => {
      const bio = tArr('founder.bio');
      expect(Array.isArray(bio)).toBe(true);
      expect(bio.length).toBeGreaterThan(0);
      bio.forEach((item) => expect(typeof item).toBe('string'));
    });

    test('returns Spanish array when locale is "es"', () => {
      const bio = tArr('founder.bio', 'es');
      expect(Array.isArray(bio)).toBe(true);
      expect(bio.length).toBeGreaterThan(0);
    });
  });

  describe('tObj()', () => {
    test('returns object by default', () => {
      const obj = tObj('founder');
      expect(typeof obj).toBe('object');
      expect(obj).not.toBeNull();
      expect(obj.label).toBeDefined();
    });

    test('returns object for Spanish locale', () => {
      const obj = tObj('founder', 'es');
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
