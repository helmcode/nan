import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';
import {
  REGIONS,
  isValidEmail,
  isWaitlistRegion,
  normalizeEmail,
  parseWaitlistResponse,
  successMessage,
  errorMessage,
  type WaitlistRegion,
  type WaitlistSuccess,
  type WaitlistError,
  type WaitlistTranslations,
} from './waitlistForm.helpers';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; data: WaitlistSuccess }
  | { kind: 'error'; data: WaitlistError };

interface Props {
  t: WaitlistTranslations;
  regionLabels: Record<string, string>;
}

export default function WaitlistForm({ t, regionLabels }: Props) {
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState<WaitlistRegion | ''>('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [clientError, setClientError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    if (honeypot.trim() !== '') {
      setStatus({
        kind: 'success',
        data: {
          ok: true,
          position: 0,
          total: 0,
          status: 'registered',
          region: 'EU',
        },
      });
      return;
    }

    if (!isValidEmail(email)) {
      setClientError(t.errors.invalidEmail);
      return;
    }
    if (!isWaitlistRegion(region)) {
      setClientError(t.errors.invalidRegion);
      return;
    }

    setConfirming(true);
  }

  async function performSubmit() {
    if (!isWaitlistRegion(region)) return;

    setConfirming(false);
    setStatus({ kind: 'submitting' });

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizeEmail(email),
          region,
          _hp: honeypot,
        }),
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      const parsed = parseWaitlistResponse(response.status, body);
      if (parsed.ok) {
        setStatus({ kind: 'success', data: parsed });
      } else {
        setStatus({ kind: 'error', data: parsed });
      }
    } catch {
      setStatus({
        kind: 'error',
        data: { ok: false, error: 'network_error' },
      });
    }
  }

  if (status.kind === 'success') {
    const { status: s } = status.data;
    const pill = s === 'registered' ? t.registered : t.interest;
    const showFollowup = s === 'registered';
    return (
      <div
        role="status"
        aria-live="polite"
        class="rounded-xl border border-violet-500/30 bg-violet-950/20 p-6 md:p-8 text-center"
      >
        <p class="font-mono text-[10px] text-violet-400 uppercase tracking-widest mb-3">
          {pill}
        </p>
        <p class="text-sm md:text-base text-white leading-relaxed">
          {successMessage(status.data, t)}
        </p>
        {showFollowup && (
          <p class="mt-4 text-xs text-neutral-400">
            {t.followUp}
          </p>
        )}
      </div>
    );
  }

  const submitting = status.kind === 'submitting';
  const serverError = status.kind === 'error' ? errorMessage(status.data, t) : null;
  const displayError = clientError ?? serverError;

  return (
    <>
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="waitlist-confirm-title"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div class="max-w-md w-full rounded-xl border border-violet-500/30 bg-neutral-950 p-6 md:p-8">
            <p class="font-mono text-[10px] text-violet-400 uppercase tracking-widest mb-3">
              {t.confirmation.label}
            </p>
            <h3
              id="waitlist-confirm-title"
              class="text-lg md:text-xl text-white font-semibold mb-4"
            >
              {t.confirmation.heading}
            </h3>
            <p class="text-sm text-neutral-300 leading-relaxed mb-4">
              {t.confirmation.p1}
            </p>
            <p class="text-sm text-neutral-300 leading-relaxed mb-6">
              {t.confirmation.p2}
            </p>
            <div class="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                class="flex-1 font-mono text-sm px-6 py-3 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.confirmation.cancel}
              </button>
              <button
                type="button"
                onClick={performSubmit}
                disabled={submitting}
                class="flex-1 font-mono text-sm px-6 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? t.confirmation.submitting : t.confirmation.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
      <form
        onSubmit={onSubmit}
        noValidate
        class="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 md:p-8"
        aria-describedby={displayError ? 'waitlist-error' : undefined}
      >
      <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          {t.honeypot}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            name="_hp"
            value={honeypot}
            onInput={(e) => setHoneypot((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="space-y-5">
        <div>
          <label
            for="waitlist-email"
            class="block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2"
          >
            {t.email.label} <span class="text-neutral-500">*</span>
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            disabled={submitting}
            value={email}
            onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
            placeholder={t.email.placeholder}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"
          />
        </div>

        <div>
          <label
            for="waitlist-region"
            class="block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2"
          >
            {t.region.label} <span class="text-neutral-500">*</span>
          </label>
          <select
            id="waitlist-region"
            required
            disabled={submitting}
            value={region}
            onInput={(e) =>
              setRegion((e.currentTarget as HTMLSelectElement).value as WaitlistRegion | '')
            }
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"
          >
            <option value="" disabled>
              {t.region.default}
            </option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {regionLabels[r]}
              </option>
            ))}
          </select>
        </div>

        {displayError && (
          <p
            id="waitlist-error"
            role="alert"
            class="text-sm text-red-400 font-mono"
          >
            {displayError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          class="w-full inline-block font-mono text-sm px-8 py-3 rounded-lg bg-violet-600 text-white hover:bg-violet-500 hover:shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          {submitting ? t.submit.submitting : t.submit.idle}
        </button>

        <p class="text-center text-xs text-neutral-400 leading-relaxed">
          {t.footer}
        </p>
      </div>
    </form>
    </>
  );
}
