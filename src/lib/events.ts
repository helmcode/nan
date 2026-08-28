import { env } from 'cloudflare:workers';
import { getLocale, withLang } from './i18n';

// Paths admin nunca deben atravesar el proxy público (SPEC §8.1): ni
// `admin/reload` (global) ni `{slug}/admin/*` (por evento).
const ADMIN_SEGMENT = 'admin';

export function isAdminPath(path: string): boolean {
  // Normaliza: decodifica %2f, baja a minúsculas, quita barras iniciales y
  // colapsa barras repetidas, para que //admin, Admin/, %2fadmin no se cuelen.
  let p = path;
  try { p = decodeURIComponent(path); } catch { /* ruta malformada: usar tal cual */ }
  p = p.toLowerCase().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  // Se mira segmento a segmento: `admin` puede ir en cualquier posición
  // (`admin/reload`, `gauntlet-2026-08/admin/state`).
  return p.split('/').some((seg) => seg === ADMIN_SEGMENT);
}

/**
 * Segmento de ruta admisible: palabra plana.
 *
 * Deliberadamente NO incluye `%`, porque un `%2f` o un `%5c` reintroducen el
 * separador después de que el filtro haya mirado la ruta. Todas las rutas que
 * consume el proxy son `{slug}/{recurso}` con segmentos llanos (`gauntlet-2026-08/submission`,
 * `hackaton-2026-1/vote`), así que el coste de esta estrechez es cero.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Construye la URL destino en el backend conservando query string.
 *
 * Devuelve `null` si la ruta pedida no es una ruta simple bajo
 * `/api/events/`; quien llame responde 404 sin tocar el backend.
 *
 * Por qué no basta con comprobar el prefijo antes de concatenar: la comprobación
 * y la URL final no operaban sobre la misma representación de la ruta. Hay tres
 * decodificaciones en juego, no una: `isAdminPath` decodifica, Astro decodifica
 * otra vez antes de enrutar y `new URL()` resuelve los dot-segments al final. Un
 * `..` codificado podía sobrevivir a la comprobación y resolverse después, ya
 * fuera del prefijo.
 *
 * Se valida en dos pasos independientes a propósito, porque ninguno cubre al
 * otro:
 *
 *   1. Cada segmento contra `SAFE_SEGMENT`, que descarta los dot-segments y los
 *      separadores codificados. Hace falta porque el paso 2 no los ve: `%2f` no
 *      es un dot-segment para el parser de URL, así que la ruta se queda dentro
 *      del prefijo sin resolver y el resultado dependería de cómo normalice el
 *      router del backend.
 *   2. El pathname ya resuelto por `new URL()` contra el prefijo esperado. Hace
 *      falta porque no depende de que hayamos enumerado bien las
 *      codificaciones de `..`.
 */
export function backendURL(path: string, search: string): string | null {
  const base = env.CLOUD_API_URL.replace(/\/$/, '');
  const prefix = `${base}/api/events/`;

  const segments = (path ?? '').split('/').filter((s) => s !== '');
  if (segments.length === 0) return null;
  if (!segments.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..')) return null;

  let target: URL;
  let expected: URL;
  try {
    target = new URL(`${prefix}${segments.join('/')}${search ?? ''}`);
    expected = new URL(prefix);
  } catch {
    return null;
  }

  // Se comparan origin y pathname por separado, no el href entero: `new URL()`
  // normaliza el host (lo baja a minúsculas) y compararlo como texto contra el
  // valor crudo de la variable de entorno daría falsos negativos.
  if (target.origin !== expected.origin) return null;
  if (!target.pathname.startsWith(expected.pathname)) return null;

  return target.href;
}

// Cabeceras a reenviar al backend: preserva cookie/sesión NaN; nunca reenvía la
// admin key (§9.2). Fija Origin para la política CORS del backend (§13).
export function forwardHeaders(request: Request): Headers {
  const out = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) out.set('cookie', cookie);
  out.set('content-type', 'application/json');
  out.set('origin', 'https://nan.builders');
  // Backend de eventos lee CF-Connecting-IP; otros endpoints X-Forwarded-For.
  // Reenviamos ambos para que el rate-limit por IP funcione en cualquier ruta.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) { out.set('cf-connecting-ip', ip); out.set('x-forwarded-for', ip); }
  return out;
}

