import { useState } from 'preact/hooks';

export default function VoteButton(
  { teamId, votedTeamId, t }:
  { teamId: string; votedTeamId?: string | null; t: Record<string, string> }
) {
  // ¿Ya votó (a cualquier equipo)? ¿Es ESTE el equipo votado?
  const hasVoted = Boolean(votedTeamId);
  const initial: 'idle' | 'voted' = votedTeamId === teamId ? 'voted' : 'idle';
  const [state, setState] = useState<'idle' | 'busy' | 'voted' | 'self' | 'login' | 'not_eligible' | 'error'>(initial);

  async function vote() {
    setState('busy');
    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }),
      });
    } catch { setState('error'); return; }
    // En éxito recargamos: el SSR vuelve a leer my_vote y deja un único ✓ coherente
    // en toda la galería (las tarjetas son islas independientes).
    if (resp.ok) { window.location.reload(); return; }
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    const code = body?.error ?? '';
    if (resp.status === 401) { setState('login'); return; }
    if (code === 'self_vote') { setState('self'); return; }
    if (code === 'not_eligible') { setState('not_eligible'); return; }
    setState('error');
  }

  if (state === 'voted') return <span class="font-mono text-xs text-violet-400">{t.yourVote}</span>;
  if (state === 'self') return <span class="font-mono text-xs text-neutral-500">{t.selfVote}</span>;
  if (state === 'login') return <a href="/hackaton" class="font-mono text-xs text-violet-400">{t.loginToVote}</a>;
  if (state === 'not_eligible') return <span class="font-mono text-xs text-neutral-500">{t.notEligible}</span>;
  return (
    <button onClick={vote} disabled={state === 'busy'}
      class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
      {state === 'busy' ? t.voting : (hasVoted ? t.changeVote : t.vote)}
    </button>
  );
}
