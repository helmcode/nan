import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

export interface FormStrings {
  name: string; discord: string; discordHelp: string; discordOptional: string;
  specialty: string; level: string;
  submit: string; submitting: string; success: string; successReserve: string;
  successCta: string;
  errorDiscord: string; errorFull: string; errorEligible: string; errorClosed: string;
  errorServer: string; errorNetwork: string; errorRate: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; reserve: boolean }
  | { kind: 'error'; message: string };

/**
 * Inscripción a un evento (SPEC §6.3 `POST /api/events/{slug}/register`).
 * Los campos se muestran según la configuración del evento (§3.2):
 * `discordMode` (`required|optional|hidden`), `specialties` y `levels` (vacío =
 * no se pregunta). `options` traduce cada valor; si falta, se muestra el valor.
 */
export default function RegisterForm({ slug, t, meHref, discordMode, specialties, levels, options }: {
  slug: string;
  t: FormStrings;
  meHref: string;
  discordMode: 'required' | 'optional' | 'none';
  specialties: string[];
  levels: string[];
  options: Record<string, string>;
}) {
  const [name, setName] = useState('');
  const [discord, setDiscord] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const askSpecialty = specialties.length > 0;
  const askLevel = levels.length > 0;
  const label = (v: string) => options[v] ?? v;

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (discordMode === 'required' && discord.trim() === '') {
      setStatus({ kind: 'error', message: t.errorDiscord });
      return;
    }
    setStatus({ kind: 'submitting' });

    const payload: Record<string, string> = { name: name.trim() };
    if (discordMode !== 'none' && discord.trim()) payload.discord_user = discord.trim();
    if (askSpecialty && specialty) payload.specialty = specialty;
    if (askLevel && level) payload.level = level;

    let resp: Response;
    try {
      resp = await fetch(`/api/events/${slug}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      setStatus({ kind: 'error', message: t.errorNetwork });
      return;
    }

    let body: any = null;
    try { body = await resp.json(); } catch { body = null; }

    if (resp.status === 201 && body?.ok) {
      setStatus({ kind: 'success', reserve: !!body?.data?.is_reserve });
      return;
    }
    let message = t.errorServer;
    const code = body?.error ?? '';
    if (code === 'registration_full') message = t.errorFull;
    else if (code === 'registration_closed') message = t.errorClosed;
    else if (resp.status === 403 || code === 'not_eligible') message = t.errorEligible;
    else if (resp.status === 429 || code === 'rate_limited') message = t.errorRate;
    else if (code === 'discord_required') message = t.errorDiscord;
    setStatus({ kind: 'error', message });
  }

  if (status.kind === 'success') {
    return (
      <div role="status" class="rounded-xl border border-violet-500/30 bg-violet-950/20 p-6 text-center">
        <p class="text-sm text-white leading-relaxed">
          {status.reserve ? t.successReserve : t.success}
        </p>
        <a href={meHref} class="mt-4 inline-block font-mono text-xs text-violet-400 hover:text-violet-300">
          → {t.successCta}
        </a>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';
  const err = status.kind === 'error' ? status.message : null;
  const inputCls =
    'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors';
  const labelCls = 'block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2';

  return (
    <form onSubmit={onSubmit} noValidate class="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 md:p-8 space-y-5">
      <div>
        <label class={labelCls} for="ev-name">{t.name} <span class="text-neutral-500">*</span></label>
        <input id="ev-name" required disabled={submitting} value={name}
               onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
      </div>
      {discordMode !== 'none' && (
        <div>
          <label class={labelCls} for="ev-discord">
            {t.discord} {discordMode === 'required' && <span class="text-neutral-500">*</span>}
          </label>
          <input id="ev-discord" required={discordMode === 'required'} disabled={submitting} value={discord}
                 onInput={(e) => setDiscord((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
          <p class="mt-1 text-[10px] text-neutral-500 font-mono">
            {discordMode === 'required' ? t.discordHelp : t.discordOptional}
          </p>
        </div>
      )}
      {askSpecialty && (
        <div>
          <label class={labelCls} for="ev-spec">{t.specialty} <span class="text-neutral-500">*</span></label>
          <select id="ev-spec" required disabled={submitting} value={specialty}
                  onChange={(e) => setSpecialty((e.currentTarget as HTMLSelectElement).value)} class={inputCls}>
            <option value="" disabled>—</option>
            {specialties.map((v) => <option value={v}>{label(v)}</option>)}
          </select>
        </div>
      )}
      {askLevel && (
        <div>
          <label class={labelCls} for="ev-level">{t.level} <span class="text-neutral-500">*</span></label>
          <select id="ev-level" required disabled={submitting} value={level}
                  onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value)} class={inputCls}>
            <option value="" disabled>—</option>
            {levels.map((v) => <option value={v}>{label(v)}</option>)}
          </select>
        </div>
      )}
      {err && <p role="alert" class="text-sm text-red-400 font-mono">{err}</p>}
      <button type="submit" disabled={submitting}
        class="w-full font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all disabled:opacity-50">
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
