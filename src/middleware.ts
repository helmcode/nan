import type { MiddlewareHandler } from 'astro';
import { withLang } from './lib/i18n';

/**
 * Cabeceras de seguridad que el sitio no emitía.
 *
 * `frame-ancestors` es el motivo de que esto tenga que ser una cabecera y no
 * valga la CSP de `NanBase`: esa viaja en un `<meta http-equiv>`, y ahí la
 * directiva se ignora por especificación, así que el sitio era enmarcable a
 * pesar de tener CSP. Las demás son cabeceras y punto, no tienen equivalente en
 * `<meta>`.
 *
 * La CSP que se manda aquí lleva SOLO `frame-ancestors`: cada política se
 * evalúa por separado, así que esta no interfiere con la del `<meta>` ni hay que
 * mantener las dos listas en sincronía. `X-Frame-Options` va como respaldo para
 * los navegadores que no miran `frame-ancestors`.
 *
 * `Permissions-Policy` apaga lo que el sitio no usa; si algún día hace falta la
 * cámara o el micrófono, se quita de aquí.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

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
 *
 * Devuelve `null` si no hay nada que redirigir.
 */
function langRedirect(context: Parameters<MiddlewareHandler>[0]): Response | null {
  const { url } = context;
  const lang = url.searchParams.get('lang');

  if (lang !== 'es' && lang !== 'en') return null;

  // Las rutas de API no tienen variante por idioma, y un 301 convertiría un
  // POST en GET: el navegador reintenta la redirección sin cuerpo y sin método.
  // Hoy ningún cliente llama con `?lang=`, así que esto es defensa en
  // profundidad, no un arreglo de algo que se vea.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;

  const target = new URL(url);
  target.searchParams.delete('lang');

  // `getLocale` mira el primer segmento: si ya está prefijada, no se toca.
  const alreadyPrefixed = url.pathname.split('/')[1] === 'es';
  if (lang === 'es' && !alreadyPrefixed) {
    target.pathname = withLang(url.pathname, 'es');
  }

  // Nada que cambiar salvo el parámetro muerto: aun así conviene redirigir para
  // no servir la misma página en dos URLs distintas.
  if (target.href === url.href) return null;

  return context.redirect(target.pathname + target.search, 301);
}

/**
 * OJO con prerenderizar: el middleware NO corre en las rutas prerenderizadas
 * (Astro lo ejecuta en tiempo de build para esas), así que activar
 * `prerender = true` en una página la deja a la vez sin la redirección de
 * `?lang=` y sin estas cabeceras, en silencio y sin que ningún test lo note.
 * Hoy no hay ninguna prerenderizada, y por eso esto vale para todo el sitio.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = langRedirect(context) ?? (await next());

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
};
