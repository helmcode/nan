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

    // Honeypot trap: reply 200 OK without persisting so bots get no signal.
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

    const result = await registerViaBackend(env.CLOUD_API_URL, env.CLOUD_API_WAITLIST_KEY, { email, region });

    // Send confirmation email (best-effort — don't fail the signup if email fails).
    // Must await: Workers terminate after the response, killing in-flight fetches.
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
    // Intentionally opaque — do not leak internals in the response body.
    console.error('[api/waitlist] unexpected error', err);
    return errorResponse('server_error', 500);
  }
};
