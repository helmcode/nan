/**
 * Waitlist core logic — all member data lives in PostgreSQL via the cloud-api
 * backend. The landing page validates input on the edge and forwards valid
 * signups to the backend.
 *
 * Region model:
 *   EU signups take an arrival position (1, 2, 3…) assigned by the backend.
 *   LATAM and USA signups are stored as interest signals with position 0.
 */

const RATE_LIMIT_TTL_MS = 60_000;

// Practical upper bound per RFC 5321.
const EMAIL_MAX_LENGTH = 254;

// Intentionally simple — we're not reimplementing RFC 5322. No catastrophic
// backtracking: bounded character classes, no nested quantifiers.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Reserved / documentation / test domains that should never appear in a real
// signup. Covers RFC 2606 (example.com/net/org, .test/.invalid/.localhost/
// .example) plus a couple of common disposable "throwaway" domains we've seen
// hit the form. Server-side is the source of truth; the client mirrors this
// list only to show an early error without a round-trip.
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

export const REGIONS = ['EU', 'LATAM', 'USA'] as const;
export type WaitlistRegion = (typeof REGIONS)[number];

export type WaitlistStatus = 'registered' | 'interest';

export type WaitlistErrorCode =
  | 'invalid_email'
  | 'invalid_region'
  | 'rate_limited'
  | 'server_error';

/**
 * Member lifecycle states.
 *
 *   waitlist   Default. Signed up but not invited yet.
 *   invited    Onboarding email sent, waiting for subscription.
 *   subscribed Active member with subscription.
 *   declined   Manual: test/junk entries we keep for audit instead of deleting.
 *   banned     Manual: membership revoked.
 */
export const MEMBER_STATES = [
  'waitlist',
  'invited',
  'subscribed',
  'declined',
  'banned',
] as const;
export type MemberState = (typeof MEMBER_STATES)[number];

export interface JoinResult {
  ok: true;
  position: number;
  total: number;
  status: WaitlistStatus;
  region: WaitlistRegion;
}

export type ValidatedInput = {
  email: string;
  region: WaitlistRegion;
  honeypot: boolean;
};

export type ValidationResult =
  | { ok: true; input: ValidatedInput }
  | { ok: false; error: Extract<WaitlistErrorCode, 'invalid_email' | 'invalid_region'> };

export function validateWaitlistInput(raw: unknown): ValidationResult {
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

  if (typeof obj.region !== 'string' || !isWaitlistRegion(obj.region)) {
    return { ok: false, error: 'invalid_region' };
  }
  const region = obj.region;

  // Honeypot trap: if a bot fills the hidden `_hp` field we still return
  // 200 OK from the API layer but never persist. Defensive only — this is
  // not primary bot protection, just a cheap filter.
  const honeypot = typeof obj._hp === 'string' && obj._hp.trim().length > 0;

  return {
    ok: true,
    input: { email, region, honeypot },
  };
}

function isWaitlistRegion(value: string): value is WaitlistRegion {
  return (REGIONS as readonly string[]).includes(value);
}

/**
 * In-memory rate limiter. Entries auto-expire after RATE_LIMIT_TTL_MS.
 * Best-effort: state is lost when the Worker isolate is evicted, which is
 * acceptable — the backend has its own duplicate-email protection.
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

  // Lazy cleanup: purge expired entries when map grows large
  if (rateLimitMap.size > 1000) {
    for (const [key, exp] of rateLimitMap) {
      if (exp <= now) rateLimitMap.delete(key);
    }
  }

  return true;
}

/**
 * Registers a waitlist member via the cloud-api backend (PostgreSQL).
 * Returns a JoinResult-compatible response or throws on network/server errors.
 */
export async function registerViaBackend(
  apiURL: string,
  apiKey: string,
  input: { email: string; region: WaitlistRegion },
): Promise<JoinResult> {
  const response = await fetch(`${apiURL}/api/waitlist/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Origin': 'https://nan.builders',
    },
    body: JSON.stringify({ email: input.email, region: input.region }),
  });

  if (response.status === 409) {
    // Already registered — return a synthetic success so the frontend
    // shows the same "you're in" message rather than an error.
    return {
      ok: true,
      position: 0,
      total: 0,
      status: input.region === 'EU' ? 'registered' : 'interest',
      region: input.region,
    };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`cloud-api register failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { email: string; region: string; position: number };
  return {
    ok: true,
    position: data.position,
    total: data.position,
    status: data.region === 'EU' ? 'registered' : 'interest',
    region: data.region as WaitlistRegion,
  };
}
