/* Prompt engineering challenge (/prompt): three steps on one page.
 *
 * Step 1 is the hook, step 2 the question, step 3 the model's tongue-in-cheek
 * "answer". While the prompt is sent, a "Thinking" screen (pulsing logo) stays
 * up for at least THINKING_MS, like a reasoning model; then the answer is
 * written out token by token, the way an LLM streams its reply. The
 * answer goes to POST /api/events/prompt-challenge through the same-origin
 * events proxy; the backend enforces one answer per IP and the rate limits.
 *
 * Once an answer is in (201) or the backend says this IP already answered
 * (409), the browser remembers it and opens straight on step 3 next time, so
 * a returning visitor costs no request at all. That is a convenience, not the
 * guard: clearing storage only leads back to the backend's 409. */

const SENT_KEY = 'nan.promptChallenge.sent';
const ENDPOINT = '/api/events/prompt-challenge';
const THINKING_MS = 2000;

type Messages = Record<string, string>;

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Splits text into LLM-looking tokens: short words whole, long words in
 * 3-5 character pieces, each carrying the whitespace in front of it. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.match(/\s*\S+/g) ?? []) {
    if (word.trim().length <= 6) {
      tokens.push(word);
      continue;
    }
    let rest = word;
    while (rest.length > 0) {
      const size = 3 + Math.floor(Math.random() * 3);
      tokens.push(rest.slice(0, size));
      rest = rest.slice(size);
    }
  }
  return tokens;
}

/** Writes `text` into `out` token by token, with a short pause after
 * punctuation. Shows the caret while it streams. */
async function stream(text: string, out: HTMLElement, caret: HTMLElement | null): Promise<void> {
  out.textContent = '';
  if (reducedMotion()) {
    out.textContent = text;
    return;
  }
  if (caret) caret.hidden = false;
  for (const token of tokenize(text)) {
    out.textContent += token;
    const pause = /[.,:;?!…]$/.test(token) ? 180 + Math.random() * 160 : 30 + Math.random() * 60;
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
  if (caret) caret.hidden = true;
}

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
  const answerFull = root.querySelector<HTMLElement>('[data-answer-full]');
  const answerOut = root.querySelector<HTMLElement>('[data-answer-out]');
  const answerCaret = root.querySelector<HTMLElement>('[data-answer-caret]');
  const answerGhost = root.querySelector<HTMLElement>('[data-answer-ghost]');
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

  const show = (n: number | 'thinking', focus = true) => {
    for (const step of steps) step.hidden = step.dataset.step !== String(n);
    if (!focus) return;
    // Move focus to the new step's heading so screen readers announce it.
    root.querySelector<HTMLElement>(`[data-step="${n}"] [data-step-title]`)?.focus();
  };

  const showError = (code: string) => {
    errorBox.textContent = messages[code] ?? messages.generic ?? code;
    errorBox.hidden = false;
  };

  // `code` is set when the backend says this IP already answered: the
  // "answer" is then that notice instead of the joke.
  const finish = (code?: string) => {
    remember();
    const text = code ? (messages[code] ?? '') : (answerFull?.textContent ?? '');
    if (code) {
      if (answerFull) answerFull.textContent = text;
      if (answerGhost) answerGhost.textContent = text;
    }
    show(3);
    if (answerOut) void stream(text, answerOut, answerCaret);
  };

  // A returning visitor sees the answer already written, no replay.
  if (remembered()) {
    if (answerOut) answerOut.textContent = answerFull?.textContent ?? '';
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
    show('thinking');
    // The request and the minimum "thinking" time run together, so a fast
    // answer still shows the animation and a slow one adds no extra wait.
    const minThinking = new Promise((resolve) => setTimeout(resolve, THINKING_MS));
    let code: string | null = 'generic';
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.status === 201) {
        code = null;
      } else {
        const payload = (await resp.json().catch(() => ({}))) as { error?: string };
        code = payload.error ?? 'generic';
      }
    } catch {
      /* network error: keep 'generic' */
    }
    await minThinking;
    submitBtn.disabled = false;
    submitBtn.textContent = submitLabel;
    if (code === null) return finish();
    if (code === 'already_submitted') return finish(code);
    show(2, false);
    showError(code);
    errorBox.focus();
  });
}
