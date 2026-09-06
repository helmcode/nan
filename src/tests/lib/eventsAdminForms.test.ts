import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import {
  doneHref, eventToForm, formToEventBody, formValues, handleEventForm, handleNewEventForm,
  isoToLocal, localToIso, NEW_EVENT_DEFAULTS, readFlash, sameOrigin, splitList, stateTargets, statusSequence,
} from '../../lib/eventsAdminForms';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function post(fields: Record<string, string | string[]>, headers: Record<string, string> = {}): Request {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return new Request('https://nan.builders/events/admin/nuevo', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://nan.builders', ...headers },
    body: fd.toString(),
  });
}

describe('fechas y listas', () => {
  it('convierte RFC 3339 ⇄ datetime-local en UTC', () => {
    expect(isoToLocal('2027-01-10T00:00:00Z')).toBe('2027-01-10T00:00');
    expect(isoToLocal(null)).toBe('');
    expect(isoToLocal('no es fecha')).toBe('');
    expect(localToIso('2027-01-10T00:00')).toBe('2027-01-10T00:00:00Z');
    expect(localToIso('2027-02-12T18:30')).toBe('2027-02-12T18:30:00Z');
    expect(localToIso('')).toBeNull();
    expect(localToIso('basura')).toBeNull();
  });

  it('parte listas por comas o saltos de línea sin vacíos ni duplicados', () => {
    expect(splitList(' backend, frontend ,\ndevops,backend,, ')).toEqual(['backend', 'frontend', 'devops']);
    expect(splitList('')).toEqual([]);
  });
});

describe('formToEventBody', () => {
  it('produce el event.json de §5.1 a partir de los valores por defecto', () => {
    const body = formToEventBody(eventToForm({ ...NEW_EVENT_DEFAULTS, slug: 'demo-2027', name: 'Demo' })) as Record<string, any>;
    expect(body.slug).toBe('demo-2027');
    expect(body.name).toBe('Demo');
    expect(body.kind).toBe('hackathon');
    expect(body.format).toBe('team');
    expect(body.modules).toEqual({ registration: true, teams: true, submissions: true, voting: true });
    expect(body.automation).toEqual({ date_transitions: true });
    expect(body.dates).toEqual({
      registration_open: null, registration_close: null, submission_open: null, submission_close: null,
      voting_open: null, voting_close: null, demo_day: null,
    });
    expect(body.registration).toEqual({
      capacity: 40, reserve_capacity: 10, discord_user: 'required',
      specialties: ['backend', 'frontend', 'devops', 'data'], levels: ['junior', 'mid', 'senior'],
    });
    expect(body.team).toEqual({ size: 4, min_size: 3, max_teams: 10 });
    expect(body.submission).toEqual({
      fields: { description: 'optional', repo_url: 'required', space_url: 'optional', image_url: 'optional', video_url: 'optional' },
      checks: ['url_live', 'repo_public'], prize_requires: ['repo_public'], gallery_visibility: 'from_voting',
    });
    // auto_max se deriva de los checks que puntúan (url_live sí, repo_public no).
    expect(body.voting).toEqual({ enabled: true, vote_weight: 8, auto_max: 1 });
  });

  it('formato individual: sin bloque team y modules.teams=false; votación apagada apaga modules.voting', () => {
    const body = formToEventBody({
      slug: 's', name: 'S', format: 'solo', module_registration: 'on', module_submissions: 'on',
      checks: ['url_live', 'in_nan_space'], prize_requires: ['repo_public'],
    }) as Record<string, any>;
    expect(body.team).toBeUndefined();
    expect(body.modules).toEqual({ registration: true, teams: false, submissions: true, voting: false });
    expect(body.voting.enabled).toBe(false);
    expect(body.voting.auto_max).toBe(2);
    // prize_requires solo con checks activos.
    expect(body.submission.prize_requires).toEqual([]);
  });

  it('las fechas del formulario van en UTC y los números se truncan', () => {
    const body = formToEventBody({
      slug: 's', name: 'S', format: 'team', date_registration_open: '2027-01-10T00:00', date_demo_day: '2027-02-12T18:00',
      capacity: '12.7', team_size: '5', team_min_size: '2', team_max_teams: 'x', checks: [], prize_requires: [],
    }) as Record<string, any>;
    expect(body.dates.registration_open).toBe('2027-01-10T00:00:00Z');
    expect(body.dates.demo_day).toBe('2027-02-12T18:00:00Z');
    expect(body.dates.voting_close).toBeNull();
    expect(body.registration.capacity).toBe(12);
    expect(body.team).toEqual({ size: 5, min_size: 2, max_teams: 0 });
  });

  it('eventToForm → formToEventBody conserva un event.json real', () => {
    const ev = {
      ...NEW_EVENT_DEFAULTS, slug: 'gauntlet-2026-08', name: 'Gauntlet', description: 'd', rules: 'r', prize: 'p',
      dates: { registration_open: '2026-08-01T00:00:00Z', registration_close: '2026-08-10T00:00:00Z', submission_open: null, submission_close: '2026-08-20T00:00:00Z', voting_open: null, voting_close: null, demo_day: null },
      submission: { ...NEW_EVENT_DEFAULTS.submission!, checks: ['url_live', 'in_nan_space', 'repo_public'], prize_requires: ['repo_public'] },
      voting: { enabled: true, vote_weight: 8, auto_max: 2 },
    };
    const body = formToEventBody(eventToForm(ev)) as Record<string, any>;
    expect(body.dates).toEqual(ev.dates);
    expect(body.submission.checks).toEqual(ev.submission.checks);
    expect(body.voting).toEqual(ev.voting);
    expect(body.description).toBe('d');
  });
});

