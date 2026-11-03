/**
 * Helmcode Desktop downloads, shared by the landing section, the /download
 * page and their client script.
 *
 * Every link is a ONE-CLICK stable URL: GitHub's `releases/latest/download/<asset>`
 * redirect always serves the newest release, and the release CI renames every
 * release's assets to exactly the names below. Never put a version in here.
 * The links work with zero JS; `detectPlatform` only decides which card gets
 * highlighted.
 */

export const DESKTOP_REPO_URL = 'https://github.com/helmcode/nan-desktop';
export const DESKTOP_RELEASES_URL = `${DESKTOP_REPO_URL}/releases/latest`;
export const DESKTOP_SECURITY_URL = `${DESKTOP_REPO_URL}/blob/main/SECURITY.md`;
export const DESKTOP_ISSUES_URL = `${DESKTOP_REPO_URL}/issues`;

/** Stable one-click URL of a release asset (always the latest release). */
export const desktopAssetUrl = (file: string): string => `${DESKTOP_RELEASES_URL}/download/${file}`;

export const DESKTOP_PLATFORMS = ['macos', 'windows', 'linux'] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export interface DesktopBuild {
  /** Key into the i18n `builds` map. */
  id: 'macosArm' | 'macosIntel' | 'windows' | 'linux';
  platform: DesktopPlatform;
  /** Primary asset, exact name published by the release CI. */
  file: string;
  /** Other packages for the same build (Linux: AppImage, rpm). */
  alternates: readonly string[];
  /** Minimum supported OS (not translated: product names). */
  minOs: string;
}

export const DESKTOP_BUILDS: readonly DesktopBuild[] = [
  {
    id: 'macosArm',
    platform: 'macos',
    file: 'Helmcode.Desktop-macOS-AppleSilicon.dmg',
    alternates: [],
    minOs: 'macOS 12+',
  },
  {
    id: 'macosIntel',
    platform: 'macos',
    file: 'Helmcode.Desktop-macOS-Intel.dmg',
    alternates: [],
    minOs: 'macOS 12+',
  },
  {
    id: 'windows',
    platform: 'windows',
    file: 'Helmcode.Desktop-Windows-x64-setup.exe',
    alternates: [],
    minOs: 'Windows 10+',
  },
  {
    id: 'linux',
    platform: 'linux',
    file: 'Helmcode.Desktop-Linux-amd64.deb',
    alternates: ['Helmcode.Desktop-Linux-amd64.AppImage', 'Helmcode.Desktop-Linux-x86_64.rpm'],
    minOs: 'Ubuntu 22.04+',
  },
];

/** Builds of one platform, in display order. */
export const buildsFor = (platform: DesktopPlatform): DesktopBuild[] =>
  DESKTOP_BUILDS.filter((b) => b.platform === platform);

/** File extension including the dot, e.g. `.AppImage`. */
export const fileExt = (file: string): string => file.slice(file.lastIndexOf('.'));

export interface PlatformSignals {
  /** `navigator.userAgentData.platform` (Chromium only). */
  uaPlatform?: string | null;
  /** `navigator.platform` (deprecated but still everywhere). */
  platform?: string | null;
  userAgent?: string | null;
}

/**
 * Desktop OS of the visitor, or null when it is unknown or a phone/tablet
 * (there is no mobile build, so nothing gets highlighted there).
 */
export function detectPlatform({ uaPlatform, platform, userAgent }: PlatformSignals): DesktopPlatform | null {
  const ua = userAgent ?? '';
  // Android reports "Linux" and iPadOS can report "MacIntel": rule mobile out first.
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return null;

  const hint = `${uaPlatform ?? ''} ${platform ?? ''} ${ua}`;
  // \b keeps "Darwin" from reading as Windows.
  if (/\bwin/i.test(hint)) return 'windows';
  if (/mac/i.test(hint)) return 'macos';
  if (/linux|x11|cros/i.test(hint)) return 'linux';
  return null;
}
