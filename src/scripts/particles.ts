/* Campo de partículas violeta global — textura de la casa. Sutil, en #bg-fx. */
type P = { x: number; y: number; vx: number; vy: number; a: number };

export function initParticles() {
  const canvas = document.getElementById('bg-fx') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const VIOLET = '#7D39EB';
  const COUNT = 300;
  const SIZE = 3.4;
  let W = 0, H = 0;
  let parts: P[] = [];

  function seed() {
    parts = [];
    for (let i = 0; i < COUNT; i++) {
      parts.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
        a: 0.3 + Math.random() * 0.45,
      });
    }
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas!.width = W * dpr; canvas!.height = H * dpr;
    canvas!.style.width = W + 'px'; canvas!.style.height = H + 'px';
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!parts.length) seed();
  }
  function draw() {
    ctx!.clearRect(0, 0, W, H);
    ctx!.fillStyle = VIOLET;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
      if (p.y < -4) p.y = H + 4; else if (p.y > H + 4) p.y = -4;
      ctx!.globalAlpha = p.a;
      ctx!.fillRect(p.x, p.y, SIZE, SIZE);
    }
    ctx!.globalAlpha = 1;
  }
  function frame() { draw(); requestAnimationFrame(frame); }

  // se desvanecen al salir del hero para no molestar la lectura
  function fade() {
    const f = Math.max(0.1, 1 - window.scrollY / (window.innerHeight * 0.85));
    canvas!.style.opacity = String(f);
  }
  window.addEventListener('scroll', fade, { passive: true });
  window.addEventListener('resize', resize);
  resize();
  fade();
  if (reduce) draw(); else requestAnimationFrame(frame);
}
