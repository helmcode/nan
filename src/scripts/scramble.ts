/**
 * NaN — scramble de letras al hover.
 * Es el único movimiento tipográfico del sistema: el texto se descompone en
 * glifos y se resuelve de izquierda a derecha. Vive SOLO en la banda del slug
 * de los disquettes — en botones y enlaces resultaba excesivo.
 *
 * Se aplica solo a elementos con [data-scramble-hover]; scramble.ts los cablea
 * en carga y respeta prefers-reduced-motion.
 */

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>_#*';
const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Anchura fija mientras muta: nada de saltos de layout. */
function run(el: HTMLElement, dur = 420): void {
  if (prefersReduced()) return;
  const target = el.dataset.text ?? el.textContent ?? '';
  if (!target.trim()) return;

  // si ya está corriendo, no encadenamos dos animaciones sobre el mismo nodo
  if (el.dataset.scrambling === '1') return;
  el.dataset.scrambling = '1';

  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const solved = Math.floor(target.length * p);
    let out = target.slice(0, solved);
    for (let i = solved; i < target.length; i++) {
      const ch = target[i];
      out += ch === ' ' || ch === '·' || ch === '→' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target;
      delete el.dataset.scrambling;
    }
  };
  requestAnimationFrame(tick);
}

export function initScramble(): void {
  document.querySelectorAll<HTMLElement>('[data-scramble-hover]').forEach((el) => {
    el.dataset.text = (el.textContent ?? '').trim();
    // ancho reservado: el nodo no cambia de tamaño mientras muta
    el.style.display ||= 'inline-block';
    el.addEventListener('pointerenter', () => run(el));
    el.addEventListener('focus', () => run(el));
  });
}
