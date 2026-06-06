import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

interface CheckItem { pass: boolean }
interface Checks {
  auto_points: number;
  not_prize_eligible?: boolean;
  checks: { url_live: CheckItem; in_nan_space: CheckItem; repo_public: CheckItem };
}

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
  checks?: Checks;
}

// Narrow the unknown response payload into a Checks shape. Returns null if any
// required slice is missing so the UI never reads from a half-shaped object.
function toChecks(raw: unknown): Checks | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Checks>;
  const c = r.checks;
  if (!c || typeof c.url_live?.pass !== 'boolean'
        || typeof c.in_nan_space?.pass !== 'boolean'
        || typeof c.repo_public?.pass !== 'boolean') return null;
  return {
    auto_points: typeof r.auto_points === 'number' ? r.auto_points : 0,
    not_prize_eligible: r.not_prize_eligible,
    checks: c,
  };
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
  // checks: arranca con los de la submission existente (validados); se actualiza al guardar.
  const [checks, setChecks] = useState<Checks | null>(toChecks(existing));
  const [submitted, setSubmitted] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Sección de media plegable: abierta si ya hay imagen o vídeo guardados.
  const [showMedia, setShowMedia] = useState(Boolean(existing?.image_url || existing?.video_url));
  const [showInfo, setShowInfo] = useState(false);
  const set = (k: string) => (e: Event) =>
    setF({ ...f, [k]: (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // Revalidar fase: si pasó a congelado mientras el form estaba abierto,
    // avisar sin enviar (el usuario conserva lo escrito). El backend sigue
    // siendo la autoridad (mapea wrong_state → errorClosed); esto mejora el caso común.
    try {
      const ev = await fetch('/api/hackaton/event');
      const evb = await ev.json().catch(() => null) as { data?: { status?: string } } | null;
      const st = evb?.data?.status;
      if (st && st !== 'building') { setBusy(false); setError(t.errorClosed); return; }
    } catch { /* best-effort: si falla, dejamos que el backend decida */ }
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
    const b = await resp.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string } | null;
    setBusy(false);
    if (resp.ok && b?.ok) {
      setChecks(toChecks(b.data));
      setSubmitted(true);
      return;
    }
    // Mapear errores conocidos del backend a un mensaje claro.
    const code = b?.error as string | undefined;
    if (code === 'validation_failed') setError(t.errorRequired);
    else if (code === 'wrong_state') setError(t.errorClosed);
    else setError(t.error);
  }

  const inputCls = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors';
  const labelCls = 'block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2';
  return (
    <form onSubmit={onSubmit} class="space-y-5">
      {submitted && (
        <div class="rounded-lg border border-violet-700/50 bg-violet-950/30 p-4">
          <p class="font-mono text-sm text-violet-300">{t.alreadyTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-neutral-400">{t.alreadyNote}</p>
        </div>
      )}
      <div>
        <label class={labelCls} for="sub-title">{t.fTitle} <span class="text-neutral-500">*</span></label>
        <input id="sub-title" required value={f.title} onInput={set('title')} class={inputCls} />
      </div>
      <div>
        <label class={labelCls} for="sub-description">{t.description}</label>
        <textarea id="sub-description" value={f.description} onInput={set('description')} class={inputCls} />
      </div>
      <div>
        <label class={labelCls} for="sub-public-url">{t.publicUrl} <span class="text-neutral-500">*</span></label>
        <input id="sub-public-url" required value={f.public_url} onInput={set('public_url')} class={inputCls} />
      </div>
      <div>
        <label class={labelCls} for="sub-space-url">{t.spaceUrl}</label>
        <input id="sub-space-url" value={f.space_url} onInput={set('space_url')} class={inputCls} />
      </div>
      <div>
        <label class={labelCls} for="sub-repo-url">{t.repoUrl} <span class="text-neutral-500">*</span></label>
        <input id="sub-repo-url" required value={f.repo_url} onInput={set('repo_url')} class={inputCls} />
      </div>

      {/* Media opcional: portada (imagen) + vídeo de presentación (YouTube). */}
      {!showMedia ? (
        <button type="button" onClick={() => setShowMedia(true)}
          class="font-mono text-xs px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-300">
          + {t.attachMedia}
        </button>
      ) : (
        <div class="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <p class="font-mono text-xs uppercase tracking-widest text-neutral-500">{t.attachMedia}</p>
          <div>
            <label class={labelCls} for="sub-video-url">{t.videoUrl}</label>
            <div class="flex items-center gap-2">
              <input id="sub-video-url" value={f.video_url} onInput={set('video_url')} class={inputCls} />
              <button type="button" aria-label="info" onClick={() => setShowInfo((v) => !v)}
                class="shrink-0 h-7 w-7 rounded-full border border-neutral-700 font-mono text-xs text-neutral-400 hover:border-violet-500 hover:text-violet-300">
                i
              </button>
            </div>
            {showInfo && (
              <p class="mt-2 rounded-lg bg-neutral-900/60 px-3 py-2 text-xs leading-relaxed text-neutral-400">{t.videoInfo}</p>
            )}
          </div>
          <div>
            <label class={labelCls} for="sub-image-url">{t.imageUrl}</label>
            <input id="sub-image-url" value={f.image_url} onInput={set('image_url')} class={inputCls} />
            <p class="mt-1 text-xs text-neutral-500">{t.imageHint}</p>
          </div>
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
