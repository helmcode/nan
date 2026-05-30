import { useState } from 'preact/hooks';

export default function VoteButton({ teamId, t }: { teamId: string; t: Record<string, string> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'voted' | 'self' | 'dup' | 'login' | 'not_eligible' | 'error'>('idle');
  async function vote() {
    setState('busy');
    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team_id: teamId }),
      });
    } catch { setState('error'); return; }
    const body = await resp.json().catch(() => null);
    const code = body?.error ?? '';
    if (resp.ok) { setState('voted'); return; }
    if (resp.status === 401) { setState('login'); return; }
    if (code === 'self_vote') { setState('self'); return; }
    if (code === 'not_eligible') { setState('not_eligible'); return; }
    if (code === 'already_voted' || resp.status === 409) { setState('dup'); return; }
    setState('error');
  }
  if (state === 'voted') return <span class="font-mono text-xs text-violet-400">{t.voted}</span>;
  if (state === 'self') return <span class="font-mono text-xs text-neutral-500">{t.selfVote}</span>;
  if (state === 'dup') return <span class="font-mono text-xs text-neutral-500">{t.alreadyVoted}</span>;
  if (state === 'login') return <a href="/login?redirect=/hackaton/projects" class="font-mono text-xs text-violet-400">{t.loginToVote}</a>;
  if (state === 'not_eligible') return <span class="font-mono text-xs text-neutral-500">{t.notEligible}</span>;
  return (
    <button onClick={vote} disabled={state === 'busy'}
      class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
      {state === 'busy' ? t.voting : t.vote}
    </button>
  );
}
