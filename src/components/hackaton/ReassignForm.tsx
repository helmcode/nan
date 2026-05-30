import { useState } from 'preact/hooks';

interface Member {
  id: string;
  name: string;
  discord_user?: string;
}

export default function ReassignForm({ members, ctaLabel }: { members: Member[]; ctaLabel: string }) {
  const [ghostId, setGhostId] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit() {
    if (!ghostId) return;
    setState('busy');
    try {
      const resp = await fetch('/api/hackaton/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghost_id: ghostId }),
      });
      setState(resp.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return <p class="font-mono text-sm text-violet-400">Reasignación registrada.</p>;
  }

  return (
    <div class="space-y-3">
      <select
        value={ghostId}
        onChange={(e) => setGhostId((e.currentTarget as HTMLSelectElement).value)}
        class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono">
        <option value="" disabled>Selecciona ausente</option>
        {members.map((m) => (
          <option value={m.id}>{m.name}{m.discord_user ? ` · ${m.discord_user}` : ''}</option>
        ))}
      </select>
      {state === 'error' && <p role="alert" class="text-sm text-red-400 font-mono">No se pudo registrar.</p>}
      <button type="button" onClick={submit} disabled={state === 'busy' || !ghostId}
        class="font-mono text-xs px-5 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50">
        {state === 'busy' ? 'Enviando…' : ctaLabel}
      </button>
    </div>
  );
}
