import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

export default function SubmissionForm({ t }: { t: Record<string, string> }) {
  const [f, setF] = useState({ title: '', description: '', public_url: '', space_url: '', repo_url: '', media_url: '' });
  const [checks, setChecks] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.currentTarget.value });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const resp = await fetch('/api/hackaton/submission', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const b = await resp.json().catch(() => null);
    setBusy(false);
    if (resp.ok && b?.ok) setChecks(b.data);
  }

  const inputCls = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono';
  return (
    <form onSubmit={onSubmit} class="space-y-4">
      <input placeholder={t.fTitle} required value={f.title} onInput={set('title')} class={inputCls} />
      <textarea placeholder={t.description} value={f.description} onInput={set('description')} class={inputCls} />
      <input placeholder={t.publicUrl} required value={f.public_url} onInput={set('public_url')} class={inputCls} />
      <input placeholder={t.spaceUrl} value={f.space_url} onInput={set('space_url')} class={inputCls} />
      <input placeholder={t.repoUrl} required value={f.repo_url} onInput={set('repo_url')} class={inputCls} />
      <input placeholder={t.mediaUrl} value={f.media_url} onInput={set('media_url')} class={inputCls} />
      <button disabled={busy} class="font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white disabled:opacity-50">
        {busy ? t.submitting : t.submit}
      </button>
      {checks && (
        <div class="mt-4 text-sm font-mono text-neutral-300">
          <p>{t.checks}: {checks.auto_points}/2</p>
          <ul class="mt-1 space-y-1">
            <li>{checks.checks.url_live.pass ? '✓' : '✗'} {t.urlLive}</li>
            <li>{checks.checks.in_nan_space.pass ? '✓' : '✗'} {t.inNanSpace}</li>
            <li>{checks.checks.repo_public.pass ? '✓' : '✗'} {t.repoPublic}</li>
          </ul>
          {checks.not_prize_eligible && <p class="mt-2 text-red-400">{t.notPrizeEligible}</p>}
        </div>
      )}
    </form>
  );
}
