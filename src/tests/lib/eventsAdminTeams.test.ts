import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { handleTeamsForm } from '../../lib/eventsAdminTeams';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PAGE = 'https://nan.builders/events/admin/demo/equipos';

function post(fields: Record<string, string | string[]>): Request {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  return new Request(PAGE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://nan.builders' },
    body: fd.toString(),
  });
}

function lastCall(spy: ReturnType<typeof vi.spyOn>) {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(init.body as string) : null };
}

const okTeam = () => json({ ok: true, data: { team: { id: 't_01' } }, warnings: [] });

afterEach(() => vi.restoreAllMocks());

describe('handleTeamsForm', () => {
  it('ignora el GET y rechaza otro origen', async () => {
    expect(await handleTeamsForm(new Request(PAGE), 'c', 'demo')).toEqual({});
    const foreign = new Request(PAGE, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=create' });
    expect(await handleTeamsForm(foreign, 'c', 'demo')).toEqual({ forbidden: true });
  });

  it('crear: POST …/teams con nombre y member_ids (solo ids válidos)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { team: {} }, warnings: ['team_under_min'] }));
    const out = await handleTeamsForm(post({ action: 'create', name: 'Los del fondo', member_ids: ['p_1', '../x', 'p_2'] }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/equipos?ok=equipo_creado&warn=team_under_min');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/teams');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ name: 'Los del fondo', member_ids: ['p_1', 'p_2'] });
  });

  it('renombrar y disolver: PUT y DELETE …/teams/{id}', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okTeam());
    const ren = await handleTeamsForm(post({ action: 'rename', id: 't_01', name: 'Nuevo' }), 'c', 'demo');
    expect(ren.redirect).toBe('/events/admin/demo/equipos?ok=renombrado');
    let c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/teams/t_01');
    expect(c.init.method).toBe('PUT');
    expect(c.body).toEqual({ name: 'Nuevo' });

    const del = await handleTeamsForm(post({ action: 'delete', id: 't_01' }), 'c', 'demo');
    expect(del.redirect).toBe('/events/admin/demo/equipos?ok=disuelto');
    c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/teams/t_01');
    expect(c.init.method).toBe('DELETE');
    expect(c.init.body).toBeUndefined();
  });

  it('mover a un equipo: POST …/teams/{to}/members {participant_id}', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { team: {} }, warnings: ['team_over_size', 'team_empty'] }));
    const out = await handleTeamsForm(post({ action: 'move', participant_id: 'p_7', from: 't_01', to: 't_02' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/equipos?ok=movido&warn=team_over_size%2Cteam_empty');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/teams/t_02/members');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ participant_id: 'p_7' });
  });

  it('mover a "sin equipo": DELETE …/teams/{from}/members/{pid}', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okTeam());
    const out = await handleTeamsForm(post({ action: 'move', participant_id: 'p_7', from: 't_01', to: 'none' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/equipos?ok=quitado');
    const { url, init } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/teams/t_01/members/p_7');
    expect(init.method).toBe('DELETE');
  });

  it('mover sin datos válidos no toca el backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await handleTeamsForm(post({ action: 'move', participant_id: '', to: 't_02' }), 'c', 'demo')).result?.fields).toEqual(['participant_id']);
    expect((await handleTeamsForm(post({ action: 'move', participant_id: 'p_1', to: 'none' }), 'c', 'demo')).result?.fields).toEqual(['from']);
    expect((await handleTeamsForm(post({ action: 'move', participant_id: 'p_1', to: 'x/y' }), 'c', 'demo')).result?.fields).toEqual(['to']);
    expect((await handleTeamsForm(post({ action: 'rename', id: '', name: 'x' }), 'c', 'demo')).result?.fields).toEqual(['id']);
    expect((await handleTeamsForm(post({ action: 'fusionar', id: 't_01' }), 'c', 'demo')).result?.fields).toEqual(['action']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el 409 del backend (equipo bloqueado) vuelve a la página', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'team_locked', message: 'tiene entrega' }, 409));
    const out = await handleTeamsForm(post({ action: 'delete', id: 't_01' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('delete');
    expect(out.result?.status).toBe(409);
    expect(out.result?.error).toBe('team_locked');
  });

  it('generar: previsualización con dry_run se queda en la página; generar redirige', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ ok: true, data: { teams: 3, kept: 1, created: 2, warnings: ['teams_replaced'] }, warnings: ['teams_replaced'], dry_run: true }));
    const prev = await handleTeamsForm(post({ action: 'generate_preview', keep_manual: 'on' }), 'c', 'demo');
    expect(prev.redirect).toBeUndefined();
    expect(prev.action).toBe('generate_preview');
    expect(prev.result?.ok).toBe(true);
    expect(prev.result?.data).toEqual({ teams: 3, kept: 1, created: 2, warnings: ['teams_replaced'] });
    let c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/teams/generate');
    expect(c.body).toEqual({ keep_manual: true, dry_run: true });

    const gen = await handleTeamsForm(post({ action: 'generate' }), 'c', 'demo');
    expect(gen.redirect).toBe('/events/admin/demo/equipos?ok=generado&warn=teams_replaced');
    c = lastCall(spy);
    expect(c.body).toEqual({ keep_manual: false, dry_run: false });
  });
});
