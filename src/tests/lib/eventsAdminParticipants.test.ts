import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { adminOptionLabel, handleParticipantsForm, participantProfile, participantsSearch, readParticipantFilters } from '../../lib/eventsAdminParticipants';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PAGE = 'https://nan.builders/events/admin/demo/participantes';

function post(fields: Record<string, string>): Request {
  const fd = new URLSearchParams(fields);
  return new Request(PAGE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://nan.builders' },
    body: fd.toString(),
  });
}

/** POST multipart como el del formulario de importación (fichero + botón pulsado). */
function postCsv(action: string, csv: string | null): Request {
  const fd = new FormData();
  fd.set('action', action);
  if (csv !== null) fd.set('csv', new File([csv], 'gente.csv', { type: 'text/csv' }));
  return new Request(PAGE, { method: 'POST', headers: { origin: 'https://nan.builders' }, body: fd });
}

function lastCall(spy: ReturnType<typeof vi.spyOn>) {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(init.body as string) : null };
}

afterEach(() => vi.restoreAllMocks());

describe('filtros de participantes', () => {
  it('lee ?estado=&equipo=&reserva=&q= y descarta lo que no reconoce', () => {
    const f = readParticipantFilters(new URL(`${PAGE}?estado=reserve&equipo=none&reserva=si&q=%20ana%20`));
    expect(f).toEqual({ status: 'reserve', team: 'none', reserve: 'si', q: 'ana' });
    expect(readParticipantFilters(new URL(`${PAGE}?estado=lo-que-sea&reserva=tal`))).toEqual({ status: '', team: '', reserve: '', q: '' });
  });

  it('traduce los filtros a la query del backend', () => {
    expect(participantsSearch({ status: '', team: '', reserve: '', q: '' })).toBe('');
    expect(participantsSearch({ status: 'withdrawn', team: 't1', reserve: 'no', q: 'ana' })).toBe('?status=withdrawn&team=t1&reserve=false&q=ana');
    expect(participantsSearch({ status: '', team: '', reserve: 'si', q: '' })).toBe('?reserve=true');
  });
});

