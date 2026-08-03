/**
 * NaN — envío de la waitlist. Cablea todos los <form data-waitlist>.
 *   POST /api/waitlist {email, region, _hp} → ver src/pages/api/waitlist.ts
 *
 * La VALIDACIÓN y el PARSEO no viven aquí: se reutilizan los helpers que ya
 * usaba la isla Preact (lib/waitlistClient), para que haya
 * una sola implementación y la sigan cubriendo sus tests. En particular el
 * espejo de dominios bloqueados, que debe coincidir con el de lib/waitlist.ts
 * (el servidor es la autoridad; el cliente solo evita un viaje de ida y vuelta).
 *
 * Los TEXTOS sí son de aquí: el componente los serializa en data-msgs desde el
 * diccionario, para no arrastrar todo el i18n al bundle de cliente.
 */
import {
  isValidEmail,
  isWaitlistRegion,
  normalizeEmail,
  parseWaitlistResponse,
  waitlistErrorText,
  waitlistSuccessText,
} from '../lib/waitlistClient';

interface Msgs {
  sending: string;
  okRegistered: string;
  okInterest: string;
  okPosition: string;
  okText: string;
  errEmail: string;
  errRegion: string;
  errRateLimited: string;
  errNetwork: string;
  errGeneric: string;
}

const FALLBACK: Msgs = {
  sending: 'Sending…',
  okRegistered: "You're on the waitlist.",
  okInterest: 'Noted. We are not open in your region yet.',
  okPosition: 'position',
  okText: "We'll approve your spot in the next few days.",
  errEmail: 'That email does not look valid.',
  errRegion: 'Pick a region.',
  errRateLimited: 'Too many attempts. Wait a minute.',
  errNetwork: 'The network failed, not you. Try again.',
  errGeneric: 'Something broke on our side. Try again in a bit.',
};

function readMsgs(form: HTMLFormElement): Msgs {
  try {
    return { ...FALLBACK, ...JSON.parse(form.dataset.msgs ?? '{}') };
  } catch {
    return FALLBACK;
  }
}

function wire(form: HTMLFormElement): void {
  const status = form.querySelector<HTMLElement>('[data-status]');
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
  if (!status || !submit) return;

  const t = readMsgs(form);
  const email = form.querySelector<HTMLInputElement>('input[name="email"]');

  /** Error: lo anuncia el live region, marca el campo y le devuelve el foco. */
  const fail = (msg: string, focus?: HTMLElement | null) => {
    status.textContent = msg;
    submit.disabled = false;
    if (focus) {
      focus.setAttribute('aria-invalid', 'true');
      focus.focus();
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const value = normalizeEmail(String(data.get('email') ?? ''));
    const region = String(data.get('region') ?? '');
    const hp = String(data.get('_hp') ?? '');

    email?.removeAttribute('aria-invalid');

    // Mismo criterio que la isla Preact: formato, longitud y dominios de
    // ejemplo o desechables.
    if (!isValidEmail(value)) {
      fail(t.errEmail, email);
      return;
    }
    if (form.querySelector('[name="region"]') && !isWaitlistRegion(region)) {
      fail(t.errRegion, form.querySelector<HTMLElement>('[data-region] button'));
      return;
    }

    submit.disabled = true;
    status.textContent = t.sending;

    let res: Response;
    try {
      // Premium pricing card lands here with ?premium=1: carry the interest
      // flag so the member row is marked glm52_interested (the admin panel
      // distinguishes and invites them for the GLM 5.2 tier).
      const wantsPremium = new URLSearchParams(window.location.search).get('premium') === '1';
      res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, region, _hp: hp, wantsPremium }),
      });
    } catch {
      fail(t.errNetwork);
      return;
    }

    const body = await res.json().catch(() => null);
    const result = parseWaitlistResponse(res.status, body);

    if (!result.ok) {
      // Qué texto toca y si el foco vuelve al campo se decide en
      // lib/waitlistClient, que sí tiene tests. Aquí queda el cableado del DOM.
      const { text, focusEmail } = waitlistErrorText(result.error, t);
      fail(text, focusEmail ? email : null);
      return;
    }

    form.querySelectorAll('input, select, button').forEach((el) => ((el as HTMLInputElement).disabled = true));

    status.textContent = waitlistSuccessText(result, t);
  });
}

export function initWaitlist(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-waitlist]').forEach(wire);
}
