import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock de cloudflare:workers env (patrón del repo).
vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test/' } }));

import { adminFetch, adminHref, fetchStaffSession, reloadAdminEventView, resolveAdminEventRoute, resolveAdminRoute } from '../../lib/eventsAdmin';

const me = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('fetchStaffSession (guardia SSR, SPEC v3 §8)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sin cookie de sesión no llama a la plataforma', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchStaffSession('')).toBeNull();
    expect(await fetchStaffSession('otra=1')).toBeNull();
    expect(await fetchStaffSession('basura=xx-nan_session-xx')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('staff → sesión; reenvía la cookie y el Origin a /api/auth/me', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(me({ role: 'staff', email: 'a@nan.builders', userUUID: 'u1' }));
    expect(await fetchStaffSession('nan_session=xyz')).toEqual({ email: 'a@nan.builders', userUUID: 'u1' });
    const [target, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/auth/me');
    const h = init.headers as Record<string, string>;
    expect(h.cookie).toBe('nan_session=xyz');
    expect(h.origin).toBe('https://nan.builders');
  });

  it('miembro, sesión caducada, respuesta rara o fallo de red → null', async () => {
    const cases: Array<() => Promise<Response>> = [
      () => Promise.resolve(me({ role: 'member', email: 'm@x.y' })),
      () => Promise.resolve(me({ ok: false }, 401)),
      () => Promise.resolve(new Response('no json', { status: 200 })),
      () => Promise.reject(new Error('boom')),
    ];
    for (const impl of cases) {
      vi.spyOn(globalThis, 'fetch').mockImplementation(impl as never);
      expect(await fetchStaffSession('nan_session=xyz')).toBeNull();
      vi.restoreAllMocks();
    }
  });
});

describe('resolveAdminRoute', () => {
  afterEach(() => vi.restoreAllMocks());

  const ctx = (cookie?: string) => {
    const headers = new Headers();
    if (cookie) headers.set('cookie', cookie);
    const rewrite = vi.fn(async (to: string) => new Response(`rewrite:${to}`, { status: 404 }));
    return { astro: { request: new Request('https://nan.builders/events/admin', { headers }), rewrite }, rewrite };
  };

  it('staff: devuelve la sesión y la cookie sin rewrite', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(me({ role: 'staff', email: 's@nan.builders', userUUID: 'u' }));
    const { astro, rewrite } = ctx('nan_session=abc');
    const route = await resolveAdminRoute(astro);
    expect(route.notFound).toBeNull();
    expect(route.staff?.email).toBe('s@nan.builders');
    expect(route.cookie).toBe('nan_session=abc');
    expect(rewrite).not.toHaveBeenCalled();
  });

  it('no staff: 404 por rewrite, nunca 403 (el panel no se anuncia)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(me({ role: 'member' }));
    const { astro, rewrite } = ctx('nan_session=abc');
    const route = await resolveAdminRoute(astro);
    expect(route.staff).toBeNull();
    expect(rewrite).toHaveBeenCalledWith('/404');
    expect(await route.notFound?.text()).toBe('rewrite:/404');
  });

  it('sin cookie: 404 sin llamar a la plataforma', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const { astro, rewrite } = ctx();
    const route = await resolveAdminRoute(astro);
    expect(route.staff).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(rewrite).toHaveBeenCalledWith('/404');
  });
});

