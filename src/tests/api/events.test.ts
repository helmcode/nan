import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { isAdminPath, backendURL, hasSessionCookie } from '../../lib/events';
import { GET, POST } from '../../pages/api/events/[...path]';
import { POST as LOGIN_POST } from '../../pages/api/auth/login-request';

describe('events proxy lib', () => {
  it('hasSessionCookie mira el nombre de la cookie, no la subcadena', () => {
    const req = (cookie?: string) => new Request('https://nan.builders/api/events/admin', { headers: cookie ? { cookie } : {} });
    expect(hasSessionCookie(req())).toBe(false);
    expect(hasSessionCookie(req('nan_session=abc'))).toBe(true);
    expect(hasSessionCookie(req('otra=1; nan_session=abc; mas=2'))).toBe(true);
    expect(hasSessionCookie(req('  nan_session=abc'))).toBe(true);
    // Señuelos: el texto aparece, la cookie no.
    expect(hasSessionCookie(req('basura=xx-nan_session-xx'))).toBe(false);
    expect(hasSessionCookie(req('no_es_nan_session_de_verdad=1'))).toBe(false);
    expect(hasSessionCookie(req('nan_session_old=1'))).toBe(false);
  });

  it('detecta paths admin, globales y por evento (SPEC v3 §8)', () => {
    expect(isAdminPath('admin')).toBe(true);
    expect(isAdminPath('admin/reload')).toBe(true);
    expect(isAdminPath('gauntlet-2026-08/admin')).toBe(true);
    expect(isAdminPath('gauntlet-2026-08/admin/state')).toBe(true);
    expect(isAdminPath('hackaton-2026-1/admin/export')).toBe(true);
    expect(isAdminPath('gauntlet-2026-08')).toBe(false);
    expect(isAdminPath('gauntlet-2026-08/submission')).toBe(false);
    expect(isAdminPath('gauntlet-2026-08/register')).toBe(false);
  });
  it('normaliza variantes admin', () => {
    expect(isAdminPath('//admin/state')).toBe(true);
    expect(isAdminPath('admin//x')).toBe(true);
    expect(isAdminPath('Admin/state')).toBe(true);
    expect(isAdminPath('%2fadmin/state')).toBe(true);
    expect(isAdminPath('gauntlet-2026-08//Admin/state')).toBe(true);
    expect(isAdminPath('gauntlet-2026-08%2fadmin%2fstate')).toBe(true);
    expect(isAdminPath('administration')).toBe(false);
    expect(isAdminPath('gauntlet-2026-08/administration')).toBe(false);
  });
  it('construye la URL del backend con query', () => {
    expect(backendURL('gauntlet-2026-08', '?x=1')).toBe('https://api.test/api/events/gauntlet-2026-08?x=1');
    expect(backendURL('/gauntlet-2026-08/register', '')).toBe('https://api.test/api/events/gauntlet-2026-08/register');
  });
});

/**
 * La ruta que sale hacia el backend tiene que quedarse bajo `/api/events/`.
 *
 * Comprobar el prefijo sobre la ruta cruda no bastaba: entre la comprobación y
 * la URL final hay tres decodificaciones (la del filtro, la de Astro al enrutar
 * y la resolución de dot-segments de `new URL()`), así que un `..` codificado
 * podía salir del prefijo después de haber pasado el filtro.
 *
 * La lista es de formas de escribir `..`, no de rutas concretas: lo que se
 * comprueba es que ninguna codificación se cuele.
 */
