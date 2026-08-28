import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

type FieldMode = 'required' | 'optional' | 'hidden';
interface Fields {
  description: FieldMode;
  repo_url: FieldMode;
  space_url: FieldMode;
  image_url: FieldMode;
  video_url: FieldMode;
}
interface CheckItem { pass: boolean }
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
  checks?: Record<string, CheckItem>;
}
interface Result {
  auto_points: number;
  not_prize_eligible: boolean;
  checks: Record<string, CheckItem>;
}

// Convierte la respuesta del backend en el resumen de checks que pinta la UI.
function toResult(raw: unknown): Result | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Existing>;
  return {
    auto_points: typeof r.auto_points === 'number' ? r.auto_points : 0,
    not_prize_eligible: Boolean(r.not_prize_eligible),
    checks: r.checks && typeof r.checks === 'object' ? r.checks : {},
  };
}

interface Props {
  slug: string;
  t: Record<string, string>;
  existing?: Existing | null;
  /** Modo de cada campo opcional del evento (SPEC §3.3). `title` y `public_url` son siempre obligatorios. */
  fields: Fields;
  format: 'solo' | 'team';
  /** ¿El visitante ya tiene ficha de participante? En `solo` sin ficha, la
   *  entrega la crea sobre la marcha (§6.4 paso 4) y se piden sus datos. */
  hasParticipant: boolean;
  /** Checks configurados en el evento, en orden (§3.4). */
  checks: string[];
  autoMax: number;
  discordMode: 'required' | 'optional' | 'hidden';
  specialties: string[];
  levels: string[];
  /** Etiquetas traducidas de especialidades/niveles y de los checks. */
  options: Record<string, string>;
}

/**
 * Alta/edición de la entrega (SPEC §6.4 `PUT /api/events/{slug}/submission`).
 * Un único formulario para ambos formatos: el backend resuelve el propietario
 * (equipo o participante) a partir de la sesión.
 */
