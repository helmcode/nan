/* Prompt engineering challenge (/prompt): three steps on one page.
 *
 * Step 1 is the hook, step 2 the question, step 3 the model's tongue-in-cheek
 * "answer". While the prompt is sent, a "Thinking" screen (pulsing logo) stays
 * up for at least THINKING_MS, like a reasoning model; then the answer is
 * written out token by token, the way an LLM streams its reply. The
 * answer goes to POST /api/events/prompt-challenge through the same-origin
 * events proxy; the backend enforces one answer per IP and the rate limits.
 *
 * The browser also remembers which outcome it saw: an answer of this browser
 * (201) or the backend's "this network already answered" notice (409). They
 * are not the same thing — the 409 is decided per IP, so it never says this
 * person answered — and a returning visitor must see the state they ended on,
 * so the outcome is what gets stored. That is a convenience, not the guard:
 * clearing storage only leads back to the backend's 409. */

const SENT_KEY = 'nan.promptChallenge.sent';
const ENDPOINT = '/api/events/prompt-challenge';
const THINKING_MS = 2000;

/** What this browser can remember about its last visit. */
type Outcome = 'answered' | 'already_submitted';

/** The error codes the backend can answer with. Anything else is not part of
 * the contract and falls back to the generic message, never to a raw code.
 * Matches the status codes ARCHITECTURE.md documents for this endpoint (400
 * validation, 413 `body_too_large`, 409 `already_submitted`, 429
 * `rate_limited`, 503 `challenge_full`). */
export const PROMPT_CHALLENGE_ERROR_CODES = [
  'prompt_too_short',
  'prompt_too_long',
  'invalid_twitter',
  'body_too_large',
  'already_submitted',
  'rate_limited',
  'challenge_full',
] as const;

type ErrorCode = (typeof PROMPT_CHALLENGE_ERROR_CODES)[number];

const PROMPT_MIN = 10;
const PROMPT_MAX = 2000;
const HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;

type Messages = Record<string, string>;

/** Last resort when the page arrives without its `data-messages` dictionary:
 * a stable sentence, never a raw code and never `undefined`. */
const FALLBACK_MESSAGE = 'Something went wrong. Try again in a few minutes.';

/**
 * Turns a backend error code into the line the visitor reads. Only the codes in
 * PROMPT_CHALLENGE_ERROR_CODES are part of the contract: anything else — a code
 * added to the backend but not here, `internal`, an empty string, a prototype
 * key such as `__proto__` — gets the generic message, so nobody ever sees a raw
 * code on screen. A contract code whose dictionary entry is missing falls back
 * the same way, and the generic message itself falls back to FALLBACK_MESSAGE.
 */
