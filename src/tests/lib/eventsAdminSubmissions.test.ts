import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { handleSubmissionsForm } from '../../lib/eventsAdminSubmissions';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PAGE = 'https://nan.builders/events/admin/demo/entregas';

function post(fields: Record<string, string>): Request {
  const fd = new URLSearchParams(fields);
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

const okSub = (warnings: string[] = []) => json({ ok: true, data: { submission: { id: 's_01' } }, warnings });

afterEach(() => vi.restoreAllMocks());

describe('handleSubmissionsForm', () => {
  it('ignora el GET y rechaza otro origen', async () => {
    expect(await handleSubmissionsForm(new Request(PAGE), 'c', 'demo')).toEqual({});
    const foreign = new Request(PAGE, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=verify' });
    expect(await handleSubmissionsForm(foreign, 'c', 'demo')).toEqual({ forbidden: true });
  });

  it('verificar todas: POST …/admin/verify sin id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { verified: 3 }, warnings: [] }));
    const out = await handleSubmissionsForm(post({ action: 'verify' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/entregas?ok=verificado');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/verify');
    expect(init.method).toBe('POST');
    expect(body).toEqual({});
  });

  it('editar: PUT parcial solo con los campos presentes en el formulario', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okSub(['checks_rerun']));
    const out = await handleSubmissionsForm(post({ action: 'update', id: 's_01', title: ' Mi app ', public_url: 'https://a.test', repo_url: '' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/entregas?ok=entrega_editada&warn=checks_rerun');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/submissions/s_01');
    expect(init.method).toBe('PUT');
    expect(body).toEqual({ title: 'Mi app', public_url: 'https://a.test', repo_url: '' });
  });

  it('retirar y restaurar: POST …/withdraw y …/restore', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okSub());
    const w = await handleSubmissionsForm(post({ action: 'withdraw', id: 's_01' }), 'c', 'demo');
    expect(w.redirect).toBe('/events/admin/demo/entregas?ok=entrega_retirada');
    let c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/submissions/s_01/withdraw');
    expect(c.init.method).toBe('POST');

    const r = await handleSubmissionsForm(post({ action: 'restore', id: 's_01' }), 'c', 'demo');
    expect(r.redirect).toBe('/events/admin/demo/entregas?ok=entrega_restaurada');
    c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/submissions/s_01/restore');
  });

  it('check: PUT …/checks/{name} con pass y motivo, o reset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okSub());
    const force = await handleSubmissionsForm(post({ action: 'check', id: 's_01', name: 'url_live', pass: 'false', reason: 'caída' }), 'c', 'demo');
    expect(force.redirect).toBe('/events/admin/demo/entregas?ok=check_forzado');
    let c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/submissions/s_01/checks/url_live');
    expect(c.init.method).toBe('PUT');
    expect(c.body).toEqual({ pass: false, reason: 'caída' });

    const reset = await handleSubmissionsForm(post({ action: 'check', id: 's_01', name: 'url_live', reset: 'on' }), 'c', 'demo');
    expect(reset.redirect).toBe('/events/admin/demo/entregas?ok=check_reiniciado');
    c = lastCall(spy);
    expect(c.body).toEqual({ reset: true });
  });

  it('premio: PUT …/prize-eligibility con eligible y motivo, o reset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okSub());
    const fix = await handleSubmissionsForm(post({ action: 'prize', id: 's_01', eligible: 'false', reason: 'plagio' }), 'c', 'demo');
    expect(fix.redirect).toBe('/events/admin/demo/entregas?ok=premio');
    let c = lastCall(spy);
    expect(c.url).toBe('https://api.test/api/events/demo/admin/submissions/s_01/prize-eligibility');
    expect(c.init.method).toBe('PUT');
    expect(c.body).toEqual({ eligible: false, reason: 'plagio' });

    const reset = await handleSubmissionsForm(post({ action: 'prize', id: 's_01', reset: 'on' }), 'c', 'demo');
    expect(reset.redirect).toBe('/events/admin/demo/entregas?ok=premio_automatico');
    c = lastCall(spy);
    expect(c.body).toEqual({ reset: true });
  });

  it('sin datos válidos no toca el backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await handleSubmissionsForm(post({ action: 'withdraw', id: '' }), 'c', 'demo')).result?.fields).toEqual(['id']);
    expect((await handleSubmissionsForm(post({ action: 'check', id: 's_01', name: '../x', pass: 'true' }), 'c', 'demo')).result?.fields).toEqual(['name']);
    expect((await handleSubmissionsForm(post({ action: 'check', id: 's_01', name: 'url_live' }), 'c', 'demo')).result?.fields).toEqual(['pass']);
    expect((await handleSubmissionsForm(post({ action: 'prize', id: 's_01', eligible: 'quizá' }), 'c', 'demo')).result?.fields).toEqual(['eligible']);
    expect((await handleSubmissionsForm(post({ action: 'borrar', id: 's_01' }), 'c', 'demo')).result?.fields).toEqual(['action']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el 409 del backend (propietario desaparecido) vuelve a la página', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'submission_owner_gone', message: 'equipo disuelto' }, 409));
    const out = await handleSubmissionsForm(post({ action: 'restore', id: 's_01' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('restore');
    expect(out.result?.status).toBe(409);
    expect(out.result?.error).toBe('submission_owner_gone');
  });
});