export default function SubmissionForm({
  slug, t, existing, fields, format, hasParticipant, checks, autoMax, discordMode, specialties, levels, options,
}: Props) {
  const [f, setF] = useState({
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    public_url: existing?.public_url ?? '',
    space_url: existing?.space_url ?? '',
    repo_url: existing?.repo_url ?? '',
    image_url: existing?.image_url ?? '',
    video_url: existing?.video_url ?? '',
  });
  const [p, setP] = useState({ name: '', discord_user: '', specialty: '', level: '' });
  const [result, setResult] = useState<Result | null>(existing ? toResult(existing) : null);
  const [submitted, setSubmitted] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [withdrawn, setWithdrawn] = useState(false);
  const askParticipant = format === 'solo' && !hasParticipant && !submitted;
  const mediaConfigured = fields.image_url !== 'hidden' || fields.video_url !== 'hidden';
  // Sección de media plegable: abierta si ya hay imagen o vídeo guardados.
  const [showMedia, setShowMedia] = useState(Boolean(existing?.image_url || existing?.video_url));
  const [showInfo, setShowInfo] = useState(false);
  const set = (k: keyof typeof f) => (e: Event) =>
    setF({ ...f, [k]: (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value });
  const setPart = (k: keyof typeof p) => (e: Event) =>
    setP({ ...p, [k]: (e.currentTarget as HTMLInputElement | HTMLSelectElement).value });
  const label = (v: string) => options[v] ?? v;
  const fieldLabel: Record<string, string> = {
    title: t.fTitle, description: t.description, public_url: t.publicUrl, space_url: t.spaceUrl,
    repo_url: t.repoUrl, image_url: t.imageUrl, video_url: t.videoUrl,
  };

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = { ...f };
    if (askParticipant) {
      const part: Record<string, string> = { name: p.name.trim() };
      if (discordMode !== 'hidden' && p.discord_user.trim()) part.discord_user = p.discord_user.trim();
      if (specialties.length > 0 && p.specialty) part.specialty = p.specialty;
      if (levels.length > 0 && p.level) part.level = p.level;
      body.participant = part;
    }
    let resp: Response;
    try {
      resp = await fetch(`/api/events/${slug}/submission`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch {
      setBusy(false);
      setError(t.error);
      return;
    }
    const b = await resp.json().catch(() => null) as
      { ok?: boolean; data?: any; error?: string } | null;
    setBusy(false);
    if (resp.ok && b?.ok) {
      setResult(toResult(b.data));
      setSubmitted(true);
      setWithdrawn(false);
      return;
    }
    // Mapear los códigos de error del backend (SPEC §6.4 / §6.5) a un mensaje claro.
    const code = b?.error ?? '';
    const data = b?.data ?? {};
    if (resp.status === 401) setError(t.errorLogin);
    else if (code === 'submission_closed') setError(t.errorClosed);
    else if (code === 'validation_failed') {
      const names = (Array.isArray(data.fields) ? data.fields as string[] : []).map((k) => fieldLabel[k] ?? k);
      setError(names.length ? `${t.errorRequired}: ${names.join(', ')}` : t.errorRequired);
    }
    else if (code === 'invalid_url') setError(`${t.errorUrl}: ${fieldLabel[String(data.field)] ?? data.field ?? ''}`);
    else if (code === 'participant_required') setError(t.errorParticipant);
    else if (code === 'discord_required') setError(t.errorDiscord);
    else if (code === 'not_team_member') setError(t.errorNoTeam);
    else if (code === 'not_eligible') setError(t.errorEligible);
    else setError(t.error);
  }

  async function onWithdraw() {
    if (!confirm(t.withdrawConfirm)) return;
    setBusy(true);
    setError('');
    try {
      const resp = await fetch(`/api/events/${slug}/submission`, { method: 'DELETE' });
      setBusy(false);
      if (resp.ok) { setWithdrawn(true); setSubmitted(false); setResult(null); return; }
      const b = await resp.json().catch(() => null) as { error?: string } | null;
      setError(b?.error === 'submission_closed' ? t.errorClosed : t.error);
    } catch {
      setBusy(false);
      setError(t.error);
    }
  }

  const inputCls = 'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors';
  const labelCls = 'block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2';
  const Req = () => <span class="text-neutral-500">*</span>;

  return (
    <form onSubmit={onSubmit} class="space-y-5">
      {submitted && (
        <div class="rounded-lg border border-violet-700/50 bg-violet-950/30 p-4">
          <p class="font-mono text-sm text-violet-300">{t.alreadyTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-neutral-400">{t.alreadyNote}</p>
        </div>
      )}
      {withdrawn && (
        <div class="rounded-lg border border-neutral-700/60 bg-neutral-900/50 p-4">
          <p class="font-mono text-sm text-neutral-200">{t.withdrawn}</p>
        </div>
      )}

      {askParticipant && (
        <div class="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <p class="font-mono text-xs uppercase tracking-widest text-neutral-500">{t.participantTitle}</p>
          <p class="text-xs text-neutral-400">{t.participantNote}</p>
          <div>
            <label class={labelCls} for="sub-p-name">{t.pName} <Req /></label>
            <input id="sub-p-name" required value={p.name} onInput={setPart('name')} class={inputCls} />
          </div>
          {discordMode !== 'hidden' && (
            <div>
              <label class={labelCls} for="sub-p-discord">{t.pDiscord} {discordMode === 'required' && <Req />}</label>
              <input id="sub-p-discord" required={discordMode === 'required'} value={p.discord_user} onInput={setPart('discord_user')} class={inputCls} />
            </div>
          )}
          {specialties.length > 0 && (
            <div>
              <label class={labelCls} for="sub-p-spec">{t.pSpecialty}</label>
              <select id="sub-p-spec" value={p.specialty} onChange={setPart('specialty')} class={inputCls}>
                <option value="">—</option>
                {specialties.map((v) => <option value={v}>{label(v)}</option>)}
              </select>
            </div>
          )}
          {levels.length > 0 && (
            <div>
              <label class={labelCls} for="sub-p-level">{t.pLevel}</label>
              <select id="sub-p-level" value={p.level} onChange={setPart('level')} class={inputCls}>
                <option value="">—</option>
                {levels.map((v) => <option value={v}>{label(v)}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <label class={labelCls} for="sub-title">{t.fTitle} <Req /></label>
        <input id="sub-title" required value={f.title} onInput={set('title')} class={inputCls} />
      </div>
      {fields.description !== 'hidden' && (
        <div>
          <label class={labelCls} for="sub-description">{t.description} {fields.description === 'required' && <Req />}</label>
          <textarea id="sub-description" required={fields.description === 'required'} value={f.description} onInput={set('description')} class={inputCls} />
        </div>
      )}
      <div>
        <label class={labelCls} for="sub-public-url">{t.publicUrl} <Req /></label>
        <input id="sub-public-url" required value={f.public_url} onInput={set('public_url')} class={inputCls} />
      </div>
      {fields.space_url !== 'hidden' && (
        <div>
          <label class={labelCls} for="sub-space-url">{t.spaceUrl} {fields.space_url === 'required' && <Req />}</label>
          <input id="sub-space-url" required={fields.space_url === 'required'} value={f.space_url} onInput={set('space_url')} class={inputCls} />
          {checks.includes('in_nan_space') && <p class="mt-1 text-xs text-neutral-500">{t.spaceHint}</p>}
        </div>
      )}
      {fields.repo_url !== 'hidden' && (
        <div>
          <label class={labelCls} for="sub-repo-url">{t.repoUrl} {fields.repo_url === 'required' && <Req />}</label>
          <input id="sub-repo-url" required={fields.repo_url === 'required'} value={f.repo_url} onInput={set('repo_url')} class={inputCls} />
        </div>
      )}

      {/* Media opcional: portada (imagen) + vídeo de presentación (YouTube). */}
      {mediaConfigured && (!showMedia ? (
        <button type="button" onClick={() => setShowMedia(true)}
          class="font-mono text-xs px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-300">
          + {t.attachMedia}
        </button>
      ) : (
        <div class="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
          <p class="font-mono text-xs uppercase tracking-widest text-neutral-500">{t.attachMedia}</p>
          {fields.video_url !== 'hidden' && (
            <div>
              <label class={labelCls} for="sub-video-url">{t.videoUrl} {fields.video_url === 'required' && <Req />}</label>
              <div class="flex items-center gap-2">
                <input id="sub-video-url" required={fields.video_url === 'required'} value={f.video_url} onInput={set('video_url')} class={inputCls} />
                <button type="button" aria-label="info" onClick={() => setShowInfo((v) => !v)}
                  class="shrink-0 h-7 w-7 rounded-full border border-neutral-700 font-mono text-xs text-neutral-400 hover:border-violet-500 hover:text-violet-300">
                  i
                </button>
              </div>
              {showInfo && (
                <p class="mt-2 rounded-lg bg-neutral-900/60 px-3 py-2 text-xs leading-relaxed text-neutral-400">{t.videoInfo}</p>
              )}
            </div>
          )}
          {fields.image_url !== 'hidden' && (
            <div>
              <label class={labelCls} for="sub-image-url">{t.imageUrl} {fields.image_url === 'required' && <Req />}</label>
              <input id="sub-image-url" required={fields.image_url === 'required'} value={f.image_url} onInput={set('image_url')} class={inputCls} />
              <p class="mt-1 text-xs text-neutral-500">{t.imageHint}</p>
            </div>
          )}
        </div>
      ))}

      <div class="flex flex-wrap items-center gap-3">
        <button disabled={busy} class="font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white disabled:opacity-50">
          {busy ? t.submitting : submitted ? t.update : t.submit}
        </button>
        {submitted && (
          <button type="button" disabled={busy} onClick={onWithdraw}
            class="font-mono text-xs px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 hover:border-red-500 hover:text-red-400 disabled:opacity-50">
            {t.withdraw}
          </button>
        )}
      </div>
      {error && <p role="alert" class="text-sm font-mono text-red-400">{error}</p>}
      {result && checks.length > 0 && (
        <div class="mt-4 text-sm font-mono text-neutral-300">
          <p>{t.checks}: {result.auto_points}/{autoMax}</p>
          <ul class="mt-1 space-y-1">
            {checks.map((k) => (
              <li>{result.checks[k]?.pass ? '✓' : '✗'} {label(k)}</li>
            ))}
          </ul>
          {result.not_prize_eligible && <p class="mt-2 text-red-400">{t.notPrizeEligible}</p>}
        </div>
      )}
    </form>
  );
}