export function errorMessage(code: string, messages: Messages): string {
  const inContract = (PROMPT_CHALLENGE_ERROR_CODES as readonly string[]).includes(code);
  const own = inContract ? messages[code] : undefined;
  if (typeof own === 'string') return own;
  const generic = messages.generic;
  return typeof generic === 'string' ? generic : FALLBACK_MESSAGE;
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Splits text into LLM-looking tokens: short words whole, long words in
 * 3-5 character pieces, each carrying the spaces in front of it. Every line
 * break is a token of its own, so the stream can pause on each one. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.match(/\n|[^\S\n]*\S+/g) ?? []) {
    if (word === '\n' || word.trim().length <= 6) {
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

/**
 * Checks the two fields before the request leaves the browser, so a typo costs
 * no round trip and no rate-limit budget, and the visitor is told which field
 * to fix while still on step 2. Length is counted in code points, not UTF-16
 * units: 2000 emoji are 4000 `.length` and the backend would take them.
 * Returns the matching error code, or null when the answer can be sent.
 */
export function validateAnswer(prompt: string, handle: string): ErrorCode | null {
  const length = [...prompt.trim()].length;
  if (length < PROMPT_MIN) return 'prompt_too_short';
  if (length > PROMPT_MAX) return 'prompt_too_long';
  const user = handle.trim();
  if (user !== '' && !HANDLE.test(user)) return 'invalid_twitter';
  return null;
}

// Stream pacing, in ms: [minimum, random extra].
const PACE_TOKEN = [70, 80];
const PACE_PUNCTUATION = [380, 220];
const PACE_LINE_BREAK = [750, 200];

const wait = ([min, extra]: number[]) =>
  new Promise((resolve) => setTimeout(resolve, min + Math.random() * extra));

/** Writes `text` into `out` token by token: a longer pause after punctuation
 * and after each line break, so a blank line lands as one break, then the
 * other, before the writing resumes. Shows the caret while it streams. */
async function stream(text: string, out: HTMLElement, caret: HTMLElement | null): Promise<void> {
  out.textContent = '';
  if (reducedMotion()) {
    out.textContent = text;
    return;
  }
  if (caret) caret.hidden = false;
  for (const token of tokenize(text)) {
    out.textContent += token;
    if (token === '\n') await wait(PACE_LINE_BREAK);
    else if (/[.,:;?!…]$/.test(token)) await wait(PACE_PUNCTUATION);
    else await wait(PACE_TOKEN);
  }
  if (caret) caret.hidden = true;
}

/** The outcome stored by the last visit, or null when there is none worth
 * replaying. Pure, so the screening rule is testable in node: '1' is what
 * early builds stored for both outcomes and can only have been an accepted
 * answer, so it is read as one; a foreign value (another page, a hand-edited
 * key) opens the form as usual. */
export function outcomeFromStored(value: string | null): Outcome | null {
  if (value === 'answered' || value === 'already_submitted') return value;
  return value === '1' ? 'answered' : null;
}

function remembered(): Outcome | null {
  try {
    return outcomeFromStored(localStorage.getItem(SENT_KEY));
  } catch {
    return null;
  }
}

function remember(outcome: Outcome): void {
  try {
    localStorage.setItem(SENT_KEY, outcome);
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
  const answerEl = root.querySelector<HTMLElement>('[data-answer]');
  const answerSr = root.querySelector<HTMLElement>('[data-answer-sr]');
  const answerHand = root.querySelector<HTMLElement>('[data-answer-hand]');
  const answerOut = root.querySelector<HTMLElement>('[data-answer-out]');
  const answerCaret = root.querySelector<HTMLElement>('[data-answer-caret]');
  const answerGhost = root.querySelector<HTMLElement>('[data-answer-ghost]');
  const submitBtn = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !startBtn || !errorBox || !submitBtn) return;

  const promptField = form.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]');
  const twitterField = form.querySelector<HTMLInputElement>('input[name="twitter"]');
  const fields = [promptField, twitterField];

  let messages: Messages = {};
  try {
    messages = JSON.parse(root.dataset.messages ?? '{}') as Messages;
  } catch {
    /* keep the generic fallback below */
  }
  const lang = root.dataset.lang === 'es' ? 'es' : 'en';

  const show = (n: number | 'thinking', focus = true) => {
    for (const step of steps) step.hidden = step.dataset.step !== String(n);
    if (!focus) return;
    // Move focus to the new step's heading so screen readers announce it.
    root.querySelector<HTMLElement>(`[data-step="${n}"] [data-step-title]`)?.focus();
  };

  const showError = (code: string) => {
    errorBox.textContent = errorMessage(code, messages);
    errorBox.hidden = false;
  };

  // The message and the red field both go away as soon as the visitor starts
  // fixing the field the message is about.
  const clearFieldError = () => {
    errorBox.hidden = true;
    errorBox.textContent = '';
    for (const field of fields) field?.removeAttribute('aria-invalid');
  };
  for (const field of fields) field?.addEventListener('input', clearFieldError);

  const answerText = answerEl?.dataset.answer ?? '';

  // `answered` is this browser's accepted answer: the joke, then the last
  // words written by hand. `already_submitted` is only "this network answered",
  // which the backend decides per IP, so the answer never appears and neither
  // does the handwriting.
  const finish = async (outcome: Outcome) => {
    remember(outcome);
    if (outcome === 'already_submitted') {
      const text = errorMessage('already_submitted', messages);
      if (answerSr) answerSr.textContent = text;
      if (answerGhost) answerGhost.textContent = text;
      show(3);
      if (answerOut) await stream(text, answerOut, answerCaret);
      return;
    }
    show(3);
    if (!answerOut) return;
    await stream(answerText, answerOut, answerCaret);
    if (!answerHand) return;
    // Then the last words are "written by hand".
    answerHand.classList.add('is-writing');
    answerHand.hidden = false;
  };

  // A returning visitor sees the outcome they ended on, already written and
  // with no replay and no request.
  const restore = (outcome: Outcome) => {
    if (outcome === 'already_submitted') {
      const text = errorMessage('already_submitted', messages);
      if (answerSr) answerSr.textContent = text;
      if (answerGhost) answerGhost.textContent = text;
      if (answerOut) answerOut.textContent = text;
      show(3, false);
      return;
    }
    if (answerOut) answerOut.textContent = answerText;
    if (answerHand) answerHand.hidden = false;
    show(3, false);
  };

  const previous = remembered();
  if (previous) return restore(previous);
  show(1, false);

  // "I'm ready" opens the question with the cursor already in the box.
  startBtn.addEventListener('click', () => {
    show(2, false);
    promptField?.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldError();
    const data = new FormData(form);
    const body = {
      prompt: String(data.get('prompt') ?? ''),
      twitter: String(data.get('twitter') ?? ''),
      website: String(data.get('website') ?? ''),
      lang,
    };

    // Checked here, not by the backend: an empty or half-typed answer must not
    // swap in the "Thinking" screen, spend a request or eat the IP's budget.
    const invalid = validateAnswer(body.prompt, body.twitter);
    if (invalid) {
      const field = invalid === 'invalid_twitter' ? twitterField : promptField;
      field?.setAttribute('aria-invalid', 'true');
      showError(invalid);
      field?.focus();
      return;
    }

    submitBtn.disabled = true;
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
    if (code === null) return void finish('answered');
    if (code === 'already_submitted') return void finish('already_submitted');
    show(2, false);
    showError(code);
    errorBox.focus();
  });
}
