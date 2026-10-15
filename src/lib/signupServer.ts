/**
 * Server side of the open signup (Worker only, never shipped to the browser):
 * per-IP rate limit and the call to cloud-api's public POST /api/auth/signup.
 *
 * The validation itself lives in lib/signup.ts, shared with the form.
 */
import { sanitizeFieldErrors, type FieldErrors, type SignupInput } from './signup';

/**
 * Per-IP fixed window. In-memory and per isolate, so it is best effort: it
 * stops one browser tab or a naive script from hammering the endpoint, while
 * cloud-api enforces its own per-IP and per-email limits behind it.
 */
export const SIGNUP_RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 } as const;

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkSignupRateLimit(ip: string, now = Date.now()): boolean {
  if (!ip) return true; // cannot identify the client: the backend still limits
  const w = windows.get(ip);
  if (!w || w.resetAt <= now) {
    windows.set(ip, { count: 1, resetAt: now + SIGNUP_RATE_LIMIT.windowMs });
    if (windows.size > 5000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return true;
  }
  if (w.count >= SIGNUP_RATE_LIMIT.limit) return false;
  w.count++;
  return true;
}

/** Test hook. */
export function resetSignupRateLimit(): void {
  windows.clear();
}

export type UpstreamOutcome =
  | { kind: 'accepted' }
  | { kind: 'invalid'; fields: FieldErrors }
  | { kind: 'rate_limited' }
  | { kind: 'error' };

/**
 * Forwards a validated signup. Public endpoint: no API key. The Origin is the
 * one cloud-api allowlists for the site, and the client IP is propagated so
 * the backend's per-IP limit sees the person and not the Worker.
 */
export async function forwardSignup(apiBase: string, input: SignupInput, ip: string): Promise<UpstreamOutcome> {
  const headers = new Headers({ 'content-type': 'application/json', origin: 'https://nan.builders' });
  if (ip) {
    headers.set('x-forwarded-for', ip);
    headers.set('cf-connecting-ip', ip);
  }

  let res: Response;
  try {
    if (!apiBase) throw new Error('CLOUD_API_URL is not set');
    res = await fetch(`${apiBase.replace(/\/$/, '')}/api/auth/signup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, _hp: '' }),
    });
  } catch (err) {
    console.error('[api/signup] upstream unreachable', err instanceof Error ? err.message : 'error');
    return { kind: 'error' };
  }

  // Every success is the same answer: the backend never tells new from known.
  if (res.ok) return { kind: 'accepted' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const fields = sanitizeFieldErrors(body?.fields);
    if (typeof body?.field === 'string') Object.assign(fields, sanitizeFieldErrors({ [body.field]: 'invalid' }));
    return { kind: 'invalid', fields };
  }
  console.error('[api/signup] upstream status', res.status);
  return { kind: 'error' };
}
