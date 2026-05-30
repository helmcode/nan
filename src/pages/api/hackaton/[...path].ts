import type { APIRoute } from 'astro';
import { backendURL, forwardHeaders, isAdminPath } from '../../../lib/hackaton';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const handler: APIRoute = async ({ params, request, url }) => {
  const path = (params.path ?? '').toString();

  // No exponer endpoints de operación desde el navegador público (§9.2).
  if (isAdminPath(path)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  const target = backendURL(path, url.search);
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
    console.error('[api/hackaton] upstream error', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }

  // Reenviar cuerpo y status; normalizar a JSON. Propagar Set-Cookie si lo hubiera.
  const text = await resp.text();
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  const setCookie = resp.headers.get('set-cookie');
  if (setCookie) headers.append('set-cookie', setCookie);
  return new Response(text || '{}', { status: resp.status, headers });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
