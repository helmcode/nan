import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json } from '../../lib/apiResponse';
import { signupUrl, validateSignup } from '../../lib/signup';
import { checkSignupRateLimit, clientCountry, forwardSignup, mediaType } from '../../lib/signupServer';

export const prerender = false;

// The form posts here and not to cloud-api directly because the site's CSP is
// `connect-src 'self'`. This route validates with the same rules as the form,
// rate limits per IP, drops honeypot hits, and proxies to the public
// POST /api/auth/signup (platform/cloud-api/docs/OPEN-SIGNUP.md §2.3), which
// sends the English magic link.

const MAX_BODY_BYTES = 8 * 1024;

const accepted = () => json({ ok: true }, 202);

// What a browser sends when the form is submitted without our script.
const FORM_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data']);

export const POST: APIRoute = async ({ request }) => {
  const type = mediaType(request.headers.get('content-type'));
  if (FORM_TYPES.has(type)) {
    // No JS (script blocked or failed): the hero form has method="post" so the
    // data never lands in a URL. The body is never read nor echoed. A redirect
    // to cloud.nan.builders would be blocked by the page's `form-action 'self'`,
    // so the browser gets a plain 415 that says where to sign up instead.
    return new Response(
      `JavaScript is required to create an account from nan.builders. Sign up at ${signupUrl()}\n`,
      { status: 415, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
    );
  }
  if (type !== 'application/json') {
    return json({ ok: false, error: 'unsupported_media_type' }, 415);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: 'payload_too_large' }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'invalid_input', fields: {} }, 400);
  }

  const v = validateSignup(raw);
  if (!v.ok) return json({ ok: false, error: 'invalid_input', fields: v.fields }, 400);

  // Same answer as a real signup, so a bot learns nothing.
  if (v.honeypot) return accepted();

  const ip = request.headers.get('cf-connecting-ip') ?? '';
  if (!checkSignupRateLimit(ip)) return json({ ok: false, error: 'rate_limited' }, 429);

  const country = clientCountry(request.headers.get('cf-ipcountry'));
  const out = await forwardSignup(env.CLOUD_API_URL, v.input, { ip, country });
  switch (out.kind) {
    case 'accepted':
      return accepted();
    case 'invalid':
      return json({ ok: false, error: 'invalid_input', fields: out.fields }, 400);
    case 'rate_limited':
      return json({ ok: false, error: 'rate_limited' }, 429);
    default:
      return json({ ok: false, error: 'server_error' }, 502);
  }
};