describe('handleParticipantsForm', () => {
  it('ignora el GET y rechaza el POST de otro origen', async () => {
    expect(await handleParticipantsForm(new Request(PAGE), 'c', 'demo')).toEqual({});
    const foreign = new Request(PAGE, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=add' });
    expect(await handleParticipantsForm(foreign, 'c', 'demo')).toEqual({ forbidden: true });
  });

  it('alta: POST …/participants y vuelta a la pantalla con los avisos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { id: 'p1' }, warnings: ['capacity_exceeded'] }));
    const out = await handleParticipantsForm(post({ action: 'add', email: 'Ana@nan.test', name: 'Ana', reserve: 'on', notes: 'VIP' }), 'nan_session=s', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/participantes?ok=alta&warn=capacity_exceeded');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/participants');
    expect(init.method).toBe('POST');
    expect(body).toEqual({ email: 'Ana@nan.test', name: 'Ana', discord_user: '', specialty: '', level: '', reserve: true, notes: 'VIP' });
  });

  it('alta: si la cuenta no existe vuelve con el error y lo escrito', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'member_not_found', message: 'no hay cuenta' }, 404));
    const out = await handleParticipantsForm(post({ action: 'add', email: 'nadie@x.y' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('add');
    expect(out.result?.ok).toBe(false);
    expect(out.result?.error).toBe('member_not_found');
    expect(out.values?.email).toBe('nadie@x.y');
  });

  it('edición: PUT …/participants/{id} con los cinco campos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { participant: {}, changed: ['name'] } }));
    const out = await handleParticipantsForm(post({ action: 'update', id: 'p_1', name: 'Ana B', discord_user: 'ana', specialty: 'backend', level: 'mid', notes: '' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/participantes?ok=editado');
    const { url, init, body } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/participants/p_1');
    expect(init.method).toBe('PUT');
    expect(body).toEqual({ name: 'Ana B', discord_user: 'ana', specialty: 'backend', level: 'mid', notes: '' });
  });

  it('baja, promoción y reserva: POST …/participants/{id}/{acción} y su ?ok=', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { participant: {}, from: 'registered' }, warnings: ['seat_free'] }));
    const cases: [string, string][] = [['withdraw', 'baja'], ['promote', 'promovido'], ['demote', 'reserva']];
    for (const [action, ok] of cases) {
      const out = await handleParticipantsForm(post({ action, id: 'p_1' }), 'c', 'demo');
      expect(out.redirect).toBe(`/events/admin/demo/participantes?ok=${ok}&warn=seat_free`);
      const { url, body } = lastCall(spy);
      expect(url).toBe(`https://api.test/api/events/demo/admin/participants/p_1/${action}`);
      expect(body).toEqual({});
    }
  });

  it('reincorporar envía reserve y restore_submission según las casillas', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { participant: {}, from: 'withdrawn' } }));
    const out = await handleParticipantsForm(post({ action: 'reinstate', id: 'p_1', reserve: 'on' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/participantes?ok=reincorporado');
    expect(lastCall(spy).body).toEqual({ reserve: true, restore_submission: false });
  });

  it('no llama al backend sin id válido ni con acciones desconocidas', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const noId = await handleParticipantsForm(post({ action: 'withdraw', id: '../x' }), 'c', 'demo');
    expect(noId.result?.error).toBe('validation_failed');
    expect(noId.result?.fields).toEqual(['id']);
    const unknown = await handleParticipantsForm(post({ action: 'borrar', id: 'p_1' }), 'c', 'demo');
    expect(unknown.result?.fields).toEqual(['action']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el error del backend en una acción de estado vuelve a la página', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'participant_busy', message: 'tiene equipo' }, 409));
    const out = await handleParticipantsForm(post({ action: 'demote', id: 'p_1' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.result?.status).toBe(409);
    expect(out.result?.error).toBe('participant_busy');
  });

  it('previsualización de importación: CSV tal cual con ?dry_run=true, sin redirigir', async () => {
    const report = { rows: [{ line: 2, email: 'ana@nan.test', action: 'created' }], created: 1, updated: 0, restored: 0, unchanged: 0, rejected: 0 };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: report, dry_run: true }));
    const csv = 'email,name\nana@nan.test,Ana\n';
    const out = await handleParticipantsForm(postCsv('import_preview', csv), 'nan_session=s', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('import_preview');
    expect(out.result?.ok).toBe(true);
    expect(out.result?.dryRun).toBe(true);
    expect(out.result?.data).toEqual(report);
    const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://api.test/api/events/demo/admin/participants/import?dry_run=true');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(csv);
    expect(new Headers(init.headers).get('content-type')).toMatch(/^text\/csv/);
  });

  it('importación real: sin dry_run y también se queda en la página con el informe', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { rows: [], created: 0, updated: 0, restored: 0, unchanged: 0, rejected: 0 } }));
    const out = await handleParticipantsForm(postCsv('import', 'email\n'), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('import');
    expect((spy.mock.calls.at(-1) as [string])[0]).toBe('https://api.test/api/events/demo/admin/participants/import');
  });

  it('importación sin fichero: error local sin tocar el backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await handleParticipantsForm(postCsv('import', null), 'c', 'demo');
    expect(out.result?.ok).toBe(false);
    expect(out.result?.error).toBe('csv_invalid');
    const empty = await handleParticipantsForm(postCsv('import_preview', '   \n'), 'c', 'demo');
    expect(empty.result?.error).toBe('csv_invalid');
    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * El panel enseña el mismo vocabulario que la parte pública. Antes no: la web
 * pasaba especialidad y nivel por `optionLabel` y el panel los pintaba en
 * crudo, así que el organizador leía "devops" donde el participante leía
 * "Devops". Ahora los nueve puntos del panel pasan por estos dos helpers, que
 * son lo que se prueba aquí.
 */
describe('etiquetas del vocabulario en el panel', () => {
  it('traduce lo que el diccionario conoce y capitaliza lo que no', () => {
    // "frontend" está en `events.options`; "devops" lo escribió quien organiza.
    expect(adminOptionLabel('frontend')).toBe('Frontend');
    expect(adminOptionLabel('devops')).toBe('Devops');
    // Lo que ya viene con mayúscula no se toca.
    expect(adminOptionLabel('ML/IA')).toBe('ML/IA');
  });

  it('sin valor no imprime nada (ni "null" ni "undefined")', () => {
    expect(adminOptionLabel(null)).toBe('');
    expect(adminOptionLabel(undefined)).toBe('');
    expect(adminOptionLabel('')).toBe('');
  });

  it('la ficha junta especialidad y nivel ya etiquetados', () => {
    expect(participantProfile({ specialty: 'devops', level: 'junior' })).toBe('Devops · Junior');
  });

  it('la ficha omite el que falte y queda vacía si no hay ninguno', () => {
    // Quien llama decide el relleno ("—", el email…), así que aquí sale vacío
    // y no un separador suelto.
    expect(participantProfile({ specialty: 'devops', level: null })).toBe('Devops');
    expect(participantProfile({ specialty: null, level: 'junior' })).toBe('Junior');
    expect(participantProfile({ specialty: null, level: null })).toBe('');
  });
});
