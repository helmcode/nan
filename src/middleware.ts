import type { MiddlewareHandler } from 'astro';
import { withLang } from './lib/i18n';

/**
 * Redirección de los enlaces del esquema anterior.
 *
 * Hasta esta versión el idioma iba en un query param (`/community?lang=es`).
 * Ahora va en la ruta (`/es/community`), y `?lang=` no significa nada: sin esta
 * redirección, los enlaces que ya circulan por Discord llevarían a un
 * hispanohablante a la página en inglés, en silencio.
 *
 * Se responde 301 y no 302 a propósito: el cambio es permanente y así los
 * buscadores trasladan la señal a la URL nueva en vez de mantener las dos.
 *
 * Solo actúa sobre `?lang=es`. Un `?lang=en` apuntaba ya a la variante inglesa,
 * que es la que vive sin prefijo, así que basta con limpiar el parámetro. Y si
 * la ruta ya lleva `/es`, tampoco se vuelve a prefijar.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url } = context;
  const lang = url.searchParams.get('lang');

  if (lang !== 'es' && lang !== 'en') return next();

  const target = new URL(url);
  target.searchParams.delete('lang');

  // `getLocale` mira el primer segmento: si ya está prefijada, no se toca.
  const alreadyPrefixed = url.pathname.split('/')[1] === 'es';
  if (lang === 'es' && !alreadyPrefixed) {
    target.pathname = withLang(url.pathname, 'es');
  }

  // Nada que cambiar salvo el parámetro muerto: aun así conviene redirigir para
  // no servir la misma página en dos URLs distintas.
  if (target.href === url.href) return next();

  return context.redirect(target.pathname + target.search, 301);
};
