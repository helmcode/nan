import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';
import { HACKATHON_UNLOCK_URL } from '../../lib/eventEntitlement';

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
  /** Hint under the success message: the link never arrives for an email without an account. */
  noEmail: string;
  /** Second path, for people who are not in NaN yet. */
  newTitle: string;
  newBody: string;
  newCta: string;
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
//
// Quien llega sin sesión puede ser de dos tipos, y los dos tienen que ver su
// camino: el miembro que no ha iniciado sesión (el formulario) y quien aún no
// es de NaN (el bloque de abajo, que lleva al plan Community). El backend
// responde 202 también para un email sin cuenta, así que el mensaje de éxito
// no puede decir nada más: por eso recuerda el segundo camino.
function JoinNaN({ t, compact = false }: { t: LoginStrings; compact?: boolean }) {
  return (
    <div class={compact ? 'mt-6 border-t border-neutral-800 pt-6 text-left' : 'border-t border-neutral-800 pt-6'}>
      <p class="font-mono text-sm uppercase tracking-[0.2em] text-neutral-400">{t.newTitle}</p>
      <p class="mt-3 max-w-prose text-base leading-relaxed text-neutral-300">{t.newBody}</p>
      <a href={HACKATHON_UNLOCK_URL} rel="noopener" class="btn btn-ghost mt-5">{t.newCta} →</a>
    </div>
  );
}
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
        <p class="mt-4 text-base leading-relaxed text-neutral-400">{t.noEmail}</p>
        <JoinNaN t={t} compact />
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
      <JoinNaN t={t} />
    </form>
  );
}
