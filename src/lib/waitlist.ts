/**
 * Lógica central de la waitlist: todos los datos de miembros viven en
 * PostgreSQL a través del backend cloud-api. La landing valida la entrada en
 * el edge y reenvía las altas válidas al backend.
 *
 * Modelo de regiones:
 *   Las altas EU reciben una posición de llegada (1, 2, 3…) que asigna el backend.
 *   Las altas LATAM y USA se guardan como señales de interés con posición 0.
 */

const RATE_LIMIT_TTL_MS = 60_000;

// Límite práctico según la RFC 5321.
const EMAIL_MAX_LENGTH = 254;

// Simple a propósito: no estamos reimplementando la RFC 5322. Sin backtracking
// catastrófico: clases de caracteres acotadas, sin cuantificadores anidados.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Dominios reservados, de documentación o de test que nunca deberían aparecer
// en un alta real. Cubre la RFC 2606 (example.com/net/org, .test/.invalid/
// .localhost/.example) más un par de dominios desechables habituales que hemos
// visto llegar al formulario. El servidor es la fuente de verdad; el cliente
// replica esta lista solo para mostrar un error temprano sin ida y vuelta.
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
 * Estados del ciclo de vida de un miembro.
 *
 *   waitlist   Por defecto. Dado de alta pero aún sin invitar.
 *   invited    Email de onboarding enviado, esperando la suscripción.
 *   subscribed Miembro activo con suscripción.
 *   declined   Manual: entradas de test o basura que guardamos para auditar en vez de borrar.
 *   banned     Manual: membresía revocada.
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

  // Trampa honeypot: si un bot rellena el campo oculto `_hp` la capa de API
  // devuelve igualmente 200 OK pero nunca persiste. Solo defensivo: no es la
  // protección principal contra bots, solo un filtro barato.
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
 * Rate limiter en memoria. Las entradas caducan solas tras RATE_LIMIT_TTL_MS.
 * Best-effort: el estado se pierde cuando se desaloja el isolate del Worker, y
 * es aceptable: el backend tiene su propia protección contra emails duplicados.
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

  // Limpieza perezosa: purga las entradas caducadas cuando el mapa crece
  if (rateLimitMap.size > 1000) {
    for (const [key, exp] of rateLimitMap) {
      if (exp <= now) rateLimitMap.delete(key);
    }
  }

  return true;
}

/**
 * Registra un miembro de la waitlist a través del backend cloud-api (PostgreSQL).
 * Devuelve una respuesta compatible con JoinResult o lanza en errores de red o servidor.
 */
export async function registerViaBackend(
  apiURL: string,
  apiKey: string,
  input: { email: string; region: WaitlistRegion; wantsPremium?: boolean },
): Promise<JoinResult> {
  const response = await fetch(`${apiURL}/api/waitlist/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Origin': 'https://nan.builders',
    },
    body: JSON.stringify({ email: input.email, region: input.region, wantsPremium: input.wantsPremium ?? false }),
  });

  if (response.status === 409) {
    // Ya registrado: se devuelve un éxito sintético para que el frontend
    // muestre el mismo mensaje de "you're in" en vez de un error.
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
