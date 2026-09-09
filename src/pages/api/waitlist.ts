import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  checkRateLimit,
  registerViaBackend,
  validateWaitlistInput,
  type WaitlistErrorCode,
} from '../../lib/waitlist';
import { sendConfirmationEmail } from '../../lib/email';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function errorResponse(code: WaitlistErrorCode, status: number): Response {
  return json({ ok: false, error: code }, status);
}

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? '';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return errorResponse('invalid_email', 415);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return errorResponse('invalid_email', 400);
    }

    const validation = validateWaitlistInput(raw);
    if (!validation.ok) {
      return errorResponse(validation.error, 400);
    }

    const { email, region, honeypot } = validation.input;
    // Interés en GLM 5.3 premium: las altas desde la tarjeta de precio premium
    // (?premium=1) llevan el flag hasta la fila del miembro para que el panel
    // de admin pueda distinguirlas e invitarlas al tier premium.
    const wantsPremium: boolean = !!(raw && typeof raw === 'object' && (raw as Record<string, unknown>).wantsPremium === true);

    // Trampa honeypot: responde 200 OK sin persistir para que los bots no reciban señal.
    if (honeypot) {
      return json({
        ok: true,
        position: 0,
        total: 0,
        status: 'registered',
        region,
      });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return errorResponse('rate_limited', 429);
    }

    const result = await registerViaBackend(env.CLOUD_API_URL, env.CLOUD_API_WAITLIST_KEY, { email, region, wantsPremium });

    // Envía el email de confirmación (best-effort: si el email falla, el alta no falla).
    // Hay que hacer await: los Workers terminan tras la respuesta y matan los fetch en vuelo.
    if (result.ok && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      try {
        await sendConfirmationEmail({
          to: email,
          region,
          apiKey: env.RESEND_API_KEY,
          from: env.RESEND_FROM_EMAIL,
        });
      } catch (err) {
        console.error('[api/waitlist] confirmation email failed', err);
      }
    }

    return json(result);
  } catch (err) {
    // Opaco a propósito: no filtrar internos en el cuerpo de la respuesta.
    console.error('[api/waitlist] unexpected error', err);
    return errorResponse('server_error', 500);
  }
};