describe('formValues', () => {
  it('agrupa los checkboxes múltiples y deja el resto como texto', () => {
    const fd = new FormData();
    fd.append('name', 'X');
    fd.append('checks', 'url_live');
    fd.append('checks', 'repo_public');
    expect(formValues(fd)).toEqual({ name: 'X', checks: ['url_live', 'repo_public'], prize_requires: [] });
  });
});

describe('sameOrigin y flash', () => {
  it('acepta same-origin y rechaza otro sitio', () => {
    expect(sameOrigin(new Request('https://nan.builders/x', { method: 'POST' }))).toBe(true);
    expect(sameOrigin(new Request('https://nan.builders/x', { method: 'POST', headers: { origin: 'https://nan.builders' } }))).toBe(true);
    expect(sameOrigin(new Request('https://nan.builders/x', { method: 'POST', headers: { origin: 'https://evil.test' } }))).toBe(false);
    expect(sameOrigin(new Request('https://nan.builders/x', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }))).toBe(false);
    expect(sameOrigin(new Request('https://nan.builders/x', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }))).toBe(true);
  });

  it('doneHref y readFlash solo usan claves conocidas', () => {
    expect(doneHref('demo', 'creado')).toBe('/events/admin/demo?ok=creado');
    expect(doneHref('demo', 'guardado', ['no_change', 'slug_changed'])).toBe('/events/admin/demo?ok=guardado&warn=slug_changed');
    expect(readFlash(new URL('https://nan.builders/events/admin/demo?ok=guardado&warn=slug_changed,x-y'))).toEqual({ ok: 'Cambios guardados.', warnings: ['slug_changed'] });
    expect(readFlash(new URL('https://nan.builders/events/admin/demo?ok=<script>'))).toEqual({ ok: null, warnings: [] });
  });
});

