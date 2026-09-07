import { env } from 'cloudflare:workers';

/**
 * Panel de administración de eventos (SPEC v3 §8): guardia SSR de staff y
 * cliente de la API de administración del servidor de eventos.
 *
 * El panel vive en `/events/admin/*`, solo en español y sin variante `/es/`.
 * La autorización real la hace el backend con la cookie (§2.3); esta guardia
 * existe para que un visitante sin sesión de staff vea un 404 en vez del
 * esqueleto de una pantalla que después falla en cada llamada.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export const ADMIN_BASE = '/events/admin';

/** Pantallas del panel por evento, en el orden de la navegación (§8). */
export const ADMIN_SCREENS = [
  { key: 'evento', path: '', label: 'Evento' },
  { key: 'participantes', path: '/participantes', label: 'Participantes' },
  { key: 'equipos', path: '/equipos', label: 'Equipos' },
  { key: 'entregas', path: '/entregas', label: 'Entregas' },
  { key: 'votos', path: '/votos', label: 'Votos' },
  { key: 'auditoria', path: '/auditoria', label: 'Auditoría' },
] as const;
export type AdminScreen = (typeof ADMIN_SCREENS)[number]['key'];

/** URL de una pantalla del panel: `adminHref()` es la lista, `adminHref(slug, 'equipos')` el tablero. */
export function adminHref(slug?: string, screen: AdminScreen = 'evento'): string {
  if (!slug) return ADMIN_BASE;
  const s = ADMIN_SCREENS.find((x) => x.key === screen) ?? ADMIN_SCREENS[0];
  return `${ADMIN_BASE}/${slug}${s.path}`;
}

/** Lo que el panel necesita saber de la sesión (subconjunto de GET /api/auth/me). */
export interface StaffSession {
  email: string;
  userUUID: string;
}

function apiBase(): string {
  return env.CLOUD_API_URL.replace(/\/$/, '');
}

function ssrHeaders(cookie: string, extra?: Record<string, string>): Record<string, string> {
  return { origin: 'https://nan.builders', cookie, ...extra };
}

/**
 * Sesión de staff a partir de la cookie de la petición. `null` si no hay
 * cookie, la sesión no vale, la cuenta no es staff o la plataforma no
 * responde: en todos los casos el panel no existe para ese visitante.
 */
export async function fetchStaffSession(cookie: string): Promise<StaffSession | null> {
  if (!cookie || !cookie.includes('nan_session')) return null;
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, { headers: ssrHeaders(cookie) });
    if (!res.ok) return null;
    const me = (await res.json()) as { role?: string; email?: string; userUUID?: string } | null;
    if (me?.role !== 'staff') return null;
    return { email: me.email ?? '', userUUID: me.userUUID ?? '' };
  } catch {
    return null;
  }
}

/** Resultado de `resolveAdminRoute`: sesión de staff o Response 404 a devolver. */
export type AdminRoute =
  | { staff: StaffSession; cookie: string; notFound: null }
  | { staff: null; cookie: string; notFound: Response };

/**
 * Guardia de las rutas `/events/admin/*`. Se llama desde el FICHERO DE RUTA
 * (el envoltorio), nunca desde el cuerpo `_x.astro`: `Astro.rewrite` solo
 * surte efecto en páginas, endpoints y middleware. El envoltorio devuelve
 * `notFound` si toca y pasa `staff` y `cookie` al cuerpo como props.
 *
 * 404 y no 403 a propósito (SPEC v3 §8): el panel no se anuncia a quien no
 * es staff, igual que los eventos en `draft` no existen de cara al exterior.
 */
export async function resolveAdminRoute(
  astro: { request: Request; rewrite: (to: string) => Promise<Response> },
): Promise<AdminRoute> {
  const cookie = astro.request.headers.get('cookie') ?? '';
  const staff = await fetchStaffSession(cookie);
  if (staff) return { staff, cookie, notFound: null };
  return { staff: null, cookie, notFound: await astro.rewrite('/404') };
}

