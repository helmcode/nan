import { describe, expect, test } from 'vitest';
import { t, tArr } from '../../lib/i18n';

describe('Founder', () => {
  describe('i18n data integrity', () => {
    test('English heading mentions both founders by name', () => {
      const heading = t('founder.heading', 'en');
      expect(heading).toContain('Cristian Córdova');
      expect(heading).toContain('Borja Perez');
    });

    test('Spanish heading mentions both founders by name', () => {
      const heading = t('founder.heading', 'es');
      expect(heading).toContain('Cristian Córdova');
      expect(heading).toContain('Borja Perez');
    });

    test('English company intro mentions Helmcode with link', () => {
      const intro = t('founder.companyIntro', 'en');
      expect(intro).toContain('Helmcode');
      expect(intro).toContain('helmcode.com');
      expect(intro).toContain('inference infrastructure');
    });

    test('Spanish company intro mentions Helmcode with link', () => {
      const intro = t('founder.companyIntro', 'es');
      expect(intro).toContain('Helmcode');
      expect(intro).toContain('helmcode.com');
      expect(intro).toContain('infraestructura de inferencia');
    });

    test('Founder bio contains Helmcode link', () => {
      const bio = tArr('founder.bio', 'en');
      const helmcodeLink = bio.find((line) => line.includes('helmcode.com'));
      expect(helmcodeLink).toBeDefined();
      expect(helmcodeLink).toContain('target="_blank"');
      expect(helmcodeLink).toContain('rel="noopener noreferrer"');
    });

    test('Founder quote is non-empty meaningful text', () => {
      const quote = t('founder.quote', 'en');
      expect(quote.length).toBeGreaterThan(50);
      expect(quote).toContain('NaN');
    });

    test('All founder link labels exist in both locales', () => {
      for (const key of ['twitter', 'linkedin', 'github']) {
        expect(t(`founder.links.${key}`, 'en')).toBeTruthy();
        expect(t(`founder.links.${key}`, 'es')).toBeTruthy();
      }
    });
  });
});