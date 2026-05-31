import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';

export interface LoginStrings {
  prompt: string;
  description: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  submitting: string;
  success: string;
  errorEmail: string;
  errorRate: string;
  errorServer: string;
  errorNetwork: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Formulario de acceso al hackatón por magic link. Dispara el MISMO login de
// NaN que usa la plataforma (POST /api/auth/login/request vía proxy same-origin)
// y produce una sesión nan_session completa. Una vez validado el email, al
// volver a /hackaton el usuario ya tiene sesión y puede inscribirse / votar.
export default function LoginForm({ t }: { t: LoginStrings }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      setStatus({ kind: 'error', message: t.errorEmail });
      return;
    }
    setStatus({ kind: 'submitting' });

    let resp: Response;
    try {
      resp = await fetch('/api/auth/login-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
    } catch {
      setStatus({ kind: 'error', message: t.errorNetwork });
      return;
    }

    // El backend responde 202 tanto si el email existe como si no
    // (anti-enumeración). Por eso el mensaje de éxito es neutro.
    if (resp.ok) {
      setStatus({ kind: 'success' });
      return;
    }
    let message = t.errorServer;
    if (resp.status === 400) message = t.errorEmail;
    else if (resp.status === 429) message = t.errorRate;
    setStatus({ kind: 'error', message });
  }

  if (status.kind === 'success') {
    return (
      <div role="status" class="rounded-xl border border-violet-500/30 bg-violet-950/20 p-6 text-center">
        <p class="text-sm text-white leading-relaxed">{t.success}</p>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';
  const err = status.kind === 'error' ? status.message : null;
  const inputCls =
    'w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors';

  return (
    <form onSubmit={onSubmit} noValidate class="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 md:p-8 space-y-4">
      <div>
        <p class="font-mono text-sm text-white">{t.prompt}</p>
        <p class="mt-2 text-sm text-neutral-400 leading-relaxed">{t.description}</p>
      </div>
      <div>
        <label class="block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2" for="hk-email">
          {t.emailLabel}
        </label>
        <input id="hk-email" type="email" required disabled={submitting} value={email}
               placeholder={t.emailPlaceholder}
               onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
      </div>
      {err && <p role="alert" class="text-sm text-red-400 font-mono">{err}</p>}
      <button type="submit" disabled={submitting}
        class="w-full font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all disabled:opacity-50">
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
