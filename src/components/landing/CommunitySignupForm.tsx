import { useState } from 'preact/hooks';
import type { TargetedSubmitEvent } from 'preact';
import { resolveSignupResponse, errorMessageFor } from '../../lib/communitySignup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BLOCKED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'mail.com',
]);

const BLOCKED_EMAIL_TLDS: readonly string[] = [
  'test',
  'invalid',
  'localhost',
  'example',
];

function isBlockedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true;
  const lastDot = domain.lastIndexOf('.');
  const tld = lastDot === -1 ? domain : domain.slice(lastDot + 1);
  return BLOCKED_EMAIL_TLDS.includes(tld);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (email.length === 0 || email.length > 254) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  if (isBlockedEmailDomain(email)) return false;
  return true;
}

const REGIONS = ['EU', 'LATAM', 'USA'] as const;
type Region = (typeof REGIONS)[number];

function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

export interface CommunityTranslations {
  emailLabel: string;
  emailPlaceholder: string;
  regionLabel: string;
  regionEU: string;
  regionUSA: string;
  regionLATAM: string;
  regionDefault: string;
  submit: string;
  submitting: string;
  redirecting: string;
  alreadySubscribed: string;
  alreadyMemberLabel: string;
  honeypot: string;
  errorInvalidEmail: string;
  errorInvalidRegion: string;
  errorRateLimited: string;
  errorServer: string;
  errorNetwork: string;
}

interface Props {
  t: CommunityTranslations;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'redirecting' }
  | { kind: 'already' }
  | { kind: 'error'; message: string };

export default function CommunitySignupForm({ t }: Props) {
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState<Region | ''>('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: TargetedSubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    // No client-side honeypot field: a hidden _hp risks autofill by a
    // password manager, and the server rate-limiter + the server-side honeypot
    // (when _hp is sent) are the real bot defence. The form sends no _hp.

    if (!isValidEmail(email)) {
      setStatus({ kind: 'error', message: t.errorInvalidEmail });
      return;
    }
    if (!isRegion(region)) {
      setStatus({ kind: 'error', message: t.errorInvalidRegion });
      return;
    }

    setStatus({ kind: 'submitting' });

    let response: Response;
    try {
      response = await fetch('/api/community-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizeEmail(email),
          region,
        }),
      });
    } catch {
      setStatus({ kind: 'error', message: t.errorNetwork });
      return;
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const outcome = resolveSignupResponse(response.status, body);
    switch (outcome.kind) {
      case 'redirect':
        setStatus({ kind: 'redirecting' });
        window.location.href = outcome.url;
        return;
      case 'already':
        setStatus({ kind: 'already' });
        return;
      case 'error':
        setStatus({ kind: 'error', message: errorMessageFor(outcome.code, t) });
        return;
    }
  }

  const submitting = status.kind === 'submitting';
  const redirecting = status.kind === 'redirecting';
  const disabled = submitting || redirecting;
  const errorMsg = status.kind === 'error' ? status.message : null;
  const already = status.kind === 'already';

  return (
    <div class="space-y-4">
      {already && (
        <div
          role="status"
          aria-live="polite"
          class="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 md:p-6 text-center"
        >
          <p class="font-mono text-[10px] text-violet-400 uppercase tracking-widest mb-2">
            {t.alreadyMemberLabel}
          </p>
          <p class="text-sm text-white leading-relaxed">
            {t.alreadySubscribed}{' '}
            <a
              href="mailto:hello@nan.builders"
              class="text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              hello@nan.builders
            </a>
          </p>
        </div>
      )}
    <form
      onSubmit={onSubmit}
      noValidate
      class="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6 md:p-8"
      aria-describedby={errorMsg ? 'community-error' : undefined}
    >
      <div class="space-y-5">
        <div>
          <label
            for="community-email"
            class="block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2"
          >
            {t.emailLabel} <span class="text-neutral-500">*</span>
          </label>
          <input
            id="community-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            disabled={disabled}
            value={email}
            onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
            placeholder={t.emailPlaceholder}
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"
          />
        </div>

        <div>
          <label
            for="community-region"
            class="block font-mono text-[10px] uppercase tracking-widest text-violet-400 mb-2"
          >
            {t.regionLabel} <span class="text-neutral-500">*</span>
          </label>
          <select
            id="community-region"
            required
            disabled={disabled}
            value={region}
            onInput={(e) =>
              setRegion((e.currentTarget as HTMLSelectElement).value as Region | '')
            }
            class="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 transition-colors"
          >
            <option value="" disabled>
              {t.regionDefault}
            </option>
            <option value="EU">{t.regionEU}</option>
            <option value="USA">{t.regionUSA}</option>
            <option value="LATAM">{t.regionLATAM}</option>
          </select>
        </div>

        {errorMsg && (
          <p
            id="community-error"
            role="alert"
            class="text-sm text-red-400 font-mono"
          >
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={disabled}
          class="btn btn-primary w-full gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {redirecting ? (
            <>
              <span
                class="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
                aria-hidden="true"
              />
              {t.redirecting}
            </>
          ) : submitting ? (
            <>
              <span
                class="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"
                aria-hidden="true"
              />
              {t.submitting}
            </>
          ) : (
            t.submit
          )}
        </button>
      </div>
    </form>
    </div>
  );
}
