import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { useT } from '../../lib/i18n';
import {
  DESKTOP_BUILDS,
  DESKTOP_ISSUES_URL,
  DESKTOP_PLATFORMS,
  DESKTOP_RELEASES_URL,
  DESKTOP_SECURITY_URL,
  buildsFor,
  desktopAssetUrl,
  detectPlatform,
  fileExt,
} from '../../lib/desktop';

/**
 * Helmcode Desktop downloads: the landing section and the /download page.
 *
 * Spec:
 *  - Every download link is a ONE-CLICK stable URL
 *    `github.com/helmcode/nan-desktop/releases/latest/download/<asset>`. The
 *    release CI renames each release's assets to exactly these names, so the
 *    URLs are permanent and must never carry a version.
 *  - Builds: macOS Apple silicon (.dmg), macOS Intel (.dmg), Windows x64
 *    (setup .exe), Linux amd64 (.deb, plus .AppImage and .rpm alternates).
 *  - Requirements: macOS 12+, Windows 10+, Ubuntu 22.04+.
 *  - /download (EN) and /es/download (ES): title "Download Helmcode Desktop" /
 *    "Descarga Helmcode Desktop", one card per build, unsigned-builds note
 *    linking SECURITY.md, a GitHub releases link and feedback → GitHub issues.
 *  - Zero JS: plain anchors; a script only highlights the visitor's OS.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, '../..', p), 'utf-8');
const markupOf = (src: string) => src.slice(src.indexOf('---', 3) + 3, src.indexOf('<style>'));

const section = read('components/nan/home/Download.astro');
const sectionMarkup = markupOf(section);
const page = read('pages/_download.astro');
const pageMarkup = markupOf(page);
const highlight = read('components/nan/desktop/PlatformHighlight.astro');

const BASE = 'https://github.com/helmcode/nan-desktop/releases/latest/download/';

describe('stable download URLs', () => {
  test('exact asset URLs, one per build', () => {
    expect(DESKTOP_BUILDS.map((b) => desktopAssetUrl(b.file))).toEqual([
      `${BASE}Helmcode.Desktop-macOS-AppleSilicon.dmg`,
      `${BASE}Helmcode.Desktop-macOS-Intel.dmg`,
      `${BASE}Helmcode.Desktop-Windows-x64-setup.exe`,
      `${BASE}Helmcode.Desktop-Linux-amd64.deb`,
    ]);
  });

  test('Linux alternates: AppImage and rpm', () => {
    const linux = buildsFor('linux');
    expect(linux).toHaveLength(1);
    expect(linux[0].alternates.map(desktopAssetUrl)).toEqual([
      `${BASE}Helmcode.Desktop-Linux-amd64.AppImage`,
      `${BASE}Helmcode.Desktop-Linux-x86_64.rpm`,
    ]);
  });

  test('no file name carries a version', () => {
    const files = DESKTOP_BUILDS.flatMap((b) => [b.file, ...b.alternates]);
    for (const f of files) expect(f).not.toMatch(/\d+\.\d+/);
  });

  test('minimum OS per build', () => {
    expect(Object.fromEntries(DESKTOP_BUILDS.map((b) => [b.id, b.minOs]))).toEqual({
      macosArm: 'macOS 12+',
      macosIntel: 'macOS 12+',
      windows: 'Windows 10+',
      linux: 'Ubuntu 22.04+',
    });
  });

  test('every platform has at least one build', () => {
    for (const os of DESKTOP_PLATFORMS) expect(buildsFor(os).length).toBeGreaterThan(0);
  });

  test('fileExt keeps the dot and the case', () => {
    expect(fileExt('a.b-c.AppImage')).toBe('.AppImage');
    expect(fileExt('x-setup.exe')).toBe('.exe');
  });

  test('repo links', () => {
    expect(DESKTOP_RELEASES_URL).toBe('https://github.com/helmcode/nan-desktop/releases/latest');
    expect(DESKTOP_SECURITY_URL).toBe('https://github.com/helmcode/nan-desktop/blob/main/SECURITY.md');
    expect(DESKTOP_ISSUES_URL).toBe('https://github.com/helmcode/nan-desktop/issues');
  });
});

describe('copy in both locales', () => {
  test('landing title matches the spec', () => {
    expect(`${useT('es').download.title1} ${useT('es').download.title2}`).toBe('Helmcode Desktop para escritorio');
    expect(`${useT('en').download.title1} ${useT('en').download.title2}`).toBe('Helmcode Desktop for desktop');
  });

  test('/download title matches the spec', () => {
    expect(useT('en').downloadPage.title).toBe('Download Helmcode Desktop');
    expect(useT('es').downloadPage.title).toBe('Descarga Helmcode Desktop');
  });

  for (const locale of ['en', 'es'] as const) {
    describe(locale, () => {
      const tt = useT(locale).download;
      const pg = useT(locale).downloadPage;

      test('has a value-prop line and a CTA', () => {
        expect(tt.sub.length).toBeGreaterThan(20);
        expect(tt.cta.length).toBeGreaterThan(0);
        expect(tt.detected.length).toBeGreaterThan(0);
        expect(tt.allOptions.length).toBeGreaterThan(0);
      });

      test('per-OS format hints match the published assets (no .msi)', () => {
        expect(tt.platforms.macos.formats).toContain('.dmg');
        expect(tt.platforms.windows.formats).toContain('.exe');
        expect(tt.platforms.windows.formats).not.toContain('.msi');
        for (const ext of ['.deb', '.rpm', '.AppImage']) expect(tt.platforms.linux.formats).toContain(ext);
      });

      test('system requirements line', () => {
        for (const req of ['macOS 12+', 'Windows 10+', 'Ubuntu 22.04+']) expect(tt.requirements).toContain(req);
      });

      test('one entry per platform and one arch label per build', () => {
        expect(Object.keys(tt.platforms).sort()).toEqual([...DESKTOP_PLATFORMS].sort());
        expect(Object.keys(tt.arch).sort()).toEqual(DESKTOP_BUILDS.map((b) => b.id).sort());
      });

      test('/download notes: unsigned builds, both OS workarounds, releases, feedback', () => {
        for (const key of ['metaTitle', 'metaDesc', 'unsignedTitle', 'unsignedBody', 'securityLink', 'releasesLink', 'feedbackLink', 'macHint'] as const) {
          expect(pg[key].length, key).toBeGreaterThan(0);
        }
        expect(pg.unsignedBody).toMatch(/notari/i);
        expect(pg.unsignedBody).toContain('Authenticode');
        expect(pg.unsignedMac).toMatch(/^macOS/);
        expect(pg.unsignedWin).toMatch(/^Windows/);
        expect(pg.securityLink).toContain('SECURITY.md');
      });
    });
  }
});

describe('landing section — links work without JS', () => {
  test('cards link to the stable asset URLs, never to a generic releases page', () => {
    expect(sectionMarkup).toMatch(/<a[^>]*href=\{desktopAssetUrl\(b\.file\)\}/);
    expect(sectionMarkup).toMatch(/href=\{desktopAssetUrl\(file\)\}/);
    expect(sectionMarkup).not.toContain('DESKTOP_RELEASES_URL');
    expect(sectionMarkup).toContain('DESKTOP_PLATFORMS.map');
    expect(sectionMarkup).toContain('buildsFor(os)');
  });

  test('links to the /download page in the current locale', () => {
    expect(sectionMarkup).toContain("withLang('/download', lang)");
  });

  test('keeps the #download anchor', () => {
    expect(sectionMarkup).toContain('id="download"');
  });

  test('the detected tag is hidden by default (no JS, no false highlight)', () => {
    expect(sectionMarkup).toMatch(/data-detected-tag hidden/);
    expect(sectionMarkup).not.toContain('data-detected ');
    expect(sectionMarkup).toContain('data-download-grid');
    expect(sectionMarkup).toContain('<PlatformHighlight />');
  });

  test('no inline script: highlighting lives in the shared component', () => {
    expect(section).not.toContain('<script');
  });
});

describe('/download page', () => {
  test('one card per build, each a plain anchor to its stable URL', () => {
    expect(pageMarkup).toContain('DESKTOP_BUILDS.map');
    expect(pageMarkup).toMatch(/<a[^>]*href=\{desktopAssetUrl\(b\.file\)\}/);
    expect(pageMarkup).toMatch(/href=\{desktopAssetUrl\(file\)\}/);
  });

  test('links SECURITY.md, the GitHub releases and GitHub issues', () => {
    expect(pageMarkup).toContain('href={DESKTOP_SECURITY_URL}');
    expect(pageMarkup).toContain('href={`${DESKTOP_REPO_URL}/releases`}');
    expect(pageMarkup).toContain('href={DESKTOP_ISSUES_URL}');
  });

  test('uses the page dictionary for the title and the shell layout', () => {
    expect(pageMarkup).toMatch(/<NanPage title=\{tt\.metaTitle\} description=\{tt\.metaDesc\}>/);
    expect(pageMarkup).toMatch(/<h1[^>]*>\{tt\.title\}<\/h1>/);
  });

  test('detected tag hidden by default, highlight is the shared enhancement', () => {
    expect(pageMarkup).toMatch(/data-detected-tag hidden/);
    expect(pageMarkup).toContain('data-download-grid');
    expect(pageMarkup).toContain('<PlatformHighlight />');
    expect(page).not.toContain('<script');
  });

  test('EN and ES routes are thin wrappers of the same body', () => {
    expect(read('pages/download.astro')).toContain("import Page from './_download.astro'");
    expect(read('pages/es/download.astro')).toContain("import Page from '../_download.astro'");
  });
});

describe('PlatformHighlight', () => {
  const script = highlight.slice(highlight.indexOf('<script>'));

  test('only enhances: never touches href or navigation', () => {
    expect(script).not.toMatch(/href|location|preventDefault/);
  });

  test('marks every card of the detected platform (both Mac builds)', () => {
    expect(script).toContain('querySelectorAll');
    expect(script).toContain('[data-download-grid] [data-platform="${os}"]');
  });
});

describe('home anchor scrolls below the sticky nav', () => {
  test('the root reserves the nav height for anchor jumps', () => {
    const css = read('styles/nan-system.css');
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--nav-h\)/);
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

describe('placement on the landing', () => {
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