describe('handleNewEventForm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GET: nada que hacer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await handleNewEventForm(new Request('https://nan.builders/events/admin/nuevo'), 'c')).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });

  it('POST desde otro origen: forbidden sin tocar el backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await handleNewEventForm(post({ name: 'X' }, { origin: 'https://evil.test' }), 'c');
    expect(out).toEqual({ forbidden: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('crear: POST admin/events y redirección a la ficha con ?ok=creado', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { event: { slug: 'demo-2027' } }, warnings: ['automation_dates_missing'] }));
    const out = await handleNewEventForm(post({ action: 'create', slug: 'demo-2027', name: 'Demo', format: 'team' }), 'nan_session=x');
    expect(out.redirect).toBe('/events/admin/demo-2027?ok=creado&warn=automation_dates_missing');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/events/admin/events');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.slug).toBe('demo-2027');
    expect(sent.dry_run).toBeUndefined();
  });

  it('simular: manda dry_run y no redirige aunque valide', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { event: { slug: 'demo' } }, warnings: [], dry_run: true }));
    const out = await handleNewEventForm(post({ action: 'simulate', slug: 'demo', name: 'Demo' }), 'c');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('simulate');
    expect(out.result?.ok).toBe(true);
    expect(out.values?.slug).toBe('demo');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).dry_run).toBe(true);
  });

  it('error del backend: vuelve con el resultado y los valores escritos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'event_exists', message: 'ya existe' }, 409));
    const out = await handleNewEventForm(post({ action: 'create', slug: 'demo', name: 'Demo' }), 'c');
    expect(out.redirect).toBeUndefined();
    expect(out.result).toMatchObject({ ok: false, status: 409, error: 'event_exists' });
    expect(out.values?.name).toBe('Demo');
  });
});

describe('handleEventForm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('guardar: PUT {slug}/admin y redirección; un renombrado redirige al slug nuevo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { event: { slug: 'nuevo' } }, warnings: ['slug_changed'] }));
    const out = await handleEventForm(post({ action: 'save', slug: 'nuevo', name: 'N' }), 'c', 'viejo');
    expect(out.redirect).toBe('/events/admin/nuevo?ok=guardado&warn=slug_changed');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/events/viejo/admin');
    expect(init.method).toBe('PUT');
  });

  it('clonar: POST admin/events/{slug}/clone con el slug nuevo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { event: { slug: 'copia' } }, warnings: [] }));
    const out = await handleEventForm(post({ action: 'clone', clone_slug: 'copia' }), 'c', 'orig');
    expect(out.redirect).toBe('/events/admin/copia?ok=clonado');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/events/admin/events/orig/clone');
    expect(JSON.parse(init.body as string)).toEqual({ slug: 'copia' });
  });

  it('archivar: sin force y con archive_active no redirige; con force sí', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { archived: false, status: 'draft' }, warnings: ['archive_active'] }));
    const out = await handleEventForm(post({ action: 'archive' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.result?.warnings).toEqual(['archive_active']);
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ force: false });

    vi.restoreAllMocks();
    // Con force el backend archiva y sigue avisando archive_active: manda `archived`.
    const spy2 = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { archived: true, status: 'draft' }, warnings: ['archive_active'] }));
    const out2 = await handleEventForm(post({ action: 'archive', force: 'on' }), 'c', 'demo');
    expect(out2.redirect).toBe('/events/admin/demo?ok=archivado&warn=archive_active');
    expect(spy2.mock.calls[0][0]).toBe('https://api.test/api/events/demo/admin/archive');
    expect(JSON.parse((spy2.mock.calls[0][1] as RequestInit).body as string)).toEqual({ force: true });
  });

  it('desarchivar: POST {slug}/admin/unarchive', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { archived: false, status: 'draft' }, warnings: [] }));
    const out = await handleEventForm(post({ action: 'unarchive' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo?ok=desarchivado');
    expect(spy.mock.calls[0][0]).toBe('https://api.test/api/events/demo/admin/unarchive');
  });
});

