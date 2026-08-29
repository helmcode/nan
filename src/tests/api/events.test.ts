import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { isAdminPath, backendURL } from '../../lib/events';
import { GET, POST } from '../../pages/api/events/[...path]';
import { POST as LOGIN_POST } from '../../pages/api/auth/login-request';

describe('events proxy lib', () => {
  it('bloquea paths admin, globales y por evento (SPEC §8.1)', () => {
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

  it('responde 404 a paths admin sin llamar al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await GET(ctx('admin/reload'))).status).toBe(404);
    const resp = await GET(ctx('gauntlet-2026-08/admin/state'));
    expect(resp.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    expect(await resp.json()).toEqual({ ok: false, error: 'not_found' });
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
