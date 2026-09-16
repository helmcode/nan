import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { CLOUD_API_URL: 'https://api.test' } }));

import { handleVotesForm, voteStats, type AdminVoteRow } from '../../lib/eventsAdminVotes';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PAGE = 'https://nan.builders/events/admin/demo/votos';

function post(fields: Record<string, string>): Request {
  return new Request(PAGE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://nan.builders' },
    body: new URLSearchParams(fields).toString(),
  });
}

function lastCall(spy: ReturnType<typeof vi.spyOn>) {
  const [url, init] = spy.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

const vote = (over: Partial<AdminVoteRow> = {}): AdminVoteRow => ({
  id: 'v_01', voter_email: 'a@x.test', voter_member_uuid: 'u1', submission_id: 's_01', submission_title: 'App',
  withdrawn: false, owner: { type: 'team', id: 't_01', name: 'Equipo 1' }, created_at: '2026-09-01T10:00:00Z',
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('voteStats', () => {
  it('cuenta los votos válidos, los descartados y los votantes distintos', () => {
    const s = voteStats([
      vote(),
      vote({ id: 'v_02', voter_email: 'b@x.test', voter_member_uuid: 'u2', withdrawn: true }),
      vote({ id: 'v_03', voter_email: 'a@x.test', voter_member_uuid: 'u1', submission_id: 's_09', submission_title: '', owner: null }),
    ]);
    expect(s).toEqual({ total: 3, counted: 1, discarded: 2, voters: 2 });
    expect(voteStats([])).toEqual({ total: 0, counted: 0, discarded: 0, voters: 0 });
  });
});

describe('handleVotesForm (W-08)', () => {
  it('ignora el GET y rechaza otro origen', async () => {
    expect(await handleVotesForm(new Request(PAGE), 'c', 'demo')).toEqual({});
    const foreign = new Request(PAGE, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=open' });
    expect(await handleVotesForm(foreign, 'c', 'demo')).toEqual({ forbidden: true });
  });

  it('una acción desconocida no llama al backend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await handleVotesForm(post({ action: 'delete' }), 'c', 'demo');
    expect(spy).not.toHaveBeenCalled();
    expect(out.result?.ok).toBe(false);
    expect(out.result?.fields).toEqual(['action']);
  });

  it('previsualizar apertura: POST …/voting/open?dry_run=true y se queda en la página', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { voting: 'open' }, warnings: ['voting_not_open'] }));
    const out = await handleVotesForm(post({ action: 'open_preview' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.action).toBe('open_preview');
    expect(out.result?.ok).toBe(true);
    const { url, init } = lastCall(spy);
    expect(url).toBe('https://api.test/api/events/demo/admin/voting/open?dry_run=true');
    expect(init.method).toBe('POST');
  });

  it('abrir de verdad redirige con el flash', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: { voting: 'open' }, warnings: [] }));
    const out = await handleVotesForm(post({ action: 'open' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/votos?ok=votacion_abierta');
    expect(lastCall(spy).url).toBe('https://api.test/api/events/demo/admin/voting/open');
  });

  it('cerrar: previsualización con el ranking y cierre real con avisos en el flash', async () => {
    const board = { rows: [{ rank: 1, submission_id: 's_01', owner: { type: 'team', id: 't_01', name: 'Equipo 1' }, title: 'App', votes: 3, vote_points: 8, auto_points: 1, total: 9, not_prize_eligible: false }], public: true };
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: true, data: board, warnings: ['leaderboard_public'] }));
    const prev = await handleVotesForm(post({ action: 'close_preview' }), 'c', 'demo');
    expect(prev.redirect).toBeUndefined();
    expect(prev.result?.data).toEqual(board);
    expect(lastCall(spy).url).toBe('https://api.test/api/events/demo/admin/voting/close?dry_run=true');

    const out = await handleVotesForm(post({ action: 'close' }), 'c', 'demo');
    expect(out.redirect).toBe('/events/admin/demo/votos?ok=votacion_cerrada&warn=leaderboard_public');
    expect(lastCall(spy).url).toBe('https://api.test/api/events/demo/admin/voting/close');
  });

  it('un error del backend se queda en la página sin redirigir', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ ok: false, error: 'invalid_transition', message: 'transición de estado no permitida' }, 400));
    const out = await handleVotesForm(post({ action: 'open' }), 'c', 'demo');
    expect(out.redirect).toBeUndefined();
    expect(out.result?.ok).toBe(false);
    expect(out.result?.error).toBe('invalid_transition');
  });
});
