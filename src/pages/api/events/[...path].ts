import type { APIRoute } from 'astro';
import { backendURL, forwardHeaders, hasSessionCookie, isAdminPath } from '../../../lib/events';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Proxy same-origin `/api/events/*` → `${CLOUD_API_URL}/api/events/*` (SPEC §8.1).
 *
 * Existe porque la CSP de la landing es `connect-src 'self'`: las islas solo
 * pueden hacer fetch a este origen. Reenvía cookie de sesión e IP real; nunca
 * la admin key. Las rutas con un segmento `admin` solo pasan con cookie de
 * sesión (SPEC v3 §8): el backend decide si esa sesión es de staff y responde
 * 401/403 si no; el panel `/events/admin` es el que las usa.
 */
const handler: APIRoute = async ({ params, request, url }) => {
  const path = (params.path ?? '').toString();

  // Sin sesión, los endpoints de operación no existen de cara al exterior:
  // 404 sin tocar el backend. Se mantiene como primera barrera aunque
  // `backendURL` ya acote la ruta.
  if (isAdminPath(path) && !hasSessionCookie(request)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  // `null` = la ruta pedida no es una ruta simple bajo /api/events/. No se
  // toca el backend: un `..` codificado se resolvía fuera del prefijo.
  const target = backendURL(path, url.search);
  if (target === null) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  const init: RequestInit = {
    method: request.method,
    headers: forwardHeaders(request),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  let resp: Response;
  try {
    resp = await fetch(target, init);
  } catch (err) {
    console.error('[api/events] upstream error', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }

  // Reenviar cuerpo y status; normalizar a JSON salvo el CSV de
  // `participants/export.csv`. Content-Disposition se conserva para las
  // descargas del panel (`export?download=1`). Propagar Set-Cookie.
  const text = await resp.text();
  const upstreamType = resp.headers.get('content-type') ?? '';
  const headers = new Headers({
    'content-type': /^text\/csv\b/i.test(upstreamType) ? upstreamType : 'application/json',
    'cache-control': 'no-store',
  });
  const disposition = resp.headers.get('content-disposition');
  if (disposition) headers.set('content-disposition', disposition);
  // getSetCookie() devuelve un array sin colapsar comas (WHATWG); preserva
  // múltiples cookies (login + refresh, handoff de onboarding, etc.).
  for (const cookie of resp.headers.getSetCookie()) headers.append('set-cookie', cookie);
  return new Response(text || '{}', { status: resp.status, headers });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
