import { useState } from 'preact/hooks';

export default function CheckinForm({ t }: { t: { button: string; submitting: string; done: string; closed: string; error: string } }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'closed' | 'error'>('idle');
  async function checkin() {
    setState('busy');
    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch { setState('error'); return; }
    if (resp.ok) { setState('done'); return; }
    if (resp.status === 400) { setState('closed'); return; }
    setState('error');
  }
  if (state === 'done') return <p class="text-violet-400 font-mono text-sm">{t.done}</p>;
  if (state === 'closed') return <p class="text-neutral-400 font-mono text-sm">{t.closed}</p>;
  if (state === 'error') return <p role="alert" class="text-red-400 font-mono text-sm">{t.error}</p>;
  return (
    <button onClick={checkin} disabled={state === 'busy'}
      class="font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-50">
      {state === 'busy' ? t.submitting : t.button}
    </button>
  );
}
