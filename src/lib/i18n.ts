import esData from '../../i18n/es.json' with { type: 'json' };
import enData from '../../i18n/en.json' with { type: 'json' };

const translations: Record<string, Record<string, unknown>> = {
  es: esData as Record<string, unknown>,
  en: enData as Record<string, unknown>,
};

function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return current;
}

export function t(key: string, locale: string = 'en'): string {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  return typeof result === 'string' ? result : key;
}

export function tArr(key: string, locale: string = 'en'): string[] {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  if (typeof result === 'object' && result !== null) {
    return Object.values(result as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string');
  }
  return [];
}

export function tObj<T = Record<string, unknown>>(key: string, locale: string = 'en'): T {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  if (typeof result === 'object' && result !== null) return result as T;
  return {} as T;
}

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The locale lives in the PATH, not in a query param: English at `/`, Spanish
 * under `/es/`. Query params are invisible to crawlers as a language signal
 * and cannot carry hreflang, so `/es/...` is what we index and link.
 *
 * Accepts a URL or a pathname so callers can pass `Astro.url` directly.
 */
export function getLocale(source: URL | string): Locale {
  const pathname = typeof source === 'string' ? source : source.pathname;
  return pathname.split('/')[1] === 'es' ? 'es' : 'en';
}

/**
 * Keeps the locale in internal navigation: withLang('/hackaton/me', 'es')
 * → '/es/hackaton/me'. English is the default locale and has no prefix.
 */
export function withLang(path: string, locale: string): string {
  if (locale !== 'es') return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? '/es' : `/es${clean}`;
}

/** Same page in the other language, for the language switcher. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const stripped = pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return target === 'en' ? stripped : withLang(stripped, 'es');
}
