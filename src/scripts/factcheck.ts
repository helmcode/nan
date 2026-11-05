/**
 * Bucle del hero de /factcheck: afirmación → procesamiento → veredicto, y
 * vuelta a empezar con la siguiente. El HTML trae la primera ya resuelta; esto
 * solo la anima. Se pausa fuera de pantalla o con la pestaña oculta, y con
 * movimiento reducido se salta el tecleo pero sigue rotando.
 */

type Claim = { text: string; verdict: 'true' | 'false' };

const TYPE_MS = 28;
const PAUSE_MS = 500;
const STEP_MS = 700;
const HOLD_MS = 2400;
const OUT_MS = 400;

export function initFactcheck(): void {
  initLoop();
  initQA();
}

function initLoop(): void {
  const root = document.querySelector<HTMLElement>('[data-fc-loop]');
  if (!root) return;

  let claims: Claim[];
  let labels: Record<'true' | 'false', string>;
  try {
    claims = JSON.parse(root.dataset.claims ?? '[]');
    labels = JSON.parse(root.dataset.labels ?? '{}');
  } catch {
    return;
  }
  if (claims.length < 2) return;

  const claimEl = root.querySelector<HTMLElement>('[data-fc-claim]');
  const verdictEl = root.querySelector<HTMLElement>('[data-fc-verdict]');
  const verdictText = root.querySelector<HTMLElement>('[data-fc-verdict-text]');
  const markEl = root.querySelector<HTMLElement>('.loop__mark');
  const bar = root.querySelector<HTMLElement>('[data-fc-bar]');
  const steps = [...root.querySelectorAll<HTMLElement>('[data-fc-step]')];
  if (!claimEl || !verdictEl || !verdictText || !bar) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reloj que se detiene: los tiempos solo avanzan con la animación visible.
  let visible = true;
  let waiters: (() => void)[] = [];
  const running = () => visible && !document.hidden;
  const resume = () => {
    if (!running()) return;
    const w = waiters;
    waiters = [];
    w.forEach((f) => f());
  };
  const gate = () => (running() ? Promise.resolve() : new Promise<void>((r) => waiters.push(r)));
  const wait = async (ms: number) => {
    let left = ms;
    while (left > 0) {
      await gate();
      const slice = Math.min(left, 100);
      await new Promise((r) => setTimeout(r, slice));
      left -= slice;
    }
  };

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    resume();
  }).observe(root);
  document.addEventListener('visibilitychange', resume);

  const setPhase = (p: string) => (root.dataset.phase = p);
  const setProgress = (p: number) => bar.style.setProperty('--p', String(p));

  async function show(i: number) {
    const c = claims[i];
    steps.forEach((s) => s.classList.remove('is-on', 'is-done'));
    setProgress(0);
    verdictEl!.dataset.v = c.verdict;
    verdictText!.textContent = labels[c.verdict];
    if (markEl) markEl.textContent = c.verdict === 'true' ? '✓' : '✕';

    setPhase('claim');
    if (reduced) {
      claimEl!.textContent = c.text;
    } else {
      claimEl!.textContent = '';
      for (let n = 1; n <= c.text.length; n++) {
        claimEl!.textContent = c.text.slice(0, n);
        await wait(TYPE_MS);
      }
    }
    await wait(PAUSE_MS);

    setPhase('process');
    for (let s = 0; s < steps.length; s++) {
      steps[s].classList.add('is-on');
      setProgress((s + 1) / steps.length);
      await wait(STEP_MS);
      steps[s].classList.replace('is-on', 'is-done');
    }

    setPhase('verdict');
    await wait(HOLD_MS);
    setPhase('out');
    await wait(OUT_MS);
  }

  (async () => {
    // La primera ya está pintada: se deja leer y se empieza por la segunda.
    await wait(HOLD_MS);
    setPhase('out');
    await wait(OUT_MS);
    for (let i = 1; ; i = (i + 1) % claims.length) await show(i);
  })();
}

/**
 * Preguntas bajo el hero. Cada paso es alto y su escenario se queda fijo: la
 * pregunta aparece al llegar y la respuesta cuando se ha recorrido un tramo.
 * Con movimiento reducido no se arma y todo queda visible, como sin JS.
 */
function initQA(): void {
  const root = document.querySelector<HTMLElement>('[data-qa]');
  if (!root) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const steps = [...root.querySelectorAll<HTMLElement>('[data-qa-step]')];
  root.classList.add('is-armed');

  let queued = false;
  const update = () => {
    queued = false;
    const vh = window.innerHeight;
    for (const step of steps) {
      const stage = step.firstElementChild as HTMLElement | null;
      if (!stage) continue;
      const r = step.getBoundingClientRect();
      const run = r.height - stage.offsetHeight;
      const p = run > 0 ? (stage.getBoundingClientRect().top - r.top) / run : 1;
      const state = r.top < vh * 0.6 ? (p > 0.3 ? 'a' : 'q') : '';
      if ((step.dataset.state ?? '') !== state) {
        if (state) step.dataset.state = state;
        else delete step.dataset.state;
      }
    }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}
