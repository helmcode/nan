import type { AgendaItem } from './agenda';
import { apiBase, jsonData, ssrHeaders, type EventInfo } from './events';

/**
 * Eventos publicados en la página pública `/events` y "añadir a tu
 * calendario" (SPEC v3 §6.1 bis y §8, W-10).
 *
 * El backend sirve un feed iCalendar (`/api/events/calendar.ics`) con todos
 * los eventos publicados que tienen fecha. Quien lo añade una vez a Google
 * Calendar, Apple Calendar u Outlook ve los eventos actuales y los que se
 * publiquen después sin volver a la web: el cliente relee el feed solo.
 * Aquí se construyen los enlaces y se convierten los eventos de la API en
 * filas de la agenda de "este mes".
 */

/** Resumen de `GET /api/events`: los campos de la ficha que usa la página. */
export type PublicEventSummary = Pick<
  EventInfo,
  'slug' | 'kind' | 'name' | 'description' | 'location' | 'url' | 'image_url' | 'status' | 'dates'
>;

/** Ruta del feed dentro del sitio: pasa por el proxy same-origin. */
export const CALENDAR_PATH = '/api/events/calendar.ics';

/** Zona horaria en la que se anuncian los eventos de la comunidad. */
export const EVENTS_TZ = 'Europe/Madrid';

/** Hasta cuándo dura un evento sin `demo_day_end`: lo mismo que asume el feed. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Tope del texto que va en la URL de Google: la descripción de un evento
 * puede ser larga y las URLs muy largas fallan en algunos navegadores.
 */
const DETAILS_MAX = 800;

/** La página no espera más que esto por la lista: sale con lo estático. */
const TIMEOUT_MS = 2500;

/**
 * Eventos publicados, para el SSR de `/events`. Lista vacía si la API no
 * responde o tarda: la página sigue saliendo con la agenda estática.
 */
export async function fetchEvents(): Promise<PublicEventSummary[]> {
  try {
    const res = await fetch(`${apiBase()}/api/events`, {
      headers: ssrHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return (await jsonData<PublicEventSummary[]>(res)) ?? [];
  } catch {
    return [];
  }
}

/** URL absoluta del feed a partir del origen público del sitio. */
export function calendarFeedURL(site: string | URL | undefined): string {
  const origin = new URL(site ?? 'https://nan.builders').origin;
  return `${origin}${CALENDAR_PATH}`;
}

/** Ruta del `.ics` de un solo evento (`GET /api/events/{slug}/calendar.ics`). */
export const eventCalendarPath = (ev: Pick<PublicEventSummary, 'slug'>): string =>
  `/api/events/${ev.slug}/calendar.ics`;

/**
 * Suscripción en Google Calendar: `cid` con la URL del feed. Google lo añade
 * como calendario "de URL" y lo relee él mismo a lo largo del día.
 */
export function googleSubscribeURL(feed: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}

/** `webcal://`: Apple Calendar y Outlook lo abren como suscripción, no como descarga. */
export function webcalURL(feed: string): string {
  return feed.replace(/^https?:/, 'webcal:');
}

/** Fecha en el formato compacto que piden los enlaces de Google (`20260916T170000Z`). */
export function compactUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Enlace de la ficha pública del evento, sin prefijo de idioma. */
export const eventHref = (ev: Pick<PublicEventSummary, 'slug'>): string => `/events/${ev.slug}`;

/**
 * Enlace "añadir a Google Calendar" de UN evento (plantilla, sin suscripción):
 * para quien quiera solo ese. `null` si el evento no tiene fecha.
 */
export function googleEventURL(ev: PublicEventSummary, site: string | URL | undefined): string | null {
  const start = parseDate(ev.dates.demo_day);
  if (!start) return null;
  const end = parseDate(ev.dates.demo_day_end);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.name,
    dates: `${compactUTC(start)}/${compactUTC(end && end > start ? end : new Date(start.getTime() + DEFAULT_DURATION_MS))}`,
    details: eventDetails(ev, site),
    ctz: EVENTS_TZ,
  });
  if (ev.location) q.set('location', ev.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/**
 * Texto del evento para el calendario: descripción (recortada si es muy
 * larga) y, siempre, el enlace: la url propia si la tiene y la ficha pública.
 */
export function eventDetails(ev: PublicEventSummary, site: string | URL | undefined): string {
  const page = new URL(eventHref(ev), site ?? 'https://nan.builders').href;
  const links = ev.url && ev.url !== page ? `${ev.url}\n${page}` : page;
  if (!ev.description) return links;
  const room = DETAILS_MAX - links.length - 2;
  const desc = ev.description.length > room ? `${ev.description.slice(0, Math.max(room - 1, 0)).trimEnd()}…` : ev.description;
  return `${desc}\n\n${links}`;
}

/** Día `YYYY-MM-DD` de un instante en la zona de los eventos. */
export function localDay(d: Date, tz = EVENTS_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora `HH:MM` de un instante en la zona de los eventos. */
export function localTime(d: Date, tz = EVENTS_TZ): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/**
 * Filas de agenda a partir de los eventos publicados con fecha. Los
 * cancelados no entran: la agenda es lo que va a pasar (en el feed sí van,
 * como cancelados, para que desaparezcan del calendario de quien los tenía).
 * El día se calcula en la zona de los eventos, no en UTC: un demo day a las
 * 23:30 de Madrid no debe aparecer al día siguiente.
 */
export function toAgendaItems(events: PublicEventSummary[], site: string | URL | undefined): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const ev of events) {
    const start = parseDate(ev.dates.demo_day);
    if (!start || ev.status === 'cancelled') continue;
    const end = parseDate(ev.dates.demo_day_end);
    const date = localDay(start);
    const item: AgendaItem = {
      date,
      type: ev.kind,
      title: ev.name,
      by: ev.location || undefined,
      href: eventHref(ev),
      time: localTime(start),
      calendar: googleEventURL(ev, site) ?? undefined,
    };
    if (end) {
      const until = localDay(end);
      if (until > date) item.until = until;
    }
    out.push(item);
  }
  return out;
}

/**
 * Agenda estática + eventos de la API. Si una entrada estática apunta a la
 * ficha de un evento que ya viene de la API, gana la API (tiene la fecha
 * real y el enlace al calendario).
 */
export function mergeAgenda(base: AgendaItem[], fromAPI: AgendaItem[]): AgendaItem[] {
  const hrefs = new Set(fromAPI.map((a) => a.href).filter(Boolean));
  return [...base.filter((a) => !a.href || !hrefs.has(a.href)), ...fromAPI];
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
