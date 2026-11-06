/**
 * Bucle del hero del hackathon: caso → Clef lo evalúa → decisión, y vuelta a
 * empezar con el siguiente. El HTML trae la primera ya resuelta; esto
 * solo la anima. Se pausa fuera de pantalla o con la pestaña oculta, y con
 * movimiento reducido se salta el tecleo pero sigue rotando.
 */

type Tone = 'yes' | 'no' | 'pick';
type Case = { text: string; tone: Tone; answer: string };

const MARK: Record<Tone, string> = { yes: '✓', no: '✕', pick: '→' };

const TYPE_MS = 28;
const PAUSE_MS = 500;
const STEP_MS = 700;
const HOLD_MS = 2400;
const OUT_MS = 400;

export function initFactcheck(): void {
  initLoop();
  initQA();
  initTracks();
}

function initLoop(): void {
  const root = document.querySelector<HTMLElement>('[data-fc-loop]');
  if (!root) return;

  let claims: Case[];
  try {
    claims = JSON.parse(root.dataset.cases ?? '[]');
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
    verdictEl!.dataset.v = c.tone;
    verdictText!.textContent = c.answer;
    if (markEl) markEl.textContent = MARK[c.tone] ?? '→';

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

/**
 * Selector de categorías del objetivo. Sin JS se ven todas seguidas; con JS se
 * muestran las pestañas (patrón tablist de ARIA, flechas para moverse) y solo
 * la categoría elegida.
 */
function initTracks(): void {
  const root = document.querySelector<HTMLElement>('[data-tracks]');
  const list = root?.querySelector<HTMLElement>('[role="tablist"]');
  if (!root || !list) return;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-track]')];
  if (tabs.length !== panels.length || tabs.length === 0) return;

  panels.forEach((panel, i) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabs[i].id);
    panel.tabIndex = 0;
  });

  const select = (i: number, focus = false) => {
    tabs.forEach((tab, j) => {
      const on = i === j;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[j].hidden = !on;
    });
    if (focus) tabs[i].focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const to =
        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0
        : e.key === 'End' ? n - 1
        : -1;
      if (to < 0) return;
      e.preventDefault();
      select(to, true);
    });
  });

  list.hidden = false;
  root.classList.add('is-on');
  select(0);
}
