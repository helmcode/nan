import type { APIRoute } from 'astro';
import { backendURL, forwardHeaders, isAdminPath } from '../../../lib/events';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Proxy same-origin `/api/events/*` → `${EVENTS_API_URL ?? CLOUD_API_URL}/api/events/*` (SPEC §8.1).
 *
 * Existe porque la CSP de la landing es `connect-src 'self'`: las islas solo
 * pueden hacer fetch a este origen. Reenvía cookie de sesión e IP real; nunca
 * la admin key, y nunca rutas con un segmento `admin`.
 */
const handler: APIRoute = async ({ params, request, url }) => {
  const path = (params.path ?? '').toString();

  // No exponer endpoints de operación desde el navegador público. Se mantiene
  // como primera barrera aunque `backendURL` ya acote la ruta: dice
  // explícitamente qué es lo que no debe atravesar el proxy.
  if (isAdminPath(path)) {
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

  // Reenviar cuerpo y status; normalizar a JSON. Propagar Set-Cookie si lo hubiera.
  const text = await resp.text();
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
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
