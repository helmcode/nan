import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

interface Existing {
  title?: string;
  description?: string;
  public_url?: string;
  space_url?: string;
  repo_url?: string;
  image_url?: string;
  video_url?: string;
  auto_points?: number;
  not_prize_eligible?: boolean;
  checks?: any;
}

export default function SubmissionForm({ t, existing }: { t: Record<string, string>; existing?: Existing | null }) {
  const [f, setF] = useState({
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    public_url: existing?.public_url ?? '',
    space_url: existing?.space_url ?? '',
    repo_url: existing?.repo_url ?? '',
    image_url: existing?.image_url ?? '',
    video_url: existing?.video_url ?? '',
  });
  // checks: arranca con los de la submission existente; se actualiza al guardar.
  const [checks, setChecks] = useState<any>(existing ?? null);
  const [submitted, setSubmitted] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Sección de media plegable: abierta si ya hay imagen o vídeo guardados.
  const [showMedia, setShowMedia] = useState(Boolean(existing?.image_url || existing?.video_url));
  const [showInfo, setShowInfo] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.currentTarget.value });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/submission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
    } catch {
      setBusy(false);
      setError(t.error);
      return;
    }
    const b = await resp.json().catch(() => null);
    setBusy(false);
    if (resp.ok && b?.ok) {
      setChecks(b.data);
      setSubmitted(true);
      return;
    }
    // Mapear errores conocidos del backend a un mensaje claro.
    const code = b?.error as string | undefined;
    if (code === 'validation_failed') setError(t.errorRequired);
    else if (code === 'wrong_state') setError(t.errorClosed);
    else setError(t.error);
  }

  const inputCls = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono';
  return (
    <form onSubmit={onSubmit} class="space-y-4">
      {submitted && (
        <div class="rounded-lg border border-violet-700/50 bg-violet-950/30 p-4">
          <p class="font-mono text-sm text-violet-300">{t.alreadyTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-neutral-400">{t.alreadyNote}</p>
        </div>
      )}
      <input placeholder={t.fTitle} required value={f.title} onInput={set('title')} class={inputCls} />
      <textarea placeholder={t.description} value={f.description} onInput={set('description')} class={inputCls} />
      <input placeholder={t.publicUrl} required value={f.public_url} onInput={set('public_url')} class={inputCls} />
      <input placeholder={t.spaceUrl} value={f.space_url} onInput={set('space_url')} class={inputCls} />
      <input placeholder={t.repoUrl} required value={f.repo_url} onInput={set('repo_url')} class={inputCls} />

      {/* Media opcional: portada (imagen) + vídeo de presentación (YouTube). */}
      {!showMedia ? (
        <button type="button" onClick={() => setShowMedia(true)}
          class="font-mono text-xs px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-300">
          + {t.attachMedia}
        </button>
      ) : (
        <div class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <p class="font-mono text-xs uppercase tracking-widest text-neutral-500">{t.attachMedia}</p>
          <div class="flex items-center gap-2">
            <input placeholder={t.videoUrl} value={f.video_url} onInput={set('video_url')} class={inputCls} />
            <button type="button" aria-label="info" onClick={() => setShowInfo((v) => !v)}
              class="shrink-0 h-7 w-7 rounded-full border border-neutral-700 font-mono text-xs text-neutral-400 hover:border-violet-500 hover:text-violet-300">
              i
            </button>
          </div>
          {showInfo && (
            <p class="rounded-lg bg-neutral-900/60 px-3 py-2 text-xs leading-relaxed text-neutral-400">{t.videoInfo}</p>
          )}
          <input placeholder={t.imageUrl} value={f.image_url} onInput={set('image_url')} class={inputCls} />
          <p class="text-xs text-neutral-500">{t.imageHint}</p>
        </div>
      )}

      <button disabled={busy} class="font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white disabled:opacity-50">
        {busy ? t.submitting : submitted ? t.update : t.submit}
      </button>
      {error && <p role="alert" class="text-sm font-mono text-red-400">{error}</p>}
      {checks && checks.checks && (
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
