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
// volver a la página del evento el usuario ya tiene sesión y puede inscribirse / votar.
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
      <div role="status" class="border border-violet-500/40 bg-violet-500/10 p-8 text-center md:p-10">
        <p class="text-lg leading-relaxed text-white">{t.success}</p>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';
  const err = status.kind === 'error' ? status.message : null;
  // .field y .btn son los controles de la casa (styles/nan-system.css).
  const inputCls = 'field w-full';

  return (
    <form onSubmit={onSubmit} noValidate class="grid gap-6 border border-neutral-800 bg-neutral-900/40 p-8 md:p-10">
      <div>
        <p class="font-mono text-sm uppercase tracking-[0.2em] text-violet-300">{t.prompt}</p>
        <p class="mt-3 max-w-prose text-base leading-relaxed text-neutral-300">{t.description}</p>
      </div>
      <div>
        <label class="mb-2 block font-mono text-xs uppercase tracking-[0.2em] text-violet-400" for="hk-email">
          {t.emailLabel}
        </label>
        <input id="hk-email" type="email" required disabled={submitting} value={email}
               placeholder={t.emailPlaceholder}
               onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} class={inputCls} />
      </div>
      {err && <p role="alert" class="font-mono text-sm text-red-400">{err}</p>}
      <button type="submit" disabled={submitting} class="btn btn-primary w-full disabled:opacity-50">
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
