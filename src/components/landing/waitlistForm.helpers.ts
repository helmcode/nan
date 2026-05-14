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

export const REGION_LABELS: Record<WaitlistRegion, string> = {
  EU: 'Europa',
  LATAM: 'LATAM',
  USA: 'USA',
};

export const REGION_LABELS_EN: Record<WaitlistRegion, string> = {
  EU: 'Europe',
  LATAM: 'LATAM',
  USA: 'USA',
};

export function getRegionLabels(locale: string): Record<WaitlistRegion, string> {
  return locale === 'en' ? REGION_LABELS_EN : REGION_LABELS;
}

export interface WaitlistTranslations {
  registered: string;
  interest: string;
  followUp: string;
  confirmation: {
    label: string;
    heading: string;
    p1: string;
    p2: string;
    cancel: string;
    confirm: string;
    submitting: string;
  };
  honeypot: string;
  email: {
    label: string;
    placeholder: string;
  };
  region: {
    label: string;
    default: string;
  };
  submit: {
    idle: string;
    submitting: string;
  };
  footer: string;
  errors: {
    invalidEmail: string;
    invalidRegion: string;
    rateLimited: string;
    networkError: string;
    serverError: string;
  };
}

export function getTranslations(locale: string): WaitlistTranslations {
  if (locale === 'en') {
    return {
      registered: '// registered',
      interest: '// interest registered',
      followUp: "We don't send newsletters. We'll only write when we open payments.",
      confirmation: {
        label: '// confirmation',
        heading: 'Are you sure you want to join?',
        p1: "You're joining the waitlist for a paid private community. When we open payments, a monthly subscription will be required to access shared GPUs and the models chosen by the community.",
        p2: "We only want people with real intention to pay to join. If you're just curious, better not join.",
        cancel: 'Cancel',
        confirm: 'Yes, sign me up',
        submitting: 'Sending…',
      },
      honeypot: 'Do not fill this field',
      email: {
        label: 'email',
        placeholder: 'you@email.com',
      },
      region: {
        label: 'region',
        default: 'Select your region',
      },
      submit: {
        idle: 'Join the waitlist',
        submitting: 'Sending…',
      },
      footer: 'No spam. No newsletters. We only write when we open payments.',
      errors: {
        invalidEmail: 'Invalid email. Check the format.',
        invalidRegion: 'Select a region.',
        rateLimited: 'Too many attempts. Wait a minute.',
        networkError: 'No connection. Try again.',
        serverError: 'Something went wrong on the server. Try again in a moment.',
      },
    };
  }
  return {
    registered: '// registered',
    interest: '// interest registered',
    followUp: 'No enviamos newsletters. Solo escribiremos cuando abramos pagos.',
    confirmation: {
      label: '// confirmación',
      heading: '¿Seguro que quieres apuntarte?',
      p1: 'Te estás apuntando a la waitlist de una comunidad privada de pago. Cuando abramos pagos, se requerirá una suscripción mensual para tener acceso a las GPUs compartidas y a los modelos que elija la comunidad.',
      p2: 'Solo queremos que se apunten personas con intención real de pagar. Si solo tienes curiosidad, mejor no te apuntes.',
      cancel: 'Cancelar',
      confirm: 'Sí, apuntarme',
      submitting: 'Enviando…',
    },
    honeypot: 'Do not fill this field',
    email: {
      label: 'email',
      placeholder: 'tu@email.com',
    },
    region: {
      label: 'región',
      default: 'Selecciona tu región',
    },
    submit: {
      idle: 'Únete a la waitlist',
      submitting: 'Enviando…',
    },
    footer: 'Sin spam. Sin newsletters. Solo te escribimos cuando abramos pagos.',
    errors: {
      invalidEmail: 'Email inválido. Revisa el formato.',
      invalidRegion: 'Selecciona una región.',
      rateLimited: 'Demasiados intentos. Espera un minuto.',
      networkError: 'Sin conexión. Vuelve a intentarlo.',
      serverError: 'Algo falló en el server. Vuelve a intentarlo en un momento.',
    },
  };
}

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

export function successMessage(result: WaitlistSuccess, _t: WaitlistTranslations): string {
  if (result.status === 'interest') {
    const regionLabel = REGION_LABELS[result.region];
    return `Anotado. Estamos disponibles para ${regionLabel}. Te avisamos en cuanto abramos pagos.`;
  }
  return 'Estás en la lista. Iremos aceptando miembros por orden de llegada cuando abramos pagos.';
}

export function errorMessage(result: WaitlistError, t: WaitlistTranslations): string {
  switch (result.error) {
    case 'invalid_email':
      return t.errors.invalidEmail;
    case 'invalid_region':
      return t.errors.invalidRegion;
    case 'rate_limited':
      return t.errors.rateLimited;
    case 'network_error':
      return t.errors.networkError;
    case 'server_error':
    default:
      return t.errors.serverError;
  }
}
