/**
 * Validación y parseo de la waitlist en el CLIENTE.
 *
 * Antes vivía en `components/landing/waitlistForm.helpers.ts`, nombre heredado
 * de una isla Preact que ya no existe: quedaba un fichero en `components/`
 * que no era ningún componente. El par natural es `lib/waitlist.ts`, que es el
 * lado servidor.
 *
 * REGLA: el espejo de dominios y TLD bloqueados de aquí tiene que coincidir con
 * el de `lib/waitlist.ts`. Si divergen, el formulario acepta cosas que el
 * servidor rechaza (o al revés) y el usuario ve un error que no entiende.
 *
 * La tercera copia de `isValidEmail` y `REGIONS` vivía en
 * `components/landing/CommunitySignupForm.tsx` y se fue con el formulario de la
 * página de comunidad, así que quedan dos: esta y la del servidor. Conviene no
 * añadir una tercera.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (email.length === 0 || email.length > 254) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  if (isBlockedEmailDomain(email)) return false;
  return true;
}

export function isWaitlistRegion(value: string): value is WaitlistRegion {
  return (REGIONS as readonly string[]).includes(value);
}

export type WaitlistStatus = 'registered' | 'interest';

export type WaitlistSuccess = {
  ok: true;
  position: number;
  total: number;
  status: WaitlistStatus;
  region: WaitlistRegion;
};

export type WaitlistErrorCode =
  | 'invalid_email'
  | 'invalid_region'
  | 'rate_limited'
  | 'server_error'
  | 'network_error';

export type WaitlistError = {
  ok: false;
  error: WaitlistErrorCode;
};

export type WaitlistResponse = WaitlistSuccess | WaitlistError;

export function parseWaitlistResponse(
  status: number,
  body: unknown,
): WaitlistResponse {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'server_error' };
  }
  const data = body as Record<string, unknown>;

  if (status === 200 && data.ok === true) {
    const rawStatus = data.status;
    const parsedStatus: WaitlistStatus =
      rawStatus === 'interest' ? 'interest' : 'registered';
    const rawRegion = typeof data.region === 'string' ? data.region : 'EU';
    const region: WaitlistRegion = isWaitlistRegion(rawRegion) ? rawRegion : 'EU';
    return {
      ok: true,
      position: typeof data.position === 'number' ? data.position : 0,
      total: typeof data.total === 'number' ? data.total : 0,
      status: parsedStatus,
      region,
    };
  }

  const errorCode = typeof data.error === 'string' ? data.error : '';
  switch (errorCode) {
    case 'invalid_email':
    case 'invalid_region':
    case 'rate_limited':
      return { ok: false, error: errorCode };
    case 'server_error':
      return { ok: false, error: 'server_error' };
    default:
      return { ok: false, error: 'server_error' };
  }
}

// ---------------------------------------------------------------------------
// Mensajes
//
// Los TEXTOS los pone el componente en `data-msgs` (serializados del
// diccionario, para no arrastrar todo el i18n al bundle de cliente). Lo que vive
// aquí es la DECISIÓN de qué texto toca y con qué forma, que es lo que tiene
// reglas: el rate limit no es un error genérico, y una región sin apertura no
// tiene puesto que enseñar.
//
// Antes esto estaba dentro del manejador de `submit`, o sea intestable sin DOM.
// ---------------------------------------------------------------------------

/** Los textos que el componente serializa en data-msgs. */
export interface WaitlistMessages {
  okRegistered: string;
  okInterest: string;
  okPosition: string;
  okText: string;
  errEmail: string;
  errRegion: string;
  errRateLimited: string;
  errNetwork: string;
  errGeneric: string;
}

/**
 * Texto para un fallo, y si el foco debe volver al campo de email.
 *
 * El backend distingue el rate limit del error genérico: mostrar "algo se ha
 * roto" para todo es mentira y no dice qué hacer.
 */
export function waitlistErrorText(
  error: WaitlistErrorCode,
  m: WaitlistMessages,
): { text: string; focusEmail: boolean } {
  switch (error) {
    case 'invalid_email':
      return { text: m.errEmail, focusEmail: true };
    case 'invalid_region':
      return { text: m.errRegion, focusEmail: false };
    case 'rate_limited':
      return { text: m.errRateLimited, focusEmail: false };
    case 'network_error':
      return { text: m.errNetwork, focusEmail: false };
    default:
      return { text: m.errGeneric, focusEmail: false };
  }
}

/**
 * Texto para un alta correcta.
 *
 * EU recibe una posición de llegada. LATAM y USA se guardan como interés con
 * posición 0: ahí no hay puesto que enseñar, así que no se inventa uno.
 */
export function waitlistSuccessText(result: WaitlistSuccess, m: WaitlistMessages): string {
  if (result.status === 'interest') return m.okInterest;

  const pos =
    result.position && result.total
      ? ` ${m.okPosition} ${String(result.position).padStart(3, '0')} / ${result.total} ·`
      : '';
  return `${m.okRegistered}${pos} ${m.okText}`;
}
