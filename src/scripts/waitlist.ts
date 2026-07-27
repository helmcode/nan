/**
 * NaN — envío de la waitlist. Cablea todos los <form data-waitlist>.
 * Contrato del backend (ver AGENTS.md):
 *   POST /api/waitlist {email, region, _hp} → {ok, position, total, status}
 *
 * Los textos NO viven aquí: el componente los serializa en data-msgs desde
 * src/i18n/ui.ts, así que siguen al idioma de la página sin arrastrar todo el
 * diccionario al bundle de cliente.
 */

/**
 * Respuesta de POST /api/waitlist (ver src/pages/api/waitlist.ts).
 * EU recibe una posición de llegada; LATAM y USA se guardan como interés con
 * posición 0, así que `position` puede venir a 0 y no se muestra.
 */
interface WaitlistResponse {
  ok: boolean;
  position?: number;
  total?: number;
  status?: 'registered' | 'interest';
  region?: string;
  error?: string;
}

interface Msgs {
  sending: string;
  okRegistered: string;
  okPosition: string;
  okText: string;
  errEmail: string;
  errRegion: string;
  errNetwork: string;
  errGeneric: string;
}

const FALLBACK: Msgs = {
  sending: 'Sending…',
  okRegistered: "You're on the waitlist.",
  okPosition: 'position',
  okText: "We'll approve your spot in the next few days.",
  errEmail: 'That email does not look valid.',
  errRegion: 'Pick a region.',
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
    if (focus) {
      focus.setAttribute('aria-invalid', 'true');
      focus.focus();
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const value = String(data.get('email') ?? '').trim();
    const region = String(data.get('region') ?? '');
    const hp = String(data.get('_hp') ?? '');

    email?.removeAttribute('aria-invalid');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      fail(t.errEmail, email);
      return;
    }
    if (form.querySelector('[name="region"]') && !region) {
      fail(t.errRegion, form.querySelector<HTMLElement>('[data-region] button'));
      return;
    }

    submit.disabled = true;
    status.textContent = t.sending;

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, region, _hp: hp }),
      });
      const body = (await res.json().catch(() => null)) as WaitlistResponse | null;

      if (res.ok && body?.ok) {
        form.querySelectorAll('input, select, button').forEach((el) => ((el as HTMLInputElement).disabled = true));
        const pos =
          body.position && body.total
            ? ` ${t.okPosition} ${String(body.position).padStart(3, '0')} / ${body.total} ·`
            : '';
        status.textContent = `${t.okRegistered}${pos} ${t.okText}`;
      } else {
        status.textContent = t.errGeneric;
        submit.disabled = false;
      }
    } catch {
      status.textContent = t.errNetwork;
      submit.disabled = false;
    }
  });
}

export function initWaitlist(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-waitlist]').forEach(wire);
}
