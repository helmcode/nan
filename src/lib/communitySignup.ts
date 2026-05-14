/**
 * Community-tier signup logic. The Astro endpoint validates input on the edge
 * and forwards valid signups to the cloud-api backend, which creates a Stripe
 * Checkout Session and returns its URL. The frontend then redirects the user
 * to Stripe.
 *
 * The backend endpoint (POST /api/community/signup) is PUBLIC (no API key),
 * fronted by chi middleware that already enforces CORS/origin. We therefore
 * do NOT send X-API-Key here — verified by reading
 * cmd/server/main.go and internal/handlers/community.go on 2026-05-07.
 */

const RATE_LIMIT_TTL_MS = 60_000;

const EMAIL_MAX_LENGTH = 254;

// Same regex as waitlist.ts — kept in sync intentionally.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const BLOCKED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'mail.com',
]);

const BLOCKED_EMAIL_TLDS: readonly string[] = [
  'test',
  'invalid',
  'localhost',
  'example',
];

function isBlockedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true;
  const lastDot = domain.lastIndexOf('.');
  const tld = lastDot === -1 ? domain : domain.slice(lastDot + 1);
  return BLOCKED_EMAIL_TLDS.includes(tld);
}

export const COMMUNITY_REGIONS = ['EU', 'LATAM', 'USA'] as const;
export type CommunityRegion = (typeof COMMUNITY_REGIONS)[number];

export type CommunityErrorCode =
  | 'invalid_email'
  | 'invalid_region'
  | 'rate_limited'
  | 'already_subscribed'
  | 'server_error';

export type CommunityValidatedInput = {
  email: string;
  region: CommunityRegion;
  honeypot: boolean;
};

export type CommunityValidationResult =
  | { ok: true; input: CommunityValidatedInput }
  | { ok: false; error: Extract<CommunityErrorCode, 'invalid_email' | 'invalid_region'> };

export function validateCommunityInput(raw: unknown): CommunityValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_email' };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.email !== 'string') {
    return { ok: false, error: 'invalid_email' };
  }
  const email = obj.email.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (isBlockedEmailDomain(email)) {
    return { ok: false, error: 'invalid_email' };
  }

  if (typeof obj.region !== 'string' || !isCommunityRegion(obj.region)) {
    return { ok: false, error: 'invalid_region' };
  }
  const region = obj.region;

  // Honeypot trap: if a bot fills the hidden `_hp` field we still return
  // 200 OK from the API layer but never persist. Defensive only.
  const honeypot = typeof obj._hp === 'string' && obj._hp.trim().length > 0;

  return {
    ok: true,
    input: { email, region, honeypot },
  };
}

export function isCommunityRegion(value: string): value is CommunityRegion {
  return (COMMUNITY_REGIONS as readonly string[]).includes(value);
}

/**
 * In-memory rate limiter. Best-effort: state is lost when the Worker isolate
 * is evicted, which is acceptable — the backend has its own per-IP limiter.
 */
const rateLimitMap = new Map<string, number>();

export function checkRateLimit(ip: string): boolean {
  if (!ip) return true; // cannot identify client — fail open
  const now = Date.now();

  const expiresAt = rateLimitMap.get(ip);
  if (expiresAt !== undefined && expiresAt > now) {
    return false;
  }

  rateLimitMap.set(ip, now + RATE_LIMIT_TTL_MS);

  if (rateLimitMap.size > 1000) {
    for (const [key, exp] of rateLimitMap) {
      if (exp <= now) rateLimitMap.delete(key);
    }
  }

  return true;
}

export type CommunitySignupSuccess = { ok: true; url: string };
export type CommunitySignupFailure = { ok: false; error: CommunityErrorCode };
export type CommunitySignupResult = CommunitySignupSuccess | CommunitySignupFailure;

/**
 * Calls the cloud-api community signup endpoint. On success, the backend
 * returns a Stripe Checkout Session URL the user should be redirected to.
 *
 * Note: the backend endpoint is PUBLIC and does NOT require X-API-Key.
 * Sending the key would be harmless but unnecessary; we omit it to keep the
 * call minimal.
 */
export async function signupViaBackend(
  apiURL: string,
  input: { email: string; region: CommunityRegion },
): Promise<CommunitySignupResult> {
  let response: Response;
  try {
    response = await fetch(`${apiURL}/api/community/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://nan.builders',
      },
      body: JSON.stringify({ email: input.email, region: input.region }),
    });
  } catch {
    return { ok: false, error: 'server_error' };
  }

  if (response.status === 200) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: 'server_error' };
    }
    if (data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string') {
      return { ok: true, url: (data as { url: string }).url };
    }
    return { ok: false, error: 'server_error' };
  }

  if (response.status === 409) {
    return { ok: false, error: 'already_subscribed' };
  }

  if (response.status === 429) {
    return { ok: false, error: 'rate_limited' };
  }

  if (response.status === 400) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const errStr =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : '';
    if (errStr.includes('email')) return { ok: false, error: 'invalid_email' };
    if (errStr.includes('region')) return { ok: false, error: 'invalid_region' };
    return { ok: false, error: 'invalid_email' };
  }

  return { ok: false, error: 'server_error' };
}

// Test-only helper: clear the rate-limit map between tests.
export function __resetRateLimitForTests(): void {
  rateLimitMap.clear();
}
