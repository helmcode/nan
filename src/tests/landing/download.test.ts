import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { useT } from '../../lib/i18n';
import { DESKTOP_PLATFORMS, DESKTOP_RELEASES_URL, detectPlatform } from '../../lib/desktop';

/**
 * "Helmcode Desktop" download section on the landing.
 *
 * Spec: right after the main pitch (WhyNan), a title, one value-prop line,
 * three cards (macOS / Windows / Linux) linking to the latest GitHub release
 * with per-OS format hints, and a system-requirements line. Links must work
 * with zero JS; a small script only highlights the visitor's OS.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, '../..', p), 'utf-8');
const component = read('components/nan/home/Download.astro');
const markup = component.slice(component.indexOf('---', 3) + 3, component.indexOf('<style>'));

describe('Download — copy in both locales', () => {
  test('title matches the spec', () => {
    expect(`${useT('es').download.title1} ${useT('es').download.title2}`).toBe('Helmcode Desktop para escritorio');
    expect(`${useT('en').download.title1} ${useT('en').download.title2}`).toBe('Helmcode Desktop for desktop');
  });

  for (const locale of ['en', 'es'] as const) {
    describe(locale, () => {
      const tt = useT(locale).download;

      test('has a value-prop line and a CTA', () => {
        expect(tt.sub.length).toBeGreaterThan(20);
        expect(tt.cta.length).toBeGreaterThan(0);
        expect(tt.detected.length).toBeGreaterThan(0);
      });

      test('per-OS format hints', () => {
        expect(tt.platforms.macos.formats).toContain('.dmg');
        expect(tt.platforms.windows.formats).toContain('.msi');
        expect(tt.platforms.windows.formats).toContain('.exe');
        for (const ext of ['.deb', '.rpm', '.AppImage']) expect(tt.platforms.linux.formats).toContain(ext);
      });

      test('system requirements line', () => {
        for (const req of ['macOS 12+', 'Windows 10+', 'Ubuntu 22.04+']) expect(tt.requirements).toContain(req);
      });

      test('one entry per platform', () => {
        expect(Object.keys(tt.platforms).sort()).toEqual([...DESKTOP_PLATFORMS].sort());
      });
    });
  }
});

describe('Download — links work without JS', () => {
  test('releases URL is the latest release of nan-desktop', () => {
    expect(DESKTOP_RELEASES_URL).toBe('https://github.com/helmcode/nan-desktop/releases/latest');
  });

  test('every card is a plain anchor to the releases URL', () => {
    expect(markup).toMatch(/<a[\s\S]*?href=\{DESKTOP_RELEASES_URL\}/);
    expect(markup).toContain('DESKTOP_PLATFORMS.map');
  });

  test('the detected tag is hidden by default (no JS, no false highlight)', () => {
    expect(markup).toMatch(/data-detected-tag hidden/);
    expect(markup).not.toContain('data-detected ');
  });

  test('the script only enhances: it never touches href', () => {
    const script = component.slice(component.indexOf('<script>'));
    expect(script).not.toMatch(/href|location|preventDefault/);
  });
});

describe('detectPlatform', () => {
  const cases: [string, Parameters<typeof detectPlatform>[0], ReturnType<typeof detectPlatform>][] = [
    ['macOS Safari', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15' }, 'macos'],
    ['Chromium userAgentData mac', { uaPlatform: 'macOS', platform: 'MacIntel', userAgent: '' }, 'macos'],
    ['Windows Chrome', { uaPlatform: 'Windows', platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'windows'],
    ['Linux Firefox', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' }, 'linux'],
    ['ChromeOS', { uaPlatform: 'Chrome OS', platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 15000.0.0)' }, 'linux'],
    ['Android is not Linux desktop', { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' }, null],
    ['iPadOS reporting MacIntel', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }, null],
    ['iPhone', { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148' }, null],
    ['Darwin is not Windows', { platform: '', userAgent: 'SomeClient/1.0 Darwin/23.0.0' }, null],
    ['unknown', { platform: '', userAgent: '' }, null],
    ['all missing', {}, null],
  ];
  test.each(cases)('%s', (_name, signals, expected) => {
    expect(detectPlatform(signals)).toBe(expected);
  });
});

describe('Download — placement on the landing', () => {
  const home = read('pages/_home.astro');

  test('renders right after the main pitch (WhyNan)', () => {
    expect(home).toMatch(/<WhyNan \/>\s*<Download \/>/);
  });

  test('section numbers stay sequential in render order', () => {
    const order = [...home.matchAll(/^\s*<(\w+) \/>$/gm)].map((m) => m[1]).filter((c) => c !== 'Hero');
    const numbers = order.map((c) => {
      const src = read(`components/nan/home/${c}.astro`);
      return src.match(/class="sechead__n">(\d\d)</)?.[1];
    });
    expect(numbers).toEqual(order.map((_, i) => String(i + 1).padStart(2, '0')));
  });
});