/** Lo que devuelve `GET /{slug}/admin` (API.md §6.1); `event` es el `event.json` íntegro. */
export interface AdminEventView {
  event: {
    slug: string;
    kind: string;
    name: string;
    description: string;
    rules: string;
    prize: string;
    format: string;
    status: string;
    /** Solo en `cancelled`: estado al que se puede volver (SPEC v3 §4.2). */
    previous_status?: string;
    archived_at: string | null;
    modules: { registration: boolean; teams: boolean; submissions: boolean; voting: boolean };
    automation: { date_transitions: boolean };
    dates: Record<string, string | null>;
    registration: { capacity: number; reserve_capacity: number; discord_user: string; specialties: string[]; levels: string[] };
    team?: { size: number; min_size: number; max_teams: number } | null;
    submission: { fields: Record<string, string>; checks: string[]; prize_requires: string[]; gallery_visibility: string };
    voting: { enabled: boolean; open: boolean; leaderboard_public: boolean; vote_weight: number; auto_max: number };
    created_at: string;
    updated_at: string;
    [k: string]: unknown;
  };
  phase: string;
  windows: { registration: { open: boolean }; submission: { open: boolean }; voting: { open: boolean }; gallery: { visible: boolean }; leaderboard: { visible: boolean } };
  counts: { registered: number; reserve: number; withdrawn: number; teams: number; submissions: number; votes: number };
  warnings: string[];
}

/** Fila de `GET /admin/events` (API.md §5). */
export interface AdminEventSummary {
  slug: string;
  kind: string;
  name: string;
  format: string;
  status: string;
  phase: string;
  archived_at: string | null;
  dates: Record<string, string | null>;
  counts: AdminEventView['counts'];
  warnings: string[];
  updated_at: string;
}

/** Resultado de `resolveAdminEventRoute`: staff + ficha del evento, o Response 404. */
export type AdminEventRoute =
  | { staff: StaffSession; cookie: string; slug: string; view: AdminEventView; notFound: null }
  | { staff: StaffSession | null; cookie: string; slug: string; view: null; notFound: Response };

/**
 * Guardia de las rutas `/events/admin/{slug}/*`: además del staff, carga la
 * ficha del evento (`GET /{slug}/admin`, que ve `draft` y archivados) y
 * responde 404 si no existe. Igual que `resolveAdminRoute`, solo desde el
 * fichero de ruta.
 */
export async function resolveAdminEventRoute(
  astro: { request: Request; rewrite: (to: string) => Promise<Response>; params: Record<string, string | undefined> },
): Promise<AdminEventRoute> {
  const slug = astro.params.slug ?? '';
  const route = await resolveAdminRoute(astro);
  if (route.notFound) return { ...route, slug, view: null };
  const res = await adminFetch<AdminEventView>(route.cookie, `${slug}/admin`);
  if (!res.ok || !res.data?.event) {
    return { staff: route.staff, cookie: route.cookie, slug, view: null, notFound: await astro.rewrite('/404') };
  }
  return { staff: route.staff, cookie: route.cookie, slug: res.data.event.slug, view: res.data, notFound: null };
}

/**
 * Recarga la ficha después de un POST que escribe y pinta el resultado en la
 * misma respuesta, sin redirigir (la importación CSV): `resolveAdminEventRoute`
 * la cargó antes de la escritura, así que sus contadores irían atrasados. Si
 * la recarga falla se queda la anterior: un contador viejo es mejor que un 500.
 */
export async function reloadAdminEventView(cookie: string, slug: string, previous: AdminEventView): Promise<AdminEventView> {
  const res = await adminFetch<AdminEventView>(cookie, `${slug}/admin`);
  return res.ok && res.data?.event ? res.data : previous;
}

/** Envelope de la API de eventos (SPEC v3 §6), tal cual lo devuelve el backend. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  message?: string;
  warnings: string[];
  dryRun: boolean;
  /** Campos que fallan en un `validation_failed`. */
  fields: string[];
  detail?: string;
}

