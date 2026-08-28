import { useState, useEffect } from 'preact/hooks';

/**
 * Botón de voto de una entrega (SPEC §6.3 `POST /api/events/{slug}/vote`).
 * Cada tarjeta es una isla independiente: se sincronizan con el evento
 * `nan:voted` para que solo una muestre el ✓.
 */
export default function VoteButton(
  { slug, submissionId, votedSubmissionId, loginHref, t }:
  { slug: string; submissionId: string; votedSubmissionId?: string | null; loginHref: string; t: Record<string, string> }
) {
  // ¿Ya votó (a cualquier entrega)? ¿Es ESTA la entrega votada?
  const hasVoted = Boolean(votedSubmissionId);
  const initial: 'idle' | 'voted' = votedSubmissionId === submissionId ? 'voted' : 'idle';
  const [state, setState] = useState<'idle' | 'busy' | 'voted' | 'self' | 'login' | 'not_eligible' | 'closed' | 'error'>(initial);

  useEffect(() => {
    // Otra tarjeta registró un voto: si fue para esta entrega, marca ✓; si fue
    // para otra, limpia el ✓ que pudiéramos tener.
    function onVoted(e: Event) {
      const votedId = (e as CustomEvent<{ submissionId: string }>).detail?.submissionId;
      setState(votedId === submissionId ? 'voted' : 'idle');
    }
    window.addEventListener('nan:voted', onVoted);
    return () => window.removeEventListener('nan:voted', onVoted);
  }, [submissionId]);

  async function vote() {
    setState('busy');
    let resp: Response;
    try {
      resp = await fetch(`/api/events/${slug}/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submission_id: submissionId }),
      });
    } catch { setState('error'); return; }
    if (resp.ok) {
      setState('voted');
      window.dispatchEvent(new CustomEvent('nan:voted', { detail: { submissionId } }));
      return;
    }
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    const code = body?.error ?? '';
    if (resp.status === 401) { setState('login'); return; }
    if (code === 'self_vote') { setState('self'); return; }
    if (code === 'not_eligible') { setState('not_eligible'); return; }
    if (code === 'voting_closed') { setState('closed'); return; }
    setState('error');
  }

  if (state === 'voted') return <span class="font-mono text-xs text-violet-400">{t.yourVote}</span>;
  if (state === 'self') return <span class="font-mono text-xs text-neutral-500">{t.selfVote}</span>;
  if (state === 'login') return <a href={loginHref} class="font-mono text-xs text-violet-400">{t.loginToVote}</a>;
  if (state === 'not_eligible') return <span class="font-mono text-xs text-neutral-500">{t.notEligible}</span>;
  if (state === 'closed') return <span class="font-mono text-xs text-neutral-500">{t.votingClosed}</span>;
  return (
    <button onClick={vote} disabled={state === 'busy'}
      class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
      {state === 'busy' ? t.voting : (hasVoted ? t.changeVote : t.vote)}
    </button>
  );
}