// Tipos del envelope { ok, data } de /api/events (SPEC §6). Solo los campos
// que consume el SSR; el backend es la fuente de verdad.
export type EventFormat = 'solo' | 'team';
export type EventPhase =
  | 'draft' | 'registration' | 'building_pending' | 'building'
  | 'submission' | 'voting' | 'closed_pending' | 'closed';
export type FieldMode = 'required' | 'optional' | 'hidden';
/** registration.discord_user (SPEC §3.1): `none` = no se pide. */
export type DiscordMode = 'required' | 'optional' | 'none';

export interface EventDates {
  registration_open?: string | null;
  registration_close?: string | null;
  submission_open?: string | null;
  submission_close?: string | null;
  voting_open?: string | null;
  voting_close?: string | null;
  demo_day?: string | null;
}
export interface SubmissionFields {
  description: FieldMode;
  repo_url: FieldMode;
  space_url: FieldMode;
  image_url: FieldMode;
  video_url: FieldMode;
}
export interface Windows {
  registration: { open: boolean };
  submission: { open: boolean };
  voting: { open: boolean };
  gallery: { visible: boolean };
  leaderboard: { visible: boolean };
}
export interface EventInfo {
  slug: string;
  kind: string;
  name: string;
  description: string;
  rules: string;
  prize: string;
  format: EventFormat;
  status: string;
  dates: EventDates;
  registration: {
    capacity: number;
    reserve_capacity: number;
    discord_user: DiscordMode;
    specialties: string[];
    levels: string[];
  };
  /** Solo presente en formato `team` (SPEC §6.1). */
  team?: { size: number; min_size: number; max_teams: number };
  submission: {
    fields: SubmissionFields;
    checks: string[];
    prize_requires: string[];
    gallery_visibility: string;
  };
  /** Sin los interruptores de admin (open, leaderboard_public): lo que manda es `windows`. */
  voting: { enabled: boolean; vote_weight: number; auto_max: number };
  phase: EventPhase;
  windows: Windows;
  /** Activos no retirados (SPEC §6.1). */
  counts: { registered: number; submissions: number };
}
export interface Participant {
  id: string;
  name: string;
  status?: string;
  discord_user?: string | null;
  specialty?: string | null;
  level?: string | null;
  is_reserve?: boolean;
}
export interface Team {
  id: string;
  name?: string;
  members?: Participant[];
}
export interface Check { pass: boolean; checked_at?: string | null; http_status?: number; host?: string }
export interface Submission {
  id: string;
  title: string;
  description: string;
  public_url: string;
  space_url?: string;
  repo_url?: string;
  image_url?: string;
  video_url?: string;
  submitted_at?: string;
  checks?: Record<string, Check>;
  auto_points?: number;
  not_prize_eligible?: boolean;
}
export interface Owner { type: 'team' | 'participant'; id: string; name: string }
export interface PublicSubmission extends Submission { owner: Owner }
export interface LeaderboardRow {
  rank: number;
  submission_id: string;
  owner: Owner;
  title: string;
  votes: number;
  vote_points: number;
  auto_points: number;
  total: number;
  not_prize_eligible: boolean;
}
export interface MeData {
  participant?: Participant | null;
  team?: Team | null;
  submission?: Submission | null;
  my_vote?: string | null;
  phase?: EventPhase;
  windows?: Windows;
}

// Lee el envelope { data } estándar de la API; null si el cuerpo no es JSON.
export async function jsonData<T = unknown>(res: Response): Promise<T | null> {
  try { return ((await res.json()) as { data?: T })?.data ?? null; }
  catch { return null; }
}

