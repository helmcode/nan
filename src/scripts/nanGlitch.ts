/* Firma de marca: al hover, un número glitchea y se resuelve en NaN / ∞
   (NaN = Not a Number → aquí no se cuenta nada). Vuelve al valor al salir. */
export function initNanGlitch() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLYPHS = '0123456789.$€/∞';

  document.querySelectorAll<HTMLElement>('[data-nan]').forEach((el) => {
    const orig = (el.textContent ?? '').trim();
    const to = el.dataset.nan || 'NaN';
    el.style.display ||= 'inline-block';
    let raf = 0;
    let running = false; // evita reinicios mientras ya está resuelto en NaN

    const scramble = () => {
      if (reduce) { el.textContent = to; return; }
      if (running) return;
      running = true;
      const start = performance.now();
      const dur = 140; // corto: no debe parecer un error
      const len = Math.max(orig.length, to.length);
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        if (p < 0.5) {
          let out = '';
          for (let i = 0; i < len; i++) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
          el.textContent = out;
          raf = requestAnimationFrame(tick);
        } else {
          el.textContent = to; // NaN aparece pronto (~70ms) y se queda fijo
        }
      };
      raf = requestAnimationFrame(tick);
    };
    const restore = () => { running = false; cancelAnimationFrame(raf); el.textContent = orig; };

    el.addEventListener('pointerenter', scramble);
    el.addEventListener('pointerleave', restore);
  });
}
