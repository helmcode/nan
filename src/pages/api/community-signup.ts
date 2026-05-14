import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  checkRateLimit,
  signupViaBackend,
  validateCommunityInput,
  type CommunityErrorCode,
} from '../../lib/communitySignup';

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

function errorResponse(code: CommunityErrorCode, status: number): Response {
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

    const validation = validateCommunityInput(raw);
    if (!validation.ok) {
      return errorResponse(validation.error, 400);
    }

    const { email, region, honeypot } = validation.input;

    // Honeypot trap: reply 200 OK with a benign URL so bots get no signal.
    // Real users never reach this branch. The URL is a no-op landing page.
    if (honeypot) {
      return json({
        ok: true,
        url: 'https://nan.builders/?signup=processed',
      });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return errorResponse('rate_limited', 429);
    }

    const result = await signupViaBackend(env.CLOUD_API_URL, { email, region });
    if (!result.ok) {
      const status =
        result.error === 'already_subscribed'
          ? 409
          : result.error === 'rate_limited'
          ? 429
          : result.error === 'invalid_email' || result.error === 'invalid_region'
          ? 400
          : 500;
      return errorResponse(result.error, status);
    }

    return json({ ok: true, url: result.url });
  } catch (err) {
    // Intentionally opaque — do not leak internals in the response body.
    console.error('[api/community-signup] unexpected error', err);
    return errorResponse('server_error', 500);
  }
};
