/* Prompt engineering challenge (/prompt): three steps on one page.
 *
 * Step 1 is the hook, step 2 the question, step 3 the "received" screen. The
 * answer goes to POST /api/events/prompt-challenge through the same-origin
 * events proxy; the backend enforces one answer per IP and the rate limits.
 *
 * Once an answer is in (201) or the backend says this IP already answered
 * (409), the browser remembers it and opens straight on step 3 next time, so
 * a returning visitor costs no request at all. That is a convenience, not the
 * guard: clearing storage only leads back to the backend's 409. */

const SENT_KEY = 'nan.promptChallenge.sent';
const ENDPOINT = '/api/events/prompt-challenge';

type Messages = Record<string, string>;

function remembered(): boolean {
  try {
    return localStorage.getItem(SENT_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(SENT_KEY, '1');
  } catch {
    /* private mode or blocked storage: the backend still refuses a repeat */
  }
}

export function initPromptChallenge(): void {
  const root = document.querySelector<HTMLElement>('[data-prompt-challenge]');
  if (!root) return;

  const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'));
  const form = root.querySelector<HTMLFormElement>('[data-prompt-form]');
  const startBtn = root.querySelector<HTMLButtonElement>('[data-prompt-start]');
  const errorBox = root.querySelector<HTMLElement>('[data-prompt-error]');
  const doneNote = root.querySelector<HTMLElement>('[data-prompt-done-note]');
  const submitBtn = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !startBtn || !errorBox || !submitBtn) return;

  let messages: Messages = {};
  try {
    messages = JSON.parse(root.dataset.messages ?? '{}') as Messages;
  } catch {
    /* keep the generic fallback below */
  }
  const lang = root.dataset.lang === 'es' ? 'es' : 'en';
  const submitLabel = submitBtn.textContent ?? '';
  const sendingLabel = root.dataset.sending ?? submitLabel;

  const show = (n: number, focus = true) => {
    for (const step of steps) step.hidden = step.dataset.step !== String(n);
    if (!focus) return;
    // Move focus to the new step's heading so screen readers announce it.
    root.querySelector<HTMLElement>(`[data-step="${n}"] [data-step-title]`)?.focus();
  };

  const showError = (code: string) => {
    errorBox.textContent = messages[code] ?? messages.generic ?? code;
    errorBox.hidden = false;
  };

  const finish = (code?: string) => {
    remember();
    if (doneNote) {
      doneNote.textContent = code ? (messages[code] ?? '') : '';
      doneNote.hidden = !code;
    }
    show(3);
  };

  if (remembered()) {
    show(3, false);
    return;
  }
  show(1, false);

  // "I'm ready" opens the question with the cursor already in the box.
  startBtn.addEventListener('click', () => {
    show(2, false);
    form.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]')?.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const data = new FormData(form);
    const body = {
      prompt: String(data.get('prompt') ?? ''),
      twitter: String(data.get('twitter') ?? ''),
      website: String(data.get('website') ?? ''),
      lang,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = sendingLabel;
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.status === 201) return finish();
      const payload = (await resp.json().catch(() => ({}))) as { error?: string };
      const code = payload.error ?? 'generic';
      if (code === 'already_submitted') return finish(code);
      showError(code);
    } catch {
      showError('generic');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
}
