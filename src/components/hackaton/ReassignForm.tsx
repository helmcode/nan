import { useState } from 'preact/hooks';

interface Member {
  id: string;
  name: string;
  discord_user?: string;
}

interface ReassignInfo {
  label: string;
  toggleAria: string;
  title: string;
  points: string[];
}

interface ReassignLabels {
  pending: string; // admite {have}/{need}
  filled: string;
  noPool: string;
  already: string;
  selectAbsent: string;
  errorSubmit: string;
  sending: string;
}

export default function ReassignForm({
  members,
  ctaLabel,
  info,
  labels,
}: {
  members: Member[];
  ctaLabel: string;
  info: ReassignInfo;
  labels: ReassignLabels;
}) {
  const [ghostId, setGhostId] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  async function submit() {
    if (!ghostId) return;
    setState('busy');
    try {
      const resp = await fetch('/api/hackaton/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghost_id: ghostId }),
      });
      const body = await resp.json().catch(() => null) as { data?: any; error?: string } | null;
      if (!resp.ok) {
        // 409 already_voted: ya convocó esta reasignación, sigue pendiente del 2º voto.
        if (resp.status === 409 && body?.error === 'already_voted') {
          setResult(labels.already);
          setState('done');
          return;
        }
        setState('error');
        return;
      }
      const r = body?.data;
      if (r?.status === 'filled') setResult(labels.filled);
      else if (r?.status === 'no_pool') setResult(labels.noPool);
      else {
        const have = String(r?.requested_by?.length ?? 1);
        const need = String(r?.quorum ?? 2);
        setResult(labels.pending.replaceAll('{have}', have).replaceAll('{need}', need));
      }
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return <p class="font-mono text-sm text-violet-400">{result}</p>;
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="font-mono text-xs uppercase tracking-widest text-neutral-400">{info.label}</span>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-expanded={showInfo}
          aria-label={info.toggleAria}
          title={info.toggleAria}
          class="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-700 text-[10px] font-mono text-neutral-400 transition-colors hover:border-violet-400 hover:text-violet-300">
          i
        </button>
      </div>

      {showInfo && (
        <div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 space-y-2">
          <p class="font-mono text-xs text-violet-300">{info.title}</p>
          <ul class="list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutral-300">
            {info.points.map((p) => (
              <li>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <select
        value={ghostId}
        aria-label={info.label}
        onChange={(e) => setGhostId((e.currentTarget as HTMLSelectElement).value)}
        class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono">
        <option value="" disabled>{labels.selectAbsent}</option>
        {members.map((m) => (
          <option value={m.id}>{m.name}{m.discord_user ? ` · ${m.discord_user}` : ''}</option>
        ))}
      </select>
      {state === 'error' && <p role="alert" class="text-sm text-red-400 font-mono">{labels.errorSubmit}</p>}
      <button type="button" onClick={submit} disabled={state === 'busy' || !ghostId}
        class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
        {state === 'busy' ? labels.sending : ctaLabel}
      </button>
    </div>
  );
}
