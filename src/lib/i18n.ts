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

export function t(key: string, locale: string = 'es'): string {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  return typeof result === 'string' ? result : key;
}

export function tArr(key: string, locale: string = 'es'): string[] {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  if (typeof result === 'object' && result !== null) {
    return Object.values(result as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string');
  }
  return [];
}

export function tObj<T = Record<string, unknown>>(key: string, locale: string = 'es'): T {
  const data = translations[locale] || translations.es;
  const result = resolveKey(data, key);
  if (typeof result === 'object' && result !== null) return result as T;
  return {} as T;
}

export function getLocale(queryParams: URLSearchParams): string {
  const lang = queryParams.get('lang');
  if (lang === 'en' || lang === 'es') return lang;
  return 'es';
}
