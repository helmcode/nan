import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test/' } }));

import {
  calendarFeedURL,
  compactUTC,
  eventCalendarPath,
  eventDetails,
  fetchEvents,
  googleEventURL,
  googleSubscribeURL,
  localDay,
  localTime,
  mergeAgenda,
  toAgendaItems,
  webcalURL,
  type PublicEventSummary,
} from '../../lib/eventsCalendar';

const ev = (over: Partial<PublicEventSummary> = {}): PublicEventSummary => ({
  slug: 'taller-agentes', kind: 'workshop', name: 'Taller de agentes', description: 'Qué es un agente.',
  location: 'Discord de NaN', url: '', image_url: '', status: 'closed',
  dates: { demo_day: '2026-09-16T17:00:00Z', demo_day_end: null },
  ...over,
});

describe('enlaces del feed (SPEC v3 §6.1 bis, W-10)', () => {
  it('construye la URL del feed desde el origen del sitio', () => {
    expect(calendarFeedURL('https://nan.builders')).toBe('https://nan.builders/api/events/calendar.ics');
    expect(calendarFeedURL(new URL('https://nan.builders/events/'))).toBe('https://nan.builders/api/events/calendar.ics');
    expect(calendarFeedURL(undefined)).toBe('https://nan.builders/api/events/calendar.ics');
  });
  it('Google se suscribe por cid y Apple/Outlook por webcal', () => {
    const feed = 'https://nan.builders/api/events/calendar.ics';
    expect(googleSubscribeURL(feed)).toBe('https://calendar.google.com/calendar/r?cid=https%3A%2F%2Fnan.builders%2Fapi%2Fevents%2Fcalendar.ics');
    expect(webcalURL(feed)).toBe('webcal://nan.builders/api/events/calendar.ics');
  });
  it('el .ics de un solo evento va por el proxy', () => {
    expect(eventCalendarPath(ev())).toBe('/api/events/taller-agentes/calendar.ics');
  });
});

describe('googleEventURL (plantilla de un solo evento)', () => {
  it('sin fecha no hay enlace', () => {
    expect(googleEventURL(ev({ dates: {} }), 'https://nan.builders')).toBeNull();
  });
  it('lleva título, fechas compactas, detalles con enlace a la ficha y ubicación', () => {
    const u = new URL(googleEventURL(ev(), 'https://nan.builders')!);
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Taller de agentes');
    // Sin demo_day_end: dos horas, como el feed del backend.
    expect(u.searchParams.get('dates')).toBe('20260916T170000Z/20260916T190000Z');
    expect(u.searchParams.get('details')).toBe('Qué es un agente.\n\nhttps://nan.builders/events/taller-agentes');
    expect(u.searchParams.get('location')).toBe('Discord de NaN');
    expect(u.searchParams.get('ctz')).toBe('Europe/Madrid');
  });
  it('respeta demo_day_end y, con url propia, enlaza la url y la ficha', () => {
    const u = new URL(googleEventURL(ev({ url: 'https://meet.example/x', dates: { demo_day: '2026-09-16T17:00:00Z', demo_day_end: '2026-09-16T19:30:00Z' } }), undefined)!);
    expect(u.searchParams.get('dates')).toBe('20260916T170000Z/20260916T193000Z');
    expect(u.searchParams.get('details')).toBe('Qué es un agente.\n\nhttps://meet.example/x\nhttps://nan.builders/events/taller-agentes');
  });
  it('un fin igual o anterior al inicio se ignora: dos horas', () => {
    const u = new URL(googleEventURL(ev({ dates: { demo_day: '2026-09-16T17:00:00Z', demo_day_end: '2026-09-16T17:00:00Z' } }), undefined)!);
    expect(u.searchParams.get('dates')).toBe('20260916T170000Z/20260916T190000Z');
  });
  it('recorta una descripción muy larga sin perder el enlace', () => {
    const details = eventDetails(ev({ description: 'x'.repeat(2000) }), 'https://nan.builders');
    expect(details.length).toBeLessThanOrEqual(800);
    expect(details.endsWith('…\n\nhttps://nan.builders/events/taller-agentes')).toBe(true);
    // Sin descripción, solo el enlace.
    expect(eventDetails(ev({ description: '' }), undefined)).toBe('https://nan.builders/events/taller-agentes');
  });
  it('compactUTC quita separadores y milisegundos', () => {
    expect(compactUTC(new Date('2026-09-16T17:00:00.000Z'))).toBe('20260916T170000Z');
  });
});

describe('día y hora en Europe/Madrid', () => {
  it('un demo day a las 23:30 de Madrid no salta al día siguiente', () => {
    // 21:30Z en verano = 23:30 en Madrid (UTC+2).
    const d = new Date('2026-09-16T21:30:00Z');
    expect(localDay(d)).toBe('2026-09-16');
    expect(localTime(d)).toBe('23:30');
    // 22:30Z ya es el día 17 en Madrid.
    expect(localDay(new Date('2026-09-16T22:30:00Z'))).toBe('2026-09-17');
  });
});

describe('toAgendaItems', () => {
  it('convierte los eventos con fecha en filas de agenda con enlace y calendario', () => {
    const items = toAgendaItems([ev(), ev({ slug: 'sin-fecha', dates: {} }), ev({ slug: 'cancelado', status: 'cancelled' })], 'https://nan.builders');
    expect(items).toHaveLength(1);
    const [a] = items;
    expect(a).toMatchObject({ date: '2026-09-16', type: 'workshop', title: 'Taller de agentes', by: 'Discord de NaN', href: '/events/taller-agentes', time: '19:00' });
    expect(a.until).toBeUndefined();
    expect(a.calendar).toContain('calendar.google.com/calendar/render');
  });
  it('un evento de varios días lleva until; sin ubicación no hay by', () => {
    const [a] = toAgendaItems([ev({ location: '', dates: { demo_day: '2026-09-16T17:00:00Z', demo_day_end: '2026-09-18T12:00:00Z' } })], undefined);
    expect(a.until).toBe('2026-09-18');
    expect(a.by).toBeUndefined();
  });
});

describe('mergeAgenda', () => {
  it('la API sustituye a la entrada estática que apunta a la misma ficha', () => {
    const base = [
      { date: '2026-09-01', type: 'event', title: 'Estático', href: '/gauntlet' },
      { date: '2026-09-10', type: 'workshop', title: 'Viejo', href: '/events/taller-agentes' },
    ];
    const api = toAgendaItems([ev()], undefined);
    const merged = mergeAgenda(base, api);
    expect(merged.map((a) => a.title)).toEqual(['Estático', 'Taller de agentes']);
  });
});

describe('fetchEvents', () => {
  afterEach(() => vi.restoreAllMocks());
  it('devuelve data del sobre y lista vacía si la API falla', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [ev()] }), { status: 200 }));
    const list = await fetchEvents();
    expect(list.map((e) => e.slug)).toEqual(['taller-agentes']);
    expect(spy.mock.calls[0][0]).toBe('https://api.test/api/events');
    // Mismo Origin que el resto de llamadas SSR y con tope de tiempo: la
    // página no se queda esperando a la API.
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ origin: 'https://nan.builders' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    expect(await fetchEvents()).toEqual([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":false}', { status: 500 }));
    expect(await fetchEvents()).toEqual([]);
  });
});