describe('backendURL no deja salir del prefijo', () => {
  const escapes = [
    ['%2e%2e/admin/x', 'dot-segment codificado'],
    ['%252e%252e/admin/x', 'doble codificación'],
    ['../admin/x', 'dot-segment en claro'],
    ['%2E%2E/admin/x', 'codificado en mayúsculas'],
    ['.%2e/admin/x', 'mitad y mitad'],
    // Estos tres se quedaban DENTRO del prefijo pero sin resolver, dejando el
    // resultado a merced del router del backend. Son los que no cierra validar
    // solo el pathname resuelto: `%2f` no es un dot-segment para el parser.
    ['..%2fadmin/x', 'separador codificado'],
    ['..%5cadmin/x', 'separador codificado, barra invertida'],
    ['..%252fadmin/x', 'separador con doble codificación'],
  ] as const;

  for (const [path, why] of escapes) {
    it(`rechaza ${path} (${why})`, () => {
      expect(backendURL(path, '')).toBeNull();
    });
  }

  it('rechaza la ruta vacía en vez de proxear /api/events/', () => {
    expect(backendURL('', '')).toBeNull();
    expect(backendURL('/', '')).toBeNull();
  });

  it('sigue dejando pasar las rutas que usa el sitio', () => {
    // Las que llaman las páginas y las islas (SPEC §6): lo que se rechaza es
    // la travesía, no la profundidad.
    for (const p of ['', '/register', '/me', '/submission', '/submissions', '/leaderboard', '/vote', '/reassign', '/withdraw']) {
      expect(backendURL(`gauntlet-2026-08${p}`, '')).toBe(`https://api.test/api/events/gauntlet-2026-08${p}`);
    }
    expect(backendURL('gauntlet-2026-08/submissions/s_01ABC', '')).toBe('https://api.test/api/events/gauntlet-2026-08/submissions/s_01ABC');
  });
});

// Construye un contexto mínimo de APIRoute para el handler del proxy.
function ctx(path: string, init?: { method?: string; cookie?: string; ip?: string; body?: string; search?: string }) {
  const headers = new Headers();
  if (init?.cookie) headers.set('cookie', init.cookie);
  if (init?.ip) headers.set('cf-connecting-ip', init.ip);
  const request = new Request('https://nan.builders/api/events/' + path + (init?.search ?? ''), {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  });
  const url = new URL(request.url);
  return { params: { path }, request, url } as never;
}

