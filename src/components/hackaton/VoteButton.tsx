import { useState, useEffect } from 'preact/hooks';

export default function VoteButton(
  { teamId, votedTeamId, loginHref = '/hackaton', t }:
  { teamId: string; votedTeamId?: string | null; loginHref?: string; t: Record<string, string> }
) {
  // ¿Ya votó (a cualquier equipo)? ¿Es ESTE el equipo votado?
  const hasVoted = Boolean(votedTeamId);
  const initial: 'idle' | 'voted' = votedTeamId === teamId ? 'voted' : 'idle';
  const [state, setState] = useState<'idle' | 'busy' | 'voted' | 'self' | 'login' | 'not_eligible' | 'error'>(initial);

  useEffect(() => {
    // Otra tarjeta registró un voto: si fue para este equipo, marca ✓; si fue
    // para otro, limpia el ✓ que pudiéramos tener (las islas son independientes).
    function onVoted(e: Event) {
      const votedId = (e as CustomEvent<{ teamId: string }>).detail?.teamId;
      setState(votedId === teamId ? 'voted' : 'idle');
    }
    window.addEventListener('nan:voted', onVoted);
    return () => window.removeEventListener('nan:voted', onVoted);
  }, [teamId]);

  async function vote() {
    setState('busy');
    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }),
      });
    } catch { setState('error'); return; }
    // En éxito: marca este voto y notifica a las otras tarjetas (islas
    // independientes) para que limpien su ✓ sin recargar la página.
    if (resp.ok) {
      setState('voted');
      window.dispatchEvent(new CustomEvent('nan:voted', { detail: { teamId } }));
      return;
    }
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    const code = body?.error ?? '';
    if (resp.status === 401) { setState('login'); return; }
    if (code === 'self_vote') { setState('self'); return; }
    if (code === 'not_eligible') { setState('not_eligible'); return; }
    setState('error');
  }

  if (state === 'voted') return <span class="font-mono text-xs text-violet-400">{t.yourVote}</span>;
  if (state === 'self') return <span class="font-mono text-xs text-neutral-500">{t.selfVote}</span>;
  if (state === 'login') return <a href={loginHref} class="font-mono text-xs text-violet-400">{t.loginToVote}</a>;
  if (state === 'not_eligible') return <span class="font-mono text-xs text-neutral-500">{t.notEligible}</span>;
  return (
    <button onClick={vote} disabled={state === 'busy'}
      class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
      {state === 'busy' ? t.voting : (hasVoted ? t.changeVote : t.vote)}
    </button>
  );
}
