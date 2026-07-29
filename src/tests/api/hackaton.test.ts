import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { isAdminPath, backendURL } from '../../lib/hackaton';
import { GET, POST } from '../../pages/api/hackaton/[...path]';
import { POST as LOGIN_POST } from '../../pages/api/auth/login-request';

describe('hackaton proxy lib', () => {
  it('bloquea paths admin', () => {
    expect(isAdminPath('admin')).toBe(true);
    expect(isAdminPath('admin/state')).toBe(true);
    expect(isAdminPath('event')).toBe(false);
    expect(isAdminPath('register')).toBe(false);
  });
  it('normaliza variantes admin', () => {
    expect(isAdminPath('//admin/state')).toBe(true);
    expect(isAdminPath('admin//x')).toBe(true);
    expect(isAdminPath('Admin/state')).toBe(true);
    expect(isAdminPath('%2fadmin/state')).toBe(true);
    expect(isAdminPath('administration')).toBe(false);
  });
  it('construye la URL del backend con query', () => {
    expect(backendURL('event', '?x=1')).toBe('https://api.test/api/hackaton/event?x=1');
    expect(backendURL('/register', '')).toBe('https://api.test/api/hackaton/register');
  });
});

/**
 * La ruta que sale hacia el backend tiene que quedarse bajo `/api/hackaton/`.
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

  it('rechaza la ruta vacía en vez de proxear /api/hackaton/', () => {
    expect(backendURL('', '')).toBeNull();
    expect(backendURL('/', '')).toBeNull();
  });

  it('sigue dejando pasar las rutas que usa el sitio', () => {
    // Las cinco que llaman los componentes, más una anidada por si el backend
    // crece: lo que se rechaza es la travesía, no la profundidad.
    for (const p of ['event', 'register', 'vote', 'submission', 'reassign']) {
      expect(backendURL(p, '')).toBe(`https://api.test/api/hackaton/${p}`);
    }
    expect(backendURL('teams/abc-123', '')).toBe('https://api.test/api/hackaton/teams/abc-123');
  });
});

// Construye un contexto mínimo de APIRoute para el handler del proxy.
function ctx(path: string, init?: { method?: string; cookie?: string; ip?: string; body?: string; search?: string }) {
  const headers = new Headers();
  if (init?.cookie) headers.set('cookie', init.cookie);
  if (init?.ip) headers.set('cf-connecting-ip', init.ip);
  const request = new Request('https://nan.builders/api/hackaton/' + path + (init?.search ?? ''), {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  });
  const url = new URL(request.url);
  return { params: { path }, request, url } as never;
}

describe('hackaton proxy handler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('responde 404 a paths admin sin llamar al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const resp = await GET(ctx('admin/state'));
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
    const resp = await GET(ctx('event', { cookie: 'nan_session=xyz' }));
    expect(spy).toHaveBeenCalledOnce();
    const [target, reqInit] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/hackaton/event');
    expect((reqInit.headers as Headers).get('cookie')).toBe('nan_session=xyz');
    expect(resp.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('devuelve 500 si el upstream falla', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const resp = await POST(ctx('register', { method: 'POST', body: '{}' }));
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
