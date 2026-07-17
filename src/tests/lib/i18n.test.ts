import { describe, expect, test } from 'vitest';
import { t, tArr, tObj, getLocale, withLang } from '../../lib/i18n';

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
    test('returns "en" when no lang param', () => {
      expect(getLocale(new URLSearchParams())).toBe('en');
    });

    test('returns "en" when lang=en', () => {
      expect(getLocale(new URLSearchParams([['lang', 'en']]))).toBe('en');
    });

    test('returns "es" when lang=es', () => {
      expect(getLocale(new URLSearchParams([['lang', 'es']]))).toBe('es');
    });

    test('returns "en" for unknown lang value', () => {
      expect(getLocale(new URLSearchParams([['lang', 'fr']]))).toBe('en');
    });
  });

  describe('withLang()', () => {
    test('appends ?lang=es for Spanish locale', () => {
      expect(withLang('/hackaton/me', 'es')).toBe('/hackaton/me?lang=es');
    });

    test('returns path as-is for English locale', () => {
      expect(withLang('/hackaton/me', 'en')).toBe('/hackaton/me');
    });

    test('appends &lang=es when URL already has query params', () => {
      expect(withLang('/page?x=1', 'es')).toBe('/page?x=1&lang=es');
    });

    test('returns path as-is for English with existing params', () => {
      expect(withLang('/page?x=1', 'en')).toBe('/page?x=1');
    });
  });
});