/**
 * Llamada SSR a la API de administración con la cookie del staff. `path` es
 * relativo a `/api/events/` (`admin/events`, `${slug}/admin/participants`) y
 * cada segmento tiene que ser llano, como en el proxy. Nunca lanza: un fallo
 * de red es `{ ok: false, status: 0, error: 'server_error' }`.
 */
export async function adminFetch<T = unknown>(
  cookie: string,
  path: string,
  init?: { method?: string; body?: unknown; search?: string },
): Promise<ApiResult<T>> {
  const fail = (status: number, error: string, message?: string): ApiResult<T> =>
    ({ ok: false, status, data: null, error, message, warnings: [], dryRun: false, fields: [] });

  const segments = path.split('/').filter((s) => s !== '');
  if (segments.length === 0 || !segments.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..')) {
    return fail(404, 'not_found');
  }
  const url = `${apiBase()}/api/events/${segments.join('/')}${init?.search ?? ''}`;
  const req: RequestInit = { method: init?.method ?? 'GET', headers: ssrHeaders(cookie) };
  if (init?.body !== undefined) {
    req.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    (req.headers as Record<string, string>)['content-type'] =
      typeof init.body === 'string' ? 'text/csv' : 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url, req);
  } catch {
    return fail(0, 'server_error');
  }
  let body: Record<string, unknown> | null = null;
  try { body = (await res.json()) as Record<string, unknown>; } catch { body = null; }
  if (!body || typeof body !== 'object') {
    return fail(res.status, res.ok ? 'invalid_response' : 'server_error');
  }
  // `invalid_url` señala un solo campo en `data.field` (SPEC v3 §6.4 paso 6);
  // el resto de errores mandan la lista en `data.fields`. Aquí se unifican para
  // que el aviso pueda decir cuál es la URL que no vale.
  const errData = (body.data ?? {}) as { fields?: unknown; field?: unknown; detail?: unknown };
  const errFields = Array.isArray(errData.fields)
    ? (errData.fields as string[])
    : typeof errData.field === 'string' && errData.field !== ''
      ? [errData.field]
      : [];
  const ok = body.ok === true;
  return {
    ok,
    status: res.status,
    data: ok ? ((body.data as T) ?? null) : null,
    error: ok ? undefined : String(body.error ?? 'server_error'),
    message: typeof body.message === 'string' ? body.message : undefined,
    warnings: Array.isArray(body.warnings) ? (body.warnings as string[]) : [],
    dryRun: body.dry_run === true,
    fields: ok ? [] : errFields,
    detail: !ok && typeof errData.detail === 'string' ? errData.detail : undefined,
  };
}

/** Fecha ISO → "12 feb 2027, 18:00 UTC" (UTC, como el backend); vacío si no hay fecha. */
export function fmtAdminDate(iso?: string | null, withTime = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return d.toLocaleString('es-ES', opts) + (withTime ? ' UTC' : '');
}

/** Etiquetas en español de los estados del evento (SPEC v3 §4). */
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  registration: 'Inscripción',
  building: 'Construcción',
  submission: 'Entrega',
  voting: 'Votación',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

/**
 * Etiquetas de la fase efectiva (estado + fechas, SPEC v3 §5). Solo dicen
 * "abierta" las fases que garantizan la ventana: `registration` y `voting`
 * no la garantizan (la inscripción depende además de sus fechas y la
 * votación del interruptor de la votación), y decirlo ahí contradecía a la
 * lista de ventanas de al lado, que ponía "Inscripción: cerrada".
 */
export const PHASE_LABELS: Record<string, string> = {
  draft: 'borrador',
  published: 'publicado, sin inscripción',
  registration: 'inscripción',
  building_pending: 'construcción, entregas aún cerradas',
  building: 'construcción, entregas abiertas',
  submission: 'entregas congeladas',
  voting: 'votación',
  closed_pending: 'votación vencida, pendiente de cerrar',
  closed: 'cerrado',
  cancelled: 'cancelado',
};