// Cabeceras para las llamadas SSR al backend (mismo Origin que el proxy).
function ssrHeaders(cookie?: string): HeadersInit {
  const h: Record<string, string> = { origin: 'https://nan.builders' };
  if (cookie) h.cookie = cookie;
  return h;
}

function apiBase(): string {
  return env.CLOUD_API_URL.replace(/\/$/, '');
}

/**
 * Carga un evento por slug para el SSR. Devuelve `null` si no existe, está en
 * `draft` (el backend responde 404) o el slug no es un segmento válido; la
 * página responde 404 en ese caso.
 */
export async function fetchEvent(slug: string): Promise<EventInfo | null> {
  if (!SAFE_SEGMENT.test(slug)) return null;
  try {
    const res = await fetch(`${apiBase()}/api/events/${slug}`, { headers: ssrHeaders() });
    if (!res.ok) return null;
    return await jsonData<EventInfo>(res);
  } catch {
    return null;
  }
}

/** Resultado de `resolveEventRoute`: evento cargado o Response 404 a devolver. */
export type EventRoute =
  | { event: EventInfo; notFound: null }
  | { event: null; notFound: Response };

/**
 * Resuelve el evento de una ruta `/events/[slug]/*` desde el FICHERO DE RUTA
 * (los envoltorios `index.astro`, `me.astro`, …), no desde el cuerpo `_x.astro`.
 *
 * `Astro.rewrite` solo surte efecto en páginas, endpoints y middleware: desde
 * un componente el `return` se ignora y la ruta saldría vacía con 200. Por eso
 * el envoltorio llama a esto, devuelve `notFound` si toca y pasa `event` al
 * cuerpo como prop.
 */
export async function resolveEventRoute(
  astro: { params: { slug?: string }; url: URL; rewrite: (to: string) => Promise<Response> },
): Promise<EventRoute> {
  const slug = String(astro.params.slug ?? '');
  const event = await fetchEvent(slug);
  if (event) return { event, notFound: null };
  return { event: null, notFound: await astro.rewrite(withLang('/404', getLocale(astro.url))) };
}

/**
 * Estado del visitante en el evento (SSR, reenviando la cookie de sesión).
 * `me: null` sin sesión o con sesión caducada (`unauthorized: true`).
 */
export async function fetchMe(slug: string, cookie: string): Promise<{ me: MeData | null; unauthorized: boolean }> {
  if (!SAFE_SEGMENT.test(slug) || !cookie) return { me: null, unauthorized: false };
  try {
    const res = await fetch(`${apiBase()}/api/events/${slug}/me`, { headers: ssrHeaders(cookie) });
    if (res.status === 401) return { me: null, unauthorized: true };
    if (!res.ok) return { me: null, unauthorized: false };
    return { me: await jsonData<MeData>(res), unauthorized: false };
  } catch {
    return { me: null, unauthorized: false };
  }
}

/** Recurso público de un evento (`submissions`, `leaderboard`). */
export async function fetchPublic<T>(slug: string, resource: string): Promise<T | null> {
  if (!SAFE_SEGMENT.test(slug) || !SAFE_SEGMENT.test(resource)) return null;
  try {
    const res = await fetch(`${apiBase()}/api/events/${slug}/${resource}`, { headers: ssrHeaders() });
    if (!res.ok) return null;
    return await jsonData<T>(res);
  } catch {
    return null;
  }
}

/** ¿Hay cookie de sesión NaN? Heurística: el backend es la autoridad real. */
export function hasSessionCookie(request: Request): boolean {
  return (request.headers.get('cookie') ?? '').includes('nan_session');
}

/** Fecha ISO → texto corto en el idioma del visitante (UTC, como el backend). */
export function fmtDate(iso?: string | null, locale = 'en', withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return d.toLocaleString(locale === 'es' ? 'es-ES' : 'en-GB', opts) + (withTime ? ' UTC' : '');
}

/** Rango "1 sept – 3 sept"; si falta un extremo, muestra el que haya. */
export function fmtRange(from?: string | null, to?: string | null, locale = 'en'): string {
  const a = fmtDate(from, locale);
  const b = fmtDate(to, locale);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}
