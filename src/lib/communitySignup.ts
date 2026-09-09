/**
 * Lógica del alta en el tier community. El endpoint de Astro valida la entrada
 * en el edge y reenvía las altas válidas al backend cloud-api, que crea una
 * Stripe Checkout Session y devuelve su URL. El frontend redirige entonces al
 * usuario a Stripe.
 *
 * El endpoint del backend (POST /api/community/signup) es PÚBLICO (sin API
 * key), con un middleware de chi delante que ya aplica CORS/origin. Por eso
 * aquí NO se envía X-API-Key: verificado leyendo
 * cmd/server/main.go e internal/handlers/community.go el 2026-05-07.
 */

const RATE_LIMIT_TTL_MS = 60_000;

const EMAIL_MAX_LENGTH = 254;

// La misma regex que waitlist.ts: se mantienen sincronizadas a propósito.
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

  // Trampa honeypot: si un bot rellena el campo oculto `_hp` la capa de API
  // devuelve igualmente 200 OK pero nunca persiste. Solo defensivo.
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
 * Rate limiter en memoria. Best-effort: el estado se pierde cuando se desaloja
 * el isolate del Worker, y es aceptable: el backend tiene su propio límite por IP.
 */
const rateLimitMap = new Map<string, number>();

export function checkRateLimit(ip: string): boolean {
  if (!ip) return true; // no se puede identificar al cliente: fail open
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

export type SignupOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'already' }
  | { kind: 'error'; code: CommunityErrorCode };

/**
 * Convierte una respuesta cruda (status + body parseado) del endpoint edge de
 * community-signup en un resultado estructurado sobre el que el formulario
 * puede actuar. Es pura para poder testearla en node sin DOM.
 *
 * El caso en que fetch lanza (sin respuesta) lo trata el llamador como error
 * de red; esta función solo clasifica respuestas que sí llegaron.
 */
export function resolveSignupResponse(status: number, body: unknown): SignupOutcome {
  if (
    status === 200 &&
    body && typeof body === 'object' &&
    (body as { ok?: unknown }).ok === true &&
    typeof (body as { url?: unknown }).url === 'string'
  ) {
    return { kind: 'redirect', url: (body as { url: string }).url };
  }

  if (status === 409) {
    return { kind: 'already' };
  }

  const errStr =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : '';

  const known: CommunityErrorCode[] = [
    'invalid_email', 'invalid_region', 'rate_limited', 'already_subscribed', 'server_error',
  ];
  if (known.includes(errStr as CommunityErrorCode)) {
    return { kind: 'error', code: errStr as CommunityErrorCode };
  }
  return { kind: 'error', code: 'server_error' };
}

/** Traduce un código de error con la tabla de textos del formulario. */
export function errorMessageFor(
  code: CommunityErrorCode,
  t: { errorInvalidEmail: string; errorInvalidRegion: string; errorRateLimited: string; errorServer: string },
): string {
  switch (code) {
    case 'invalid_email': return t.errorInvalidEmail;
    case 'invalid_region': return t.errorInvalidRegion;
    case 'rate_limited': return t.errorRateLimited;
    default: return t.errorServer;
  }
}


/**
 * Llama al endpoint de alta community de cloud-api. Si va bien, el backend
 * devuelve la URL de una Stripe Checkout Session a la que redirigir al usuario.
 *
 * Nota: el endpoint del backend es PÚBLICO y NO requiere X-API-Key.
 * Enviar la clave sería inocuo pero innecesario; se omite para mantener la
 * llamada mínima.
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

// Helper solo para tests: vacía el mapa del rate limit entre tests.
export function __resetRateLimitForTests(): void {
  rateLimitMap.clear();
}