describe('events proxy handler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('responde 404 a paths admin sin cookie de sesión, sin llamar al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await GET(ctx('admin/reload'))).status).toBe(404);
    const resp = await GET(ctx('gauntlet-2026-08/admin/state', { cookie: 'otra=1' }));
    expect(resp.status).toBe(404);
    // El texto `nan_session` dentro de otra cookie no es la cookie de sesión.
    expect((await GET(ctx('admin/events', { cookie: 'basura=xx-nan_session-xx' }))).status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    expect(await resp.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('deja pasar paths admin con cookie de sesión y nunca reenvía la admin key (SPEC v3 §8)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":false,"error":"forbidden"}', { status: 403 }));
    const headers = new Headers({ cookie: 'nan_session=xyz', 'x-hackaton-admin-key': 'no-debe-pasar', 'x-hackaton-actor': 'x' });
    const request = new Request('https://nan.builders/api/events/gauntlet-2026-08/admin/state', {
      method: 'POST', headers, body: '{"status":"registration","dry_run":true}',
    });
    const resp = await POST({ params: { path: 'gauntlet-2026-08/admin/state' }, request, url: new URL(request.url) } as never);
    // La autorización la decide el backend: el proxy propaga su respuesta tal cual.
    expect(resp.status).toBe(403);
    expect(spy).toHaveBeenCalledOnce();
    const [target, reqInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/events/gauntlet-2026-08/admin/state');
    const h = reqInit.headers as Headers;
    expect(h.get('cookie')).toBe('nan_session=xyz');
    expect(h.get('origin')).toBe('https://nan.builders');
    expect(h.get('x-hackaton-admin-key')).toBeNull();
    expect(h.get('x-hackaton-actor')).toBeNull();
    expect(reqInit.body).toBe('{"status":"registration","dry_run":true}');
  });

  it('conserva content-type y Content-Disposition (CSV de import/export del panel)', async () => {
    const upstream = new Response('email,name\n', {
      status: 200,
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="p.csv"' },
    });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
    const headers = new Headers({ cookie: 'nan_session=xyz', 'content-type': 'text/csv' });
    const request = new Request('https://nan.builders/api/events/gauntlet-2026-08/admin/participants/import?dry_run=true', {
      method: 'POST', headers, body: 'email\na@b.c\n',
    });
    const resp = await POST({ params: { path: 'gauntlet-2026-08/admin/participants/import' }, request, url: new URL(request.url) } as never);
    const [target, reqInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/events/gauntlet-2026-08/admin/participants/import?dry_run=true');
    expect((reqInit.headers as Headers).get('content-type')).toBe('text/csv');
    expect(resp.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(resp.headers.get('content-disposition')).toBe('attachment; filename="p.csv"');
    expect(await resp.text()).toBe('email,name\n');
  });

  it('forwards an empty CSV body as is instead of padding it with {}', async () => {
    const upstream = new Response('', {
      status: 200,
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="p.csv"' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
    const resp = await GET(ctx('gauntlet-2026-08/admin/participants/export.csv', { cookie: 'nan_session=xyz', search: '?download=1' }));
    expect(resp.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(await resp.text()).toBe('');
    // The JSON fallback is untouched: an empty JSON upstream still parses.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const empty = await GET(ctx('gauntlet-2026-08/me', { cookie: 'nan_session=xyz' }));
    expect(await empty.text()).toBe('{}');
  });

  it('deja pasar el feed iCalendar con su content-type y su caché (W-10)', async () => {
    const upstream = new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', {
      status: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'public, max-age=300', 'content-disposition': 'inline; filename="nan-eventos.ics"' },
    });
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
    const resp = await GET(ctx('calendar.ics'));
    expect(spy.mock.calls[0][0]).toBe('https://api.test/api/events/calendar.ics');
    expect(resp.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(resp.headers.get('cache-control')).toBe('public, max-age=300');
    expect(resp.headers.get('content-disposition')).toBe('inline; filename="nan-eventos.ics"');
    expect(await resp.text()).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    // Por evento, mismo camino.
    expect(backendURL('taller-agentes/calendar.ics', '')).toBe('https://api.test/api/events/taller-agentes/calendar.ics');
  });

  it('sigue enviando JSON por defecto a las rutas públicas', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const resp = await POST(ctx('gauntlet-2026-08/register', { method: 'POST', body: '{}' }));
    expect((spy.mock.calls[0][1] as RequestInit).headers as Headers).toBeInstanceOf(Headers);
    expect(((spy.mock.calls[0][1] as RequestInit).headers as Headers).get('content-type')).toBe('application/json');
    expect(resp.headers.get('content-type')).toBe('application/json');
  });

  it('responde 404 a una ruta fuera del prefijo sin llamar al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    // Importa que no llegue a llamar: el proxy adjunta la cookie del visitante.
    const resp = await GET(ctx('%252e%252e/admin/x', { cookie: 'nan_session=xyz' }));
    expect(resp.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    expect(await resp.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('reenvía la cookie y propaga múltiples Set-Cookie', async () => {
    const upstream = new Response('{"ok":true}', { status: 200 });
    upstream.headers.append('set-cookie', 'a=1; Path=/');
    upstream.headers.append('set-cookie', 'b=2; Path=/');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
    const resp = await GET(ctx('gauntlet-2026-08/me', { cookie: 'nan_session=xyz' }));
    expect(spy).toHaveBeenCalledOnce();
    const [target, reqInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/events/gauntlet-2026-08/me');
    expect((reqInit.headers as Headers).get('cookie')).toBe('nan_session=xyz');
    expect(resp.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('devuelve 500 si el upstream falla', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const resp = await POST(ctx('gauntlet-2026-08/register', { method: 'POST', body: '{}' }));
    expect(resp.status).toBe(500);
    expect(await resp.json()).toEqual({ ok: false, error: 'server_error' });
  });
});

describe('auth login-request proxy', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reenvía la IP real en ambos headers (X-Forwarded-For y CF-Connecting-IP)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const request = new Request('https://nan.builders/api/auth/login-request', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '1.2.3.4' },
      body: '{"email":"a@b.c"}',
    });
    const resp = await LOGIN_POST({ request } as never);
    expect(resp.status).toBe(200);
    const [target, reqInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/auth/login/request');
    const h = reqInit.headers as Headers;
    expect(h.get('x-forwarded-for')).toBe('1.2.3.4');
    expect(h.get('cf-connecting-ip')).toBe('1.2.3.4');
  });
});