describe('resolveAdminEventRoute / reloadAdminEventView', () => {
  afterEach(() => vi.restoreAllMocks());

  const staff = { role: 'staff', email: 's@nan.builders', userUUID: 'u' };
  const ficha = { event: { slug: 'gauntlet-2026-08', name: 'Gauntlet' }, phase: 'building', windows: {}, counts: { registered: 3 }, warnings: [] };

  // fetch simulado: /api/auth/me y /api/events/{slug}/admin, por URL.
  const plataforma = (opts: { me?: unknown; meStatus?: number; admin?: unknown; adminStatus?: number }) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return me(opts.me ?? staff, opts.meStatus ?? 200);
      if (url.includes('/admin')) return me(opts.admin ?? { ok: true, data: ficha }, opts.adminStatus ?? 200);
      throw new Error(`fetch inesperado: ${url}`);
    });

  const ctx = (slug: string, cookie = 'nan_session=abc') => {
    const rewrite = vi.fn(async (to: string) => new Response(`rewrite:${to}`, { status: 404 }));
    return {
      astro: { request: new Request(`https://nan.builders/events/admin/${slug}`, { headers: { cookie } }), rewrite, params: { slug } },
      rewrite,
    };
  };

  it('staff y evento existente → ficha, slug del backend y sin rewrite', async () => {
    const spy = plataforma({});
    const { astro, rewrite } = ctx('gauntlet-2026-08');
    const route = await resolveAdminEventRoute(astro);
    expect(route.notFound).toBeNull();
    expect(route.view?.counts.registered).toBe(3);
    expect(route.slug).toBe('gauntlet-2026-08');
    expect(rewrite).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('staff y evento inexistente → 404 por rewrite', async () => {
    plataforma({ admin: { ok: false, error: 'event_not_found' }, adminStatus: 404 });
    const { astro, rewrite } = ctx('nope');
    const route = await resolveAdminEventRoute(astro);
    expect(route.view).toBeNull();
    expect(rewrite).toHaveBeenCalledWith('/404');
    expect(route.notFound?.status).toBe(404);
  });

  it('sin staff → 404 sin pedir la ficha', async () => {
    const spy = plataforma({ me: { role: 'member' } });
    const { astro, rewrite } = ctx('gauntlet-2026-08');
    const route = await resolveAdminEventRoute(astro);
    expect(route.view).toBeNull();
    expect(rewrite).toHaveBeenCalledWith('/404');
    expect(spy).toHaveBeenCalledTimes(1); // solo /api/auth/me
  });

  it('reloadAdminEventView devuelve la ficha nueva, o la anterior si la recarga falla', async () => {
    const nueva = { ...ficha, counts: { registered: 4 } };
    plataforma({ admin: { ok: true, data: nueva } });
    expect((await reloadAdminEventView('nan_session=abc', 'gauntlet-2026-08', ficha as never)).counts.registered).toBe(4);
    vi.restoreAllMocks();
    plataforma({ admin: { ok: false, error: 'server_error' }, adminStatus: 500 });
    expect((await reloadAdminEventView('nan_session=abc', 'gauntlet-2026-08', ficha as never)).counts.registered).toBe(3);
  });
});

describe('adminFetch (cliente SSR de la API de administración)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lee el envelope de éxito con warnings y dry_run', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      me({ ok: true, data: { status: 'registration' }, warnings: ['teams_missing'], dry_run: true }),
    );
    const res = await adminFetch<{ status: string }>('nan_session=x', 'demo-2027/admin/state', {
      method: 'POST', body: { status: 'registration', dry_run: true },
    });
    expect(res).toMatchObject({ ok: true, status: 200, data: { status: 'registration' }, warnings: ['teams_missing'], dryRun: true, fields: [] });
    const [target, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/events/demo-2027/admin/state');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"status":"registration","dry_run":true}');
    const h = init.headers as Record<string, string>;
    expect(h['content-type']).toBe('application/json');
    expect(h.cookie).toBe('nan_session=x');
    expect(h.origin).toBe('https://nan.builders');
  });

  it('lee el envelope de error con message, fields y detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      me({ ok: false, error: 'validation_failed', message: 'datos inválidos', data: { fields: ['slug'], detail: 'slug ocupado' } }, 400),
    );
    const res = await adminFetch('nan_session=x', 'admin/events', { method: 'POST', body: { slug: 'X' } });
    expect(res).toMatchObject({ ok: false, status: 400, data: null, error: 'validation_failed', message: 'datos inválidos', fields: ['slug'], detail: 'slug ocupado' });
  });

  it('un cuerpo de texto va como text/csv (import de participantes) y conserva la query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(me({ ok: true, data: { rows: [] }, warnings: [], dry_run: true }));
    await adminFetch('nan_session=x', 'demo-2027/admin/participants/import', { method: 'POST', body: 'email\na@b.c\n', search: '?dry_run=true' });
    const [target, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://api.test/api/events/demo-2027/admin/participants/import?dry_run=true');
    expect((init.headers as Record<string, string>)['content-type']).toBe('text/csv');
    expect(init.body).toBe('email\na@b.c\n');
  });

  it('no sale del prefijo ni llama al backend con una ruta rara', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await adminFetch('nan_session=x', '../auth/me')).error).toBe('not_found');
    expect((await adminFetch('nan_session=x', 'demo%2fadmin')).error).toBe('not_found');
    expect((await adminFetch('nan_session=x', '')).error).toBe('not_found');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fallo de red y respuesta no JSON no lanzan', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    expect(await adminFetch('nan_session=x', 'admin/events')).toMatchObject({ ok: false, status: 0, error: 'server_error' });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 502 }));
    expect(await adminFetch('nan_session=x', 'admin/events')).toMatchObject({ ok: false, status: 502, error: 'server_error' });
  });
});

describe('adminHref', () => {
  it('lista, ficha y pantallas por evento', () => {
    expect(adminHref()).toBe('/events/admin');
    expect(adminHref('demo-2027')).toBe('/events/admin/demo-2027');
    expect(adminHref('demo-2027', 'equipos')).toBe('/events/admin/demo-2027/equipos');
    expect(adminHref('demo-2027', 'auditoria')).toBe('/events/admin/demo-2027/auditoria');
  });
});
