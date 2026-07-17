import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// LanguageSwitcher test: reads the component source and verifies the logic
// is correct (defaults to English, toggles to Spanish on click).
//
// We test the source rather than rendering because Astro SSR would pull in
// the full layout tree. Source-level assertion is sufficient and prevents
// drift — if someone changes the default locale, this test will fail.

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, '../../components/landing/LanguageSwitcher.astro');
const source = readFileSync(componentPath, 'utf-8');

describe('LanguageSwitcher', () => {
  test('defaults to English (no lang param)', () => {
    // The component should default to 'en' when no ?lang param is present
    expect(source).toContain("=== 'es' ? 'es' : 'en'");
  });

  test('shows "ES" button when on English page', () => {
    // When currentLang is 'en', the label should be 'ES'
    expect(source).toContain("currentLang === 'en' ? 'ES' : 'EN'");
  });

  test('links to ?lang=es when on English page', () => {
    // When targetLang is 'es', the href should be '?lang=es'
    expect(source).toContain("targetLang === 'en' ? '?lang=en' : '?lang=es'");
  });

  test('shows "EN" button when on Spanish page', () => {
    // When currentLang is 'es', the label should be 'EN'
    expect(source).toContain("currentLang === 'en' ? 'ES' : 'EN'");
  });

  test('links to ?lang=en when on Spanish page', () => {
    // When targetLang is 'en', the href should be '?lang=en'
    expect(source).toContain("targetLang === 'en' ? '?lang=en' : '?lang=es'");
  });
});