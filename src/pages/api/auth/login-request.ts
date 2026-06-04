import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// Proxy same-origin para iniciar el login por magic link de NaN desde la landing
// del hackatón. El formulario de email vive en /hackaton (no tenemos el frontend
// de cloud), pero usa el MISMO endpoint de auth que la plataforma: reenvía a
// /api/auth/login/request del backend, que envía el enlace y, al validarlo,
// emite la cookie nan_session habitual (Domain=.nan.builders).
//
// Es necesario un proxy porque la CSP de la landing es `connect-src 'self'`: el
// navegador solo puede hacer fetch a este mismo origen, no a cloud-api.
export const POST: APIRoute = async ({ request }) => {
  const base = env.CLOUD_API_URL.replace(/\/$/, '');
  const target = `${base}/api/auth/login/request`;

  const headers = new Headers({
    'content-type': 'application/json',
    origin: 'https://nan.builders',
  });
  // El backend limita por IP usando X-Forwarded-For; sin esto, todas las
  // peticiones compartirían la IP del worker. Propagamos la IP real del cliente.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) { headers.set('x-forwarded-for', ip); headers.set('cf-connecting-ip', ip); }

  let resp: Response;
  try {
    resp = await fetch(target, {
      method: 'POST',
      headers,
      body: await request.text(),
    });
  } catch (err) {
    console.error('[api/auth/login-request] upstream error', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }

  const text = await resp.text();
  return new Response(text || '{}', {
    status: resp.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
