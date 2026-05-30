import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

interface FormStrings {
  name: string; discord: string; discordHelp: string;
  specialty: string; level: string;
  specFrontend: string; specBackend: string; specMlAiData: string;
  specDesignProduct: string; specOther: string;
  levelJunior: string; levelMid: string; levelSenior: string;
  submit: string; submitting: string; success: string; successReserve: string;
  errorDiscord: string; errorFull: string; errorEligible: string;
  errorServer: string; errorNetwork: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; reserve: boolean }
  | { kind: 'error'; message: string };

export default function RegisterForm({ t }: { t: FormStrings }) {
  const [name, setName] = useState('');
  const [discord, setDiscord] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (discord.trim() === '') {
      setStatus({ kind: 'error', message: t.errorDiscord });
      return;
    }
    setStatus({ kind: 'submitting' });

    let resp: Response;
    try {
      resp = await fetch('/api/hackaton/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          discord_user: discord.trim(),
          specialty,
          level,
        }),
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
    if (resp.status === 409 || code === 'registration_full') message = t.errorFull;
    else if (resp.status === 403 || code === 'not_eligible') message = t.errorEligible;
    else if (code === 'discord_required') message = t.errorDiscord;
    setStatus({ kind: 'error', message });
  }

  if (status.kind === 'success') {
    return (
      <div role="status" class="rounded-xl border border-violet-500/30 bg-violet-950/20 p-6 text-center">
        <p class="text-sm text-white leading-relaxed">
          {status.reserve ? t.successReserve : t.success}
        </p>
        <a href="/hackaton/me" class="mt-4 inline-block font-mono text-xs text-violet-400 hover:text-violet-300">
          → Mi equipo
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
        <label class={labelCls} for="hk-name">{t.name} <span class="text-neutral-500">*</span></label>
        <input id="hk-name" required disabled={submitting} value={name}
               onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
      </div>
      <div>
        <label class={labelCls} for="hk-discord">{t.discord} <span class="text-neutral-500">*</span></label>
        <input id="hk-discord" required disabled={submitting} value={discord}
               onInput={(e) => setDiscord((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
        <p class="mt-1 text-[10px] text-neutral-500 font-mono">{t.discordHelp}</p>
      </div>
      <div>
        <label class={labelCls} for="hk-spec">{t.specialty} <span class="text-neutral-500">*</span></label>
        <select id="hk-spec" required disabled={submitting} value={specialty}
                onChange={(e) => setSpecialty((e.currentTarget as HTMLSelectElement).value)} class={inputCls}>
          <option value="" disabled>—</option>
          <option value="frontend">{t.specFrontend}</option>
          <option value="backend">{t.specBackend}</option>
          <option value="ml_ai_data">{t.specMlAiData}</option>
          <option value="design_product">{t.specDesignProduct}</option>
          <option value="other">{t.specOther}</option>
        </select>
      </div>
      <div>
        <label class={labelCls} for="hk-level">{t.level} <span class="text-neutral-500">*</span></label>
        <select id="hk-level" required disabled={submitting} value={level}
                onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value)} class={inputCls}>
          <option value="" disabled>—</option>
          <option value="junior">{t.levelJunior}</option>
          <option value="mid">{t.levelMid}</option>
          <option value="senior">{t.levelSenior}</option>
        </select>
      </div>
      {err && <p role="alert" class="text-sm text-red-400 font-mono">{err}</p>}
      <button type="submit" disabled={submitting}
        class="w-full font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all disabled:opacity-50">
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
