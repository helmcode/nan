/**
 * Helmcode Desktop downloads, shared by the landing section and its client
 * script. Every card links to the latest GitHub release, so the links work
 * with zero JS; `detectPlatform` only decides which card gets highlighted.
 */

export const DESKTOP_RELEASES_URL = 'https://github.com/helmcode/nan-desktop/releases/latest';

export const DESKTOP_PLATFORMS = ['macos', 'windows', 'linux'] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

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
