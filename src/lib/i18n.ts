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
 * El idioma va en la RUTA, no en un query param: inglés en `/`, español bajo
 * `/es/`. Los query params son invisibles para los buscadores como señal de
 * idioma y no pueden llevar hreflang, así que `/es/...` es lo que se indexa
 * y se enlaza.
 *
 * Acepta una URL o un pathname para poder pasarle `Astro.url` directamente.
 */
export function getLocale(source: URL | string): Locale {
  const pathname = typeof source === 'string' ? source : source.pathname;
  return pathname.split('/')[1] === 'es' ? 'es' : 'en';
}

/**
 * Conserva el idioma en la navegación interna: withLang('/hackaton/me', 'es')
 * → '/es/hackaton/me'. El inglés es el idioma por defecto y no lleva prefijo.
 */
export function withLang(path: string, locale: string): string {
  if (locale !== 'es') return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? '/es' : `/es${clean}`;
}

/** La misma página en el otro idioma, para el selector de idioma. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const stripped = pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return target === 'en' ? stripped : withLang(stripped, 'es');
}

// --------------------------------------------------------------------------
// Diccionario del rediseño
//
// Todo el copy del rediseño vive bajo la clave `nan` de i18n/{en,es}.json, para
// no pisar el copy de los componentes que todavía no se han migrado. `useT`
// devuelve ese subárbol ya tipado a partir de en.json, así que los componentes
// portados desde nan-site siguen escribiéndose igual:
//
//   const tt = useT(getLang(Astro.url)).hero;
//
// Cuando no quede ningún componente viejo, esto se puede aplanar y fusionar con
// t()/tObj().
// --------------------------------------------------------------------------

export type NanDict = typeof enData.nan;

export function useT(locale: string): NanDict {
  return (locale === 'es' ? (esData as unknown as typeof enData) : enData).nan;
}

/** Alias del nombre que usaban los componentes de nan-site. */
export const getLang = getLocale;

/**
 * Etiqueta de una especialidad o un nivel. En v3 las especialidades y los
 * niveles los escribe quien organiza el evento, así que `events.options` solo
 * traduce los de siempre; el resto se enseña tal cual, pero con la inicial en
 * mayúscula para que "devops" no desentone al lado de "Frontend" en la misma
 * lista. Los valores que ya vienen con mayúscula ("ML/IA") no se tocan.
 */
export function optionLabel(options: Record<string, string>, value?: string | null): string {
  if (!value) return '';
  const known = options[value];
  if (known) return known;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