describe('máquina de estados (SPEC v3 §4)', () => {
  const full = { registration: true, teams: true, submissions: true, voting: true };
  const solo = { registration: true, teams: false, submissions: true, voting: false };
  const workshop = { registration: true, teams: false, submissions: false, voting: false };
  const info = { registration: false, teams: false, submissions: false, voting: false };

  it('statusSequence sigue el orden canónico según módulos', () => {
    expect(statusSequence(full)).toEqual(['draft', 'registration', 'building', 'submission', 'voting', 'closed']);
    expect(statusSequence(solo)).toEqual(['draft', 'building', 'submission', 'closed']);
    expect(statusSequence(workshop)).toEqual(['draft', 'registration', 'closed']);
    expect(statusSequence(info)).toEqual(['draft', 'closed']);
  });

  it('stateTargets: avanzar libre, retroceder uno, cancelar salvo desde closed', () => {
    expect(stateTargets('building', full)).toEqual([
      { status: 'registration', move: 'back' },
      { status: 'submission', move: 'forward' },
      { status: 'voting', move: 'forward' },
      { status: 'closed', move: 'forward' },
      { status: 'cancelled', move: 'cancel' },
    ]);
    expect(stateTargets('draft', info)).toEqual([{ status: 'closed', move: 'forward' }, { status: 'cancelled', move: 'cancel' }]);
    expect(stateTargets('closed', full)).toEqual([{ status: 'voting', move: 'back' }]);
  });

  it('stateTargets: desde cancelled solo se vuelve al estado previo', () => {
    expect(stateTargets('cancelled', full, 'submission')).toEqual([{ status: 'submission', move: 'restore' }]);
    expect(stateTargets('cancelled', full, null)).toEqual([]);
  });

  it('readFlash conoce estado y sweep', () => {
    expect(readFlash(new URL('https://x/e?ok=estado&warn=voting_not_open')).ok).toMatch(/Estado cambiado/);
    expect(readFlash(new URL('https://x/e?ok=sweep')).ok).toMatch(/Sweep/);
  });
});

describe('handleEventForm: estado y sweep', () => {
  afterEach(() => vi.restoreAllMocks());

  it('state_preview: POST admin/state con dry_run y sin redirección', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { status: 'voting', phase: 'voting' }, warnings: ['voting_not_open'], dry_run: true }));
    const out = await handleEventForm(post({ action: 'state_preview', status: 'voting' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('state_preview');
    expect(out.result?.warnings).toEqual(['voting_not_open']);
    expect(out.values?.status).toBe('voting');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/events/demo/admin/state');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'voting', dry_run: true });
  });

  it('state: confirma la transición y redirige con los avisos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { status: 'voting', phase: 'voting' }, warnings: ['voting_not_open'] }));
    const out = await handleEventForm(post({ action: 'state', status: 'voting' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo?ok=estado&warn=voting_not_open');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: 'voting', dry_run: false });
  });

  it('state: una transición no permitida vuelve con el error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: false, error: 'invalid_transition', message: 'transición de estado no permitida' }, 400));
    const out = await handleEventForm(post({ action: 'state', status: 'draft' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.result?.ok).toBe(false);
    expect(out.result?.error).toBe('invalid_transition');
  });

  it('sweep: redirige solo si hubo transición', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { automation: false, from: 'registration', status: 'registration', transitions: [], teams_created: 0 }, warnings: ['automation_off'] }));
    const out = await handleEventForm(post({ action: 'sweep' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('sweep');
    expect(out.result?.warnings).toEqual(['automation_off']);
    expect(spy.mock.calls[0][0]).toBe('https://api.test/api/events/demo/admin/sweep');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true, data: { automation: true, from: 'registration', status: 'building', transitions: ['registration→building'], teams_created: 2 }, warnings: [] }));
    const out2 = await handleEventForm(post({ action: 'sweep' }), 'c', 'demo');
    expect(out2.redirect).toBe('/events/admin/demo?ok=sweep');
  });
});
