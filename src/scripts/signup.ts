/**
 * NaN: the home signup form. Wires every <form data-signup>.
 *   POST /api/signup → src/pages/api/signup.ts → cloud-api /api/auth/signup
 *
 * Validation, normalization and response parsing come from lib/signup.ts, the
 * same module the Worker route uses, so the browser and the edge accept
 * exactly the same input. The strings come from the component (data-msgs),
 * so the i18n dictionary is not shipped to the client.
 */
import {
  SIGNUP_FIELDS,
  fieldErrorText,
  parseSignupResponse,
  planFromSearch,
  signupErrorText,
  validateSignup,
  type FieldErrors,
  type SignupMessages,
} from '../lib/signup';

interface Msgs extends SignupMessages {
  sending: string;
  okTitle: string;
  okText: string;
}

const FALLBACK: Msgs = {
  sending: 'Sending…',
  okTitle: 'Check your inbox to confirm and sign in.',
  okText: "If it doesn't arrive in a couple of minutes, check your spam folder.",
  errFullName: 'Tell us your name.',
  errEmail: 'That email does not look valid.',
  errJobRole: 'Pick your role.',
  errJobRoleOther: 'Tell us your role.',
  errXUrl: 'Use your profile link, like https://x.com/you.',
  errLinkedinUrl: 'Use your profile link, like https://linkedin.com/in/you.',
  errFields: 'Check the highlighted fields.',
  errRateLimited: 'Too many attempts. Wait a few minutes.',
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

  // Typed as inputs: the select shares every member used here (value,
  // required, focus, attributes).
  const control = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  const role = control('jobRole');
  const otherWrap = form.querySelector<HTMLElement>('[data-other]');

  // "Other" reveals its free-text field; any other role hides and clears it.
  const syncOther = () => {
    if (!otherWrap || !role) return;
    const show = role.value === 'other';
    otherWrap.hidden = !show;
    const input = control('jobRoleOther');
    if (input) {
      input.required = show;
      if (!show) input.value = '';
    }
  };
  role?.addEventListener('change', syncOther);
  syncOther();

  const clearErrors = () => {
    for (const name of SIGNUP_FIELDS) {
      control(name)?.removeAttribute('aria-invalid');
      const err = form.querySelector<HTMLElement>(`[data-error="${name}"]`);
      if (err) err.textContent = '';
    }
  };

  /** Marks each failing field, writes its message, focuses the first one. */
  const showFieldErrors = (fields: FieldErrors) => {
    let first: HTMLElement | null = null;
    for (const name of SIGNUP_FIELDS) {
      if (!fields[name]) continue;
      const el = control(name);
      el?.setAttribute('aria-invalid', 'true');
      const err = form.querySelector<HTMLElement>(`[data-error="${name}"]`);
      if (err) err.textContent = fieldErrorText(name, t);
      if (!first && el) first = el;
    }
    (first as HTMLElement | null)?.focus();
  };

  const fail = (msg: string) => {
    status.textContent = msg;
    status.dataset.state = 'error';
    submit.disabled = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const data = new FormData(form);
    const raw: Record<string, unknown> = {};
    for (const name of [...SIGNUP_FIELDS, '_hp']) raw[name] = String(data.get(name) ?? '');
    const plan = planFromSearch(window.location.search);
    if (plan) raw.plan = plan;

    const v = validateSignup(raw);
    if (!v.ok) {
      showFieldErrors(v.fields);
      fail(t.errFields);
      return;
    }

    submit.disabled = true;
    status.dataset.state = '';
    status.textContent = t.sending;

    let res: Response;
    try {
      res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // the normalized values, plus the honeypot exactly as it was filled
        body: JSON.stringify({ ...v.input, _hp: raw._hp }),
      });
    } catch {
      fail(t.errNetwork);
      return;
    }

    const body = await res.json().catch(() => null);
    const result = parseSignupResponse(res.status, body);
    if (!result.ok) {
      if (result.error === 'invalid_input') showFieldErrors(result.fields);
      fail(signupErrorText(result, t));
      return;
    }

    form.querySelectorAll<HTMLInputElement>('input, select, button').forEach((el) => (el.disabled = true));
    form.dataset.done = 'true';
    status.dataset.state = 'ok';
    status.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = t.okTitle;
    status.appendChild(strong);
    status.appendChild(document.createTextNode(` ${t.okText}`));
  });
}

export function initSignup(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-signup]').forEach(wire);
}
