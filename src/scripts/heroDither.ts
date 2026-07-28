/* Ilustración dithered del hero: blanca por defecto, crossfade a violeta al
   hover sobre sus píxeles reales. Estela de partículas que sube del cráneo.
   Reconstruida en canvas desde /img/hero-dither.webp (negro -> transparente). */
type Plume = { x: number; y: number; vx: number; vy: number };

export function initHeroDither(canvasId: string, src = '/img/hero-dither.webp') {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const VIOLET: [number, number, number] = [125, 57, 235];
  const THRESHOLD = 92, PLUME_N = 80, PX = 2.5;

  let W = 0, H = 0, imgAspect = 1;
  let bufW: HTMLCanvasElement | null = null, bufV: HTMLCanvasElement | null = null;
  let maskImg: ImageData | null = null;
  let cx = 0, cy = 0, sw = 0, sh = 0;
  let plume: Plume[] = [];
  let hover = 0, hoverTarget = 0;

  const mixInk = (h: number) =>
    `rgb(${Math.round(255 + (125 - 255) * h)},${Math.round(255 + (57 - 255) * h)},${Math.round(255 + (235 - 255) * h)})`;

  function buildBuffers() {
    if (!maskImg) return;
    const w = maskImg.width, h = maskImg.height, s = maskImg.data;
    bufW = document.createElement('canvas'); bufW.width = w; bufW.height = h;
    bufV = document.createElement('canvas'); bufV.width = w; bufV.height = h;
    const cw = bufW.getContext('2d')!, cv = bufV.getContext('2d')!;
    const ow = cw.createImageData(w, h), ov = cv.createImageData(w, h);
    const dw = ow.data, dv = ov.data, [r, g, b] = VIOLET;
    for (let i = 0; i < s.length; i += 4) {
      const on = s[i] > THRESHOLD ? 255 : 0;
      dw[i] = 255; dw[i + 1] = 255; dw[i + 2] = 255; dw[i + 3] = on;
      dv[i] = r; dv[i + 1] = g; dv[i + 2] = b; dv[i + 3] = on;
    }
    cw.putImageData(ow, 0, 0); cv.putImageData(ov, 0, 0);
  }

  function makePlume(fresh: boolean): Plume {
    const topY = cy - sh / 2;
    return {
      x: cx + (Math.random() - 0.5) * sw * 0.55,
      y: topY - (fresh ? Math.random() * sh * 0.85 : Math.random() * sh * 0.15),
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.08 + Math.random() * 0.28),
    };
  }
  function seedPlume() { plume = []; for (let i = 0; i < PLUME_N; i++) plume.push(makePlume(true)); }

  function resize() {
    W = canvas!.clientWidth; H = canvas!.clientHeight;
    canvas!.width = W * dpr; canvas!.height = H * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    sw = Math.min(W * 0.6, H * 1.0 * imgAspect);
    sh = sw / imgAspect;
    cx = W * 0.74; cy = H * 0.52;
    seedPlume();
  }

  function overSkull(px: number, py: number) {
    if (!maskImg) return false;
    const dx = cx - sw / 2, dy = cy - sh / 2;
    if (px < dx || px > dx + sw || py < dy || py > dy + sh) return false;
    const w = maskImg.width, h = maskImg.height, s = maskImg.data;
    const bx = Math.floor((px - dx) / sw * w), by = Math.floor((py - dy) / sh * h);
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      const mx = bx + ox, my = by + oy;
      if (mx < 0 || my < 0 || mx >= w || my >= h) continue;
      if (s[(my * w + mx) * 4] > THRESHOLD) return true;
    }
    return false;
  }

  function drawSkull() {
    if (!bufW) return;
    const dx = cx - sw / 2, dy = cy - sh / 2;
    ctx!.imageSmoothingEnabled = false;
    ctx!.globalAlpha = 1; ctx!.drawImage(bufW, dx, dy, sw, sh);
    if (hover > 0.002) { ctx!.globalAlpha = hover; ctx!.drawImage(bufV!, dx, dy, sw, sh); }
    ctx!.globalAlpha = 1;
  }
  function drawPlume() {
    const topY = cy - sh / 2;
    ctx!.fillStyle = mixInk(hover);
    for (let i = 0; i < plume.length; i++) {
      const p = plume[i];
      p.x += p.vx; p.y += p.vy;
      const rise = topY - p.y;
      if (rise > sh * 0.95) { plume[i] = makePlume(false); continue; }
      ctx!.globalAlpha = Math.max(0, 0.75 * (1 - rise / (sh * 0.95)));
      ctx!.fillRect(p.x, p.y, PX, PX);
    }
    ctx!.globalAlpha = 1;
  }
  let rafId = 0;
  let visible = true;

  function frame() {
    hover += (hoverTarget - hover) * 0.09;
    ctx!.clearRect(0, 0, W, H);
    drawSkull();
    drawPlume();
    rafId = requestAnimationFrame(frame);
  }

  /**
   * A diferencia del dither de WhyNan, aquí el bucle NO puede pararse cuando el
   * crossfade se estabiliza: la estela de partículas se mueve siempre. Lo que sí
   * se puede es no animar cuando el hero no se ve, que es la mayor parte del
   * tiempo que alguien pasa en la home.
   */
  function start() {
    if (rafId || reduce || !visible) return;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const img = new Image();
  img.onload = () => {
    imgAspect = img.width / img.height;
    const tmp = document.createElement('canvas');
    tmp.width = img.width; tmp.height = img.height;
    const bctx = tmp.getContext('2d')!;
    bctx.drawImage(img, 0, 0);
    const im = bctx.getImageData(0, 0, img.width, img.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    maskImg = im;
    buildBuffers();
    resize();
    if (reduce) { drawSkull(); drawPlume(); } else start();
  };
  img.src = src;

  /**
   * El rect va cacheado. Antes se pedía un `getBoundingClientRect()` en CADA
   * movimiento de ratón sobre la página entera, y eso fuerza layout: con dos
   * canvas dither eran dos reflows por cada movimiento del cursor.
   *
   * El listener sigue en `window` y no en el canvas porque `#hero-fx` lleva
   * `pointer-events: none` (está detrás del contenido del hero), así que sobre
   * él no llegaría ningún evento.
   */
  let rect: DOMRect | null = null;
  const invalidateRect = () => { rect = null; };

  window.addEventListener('resize', () => { resize(); invalidateRect(); });
  window.addEventListener('scroll', invalidateRect, { passive: true });

  window.addEventListener('pointermove', (e) => {
    if (!visible) return;              // hero fuera de pantalla: no hay nada que resaltar
    if (!rect) rect = canvas!.getBoundingClientRect();
    const next = overSkull(e.clientX - rect.left, e.clientY - rect.top) ? 1 : 0;
    if (next !== hoverTarget) hoverTarget = next;
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) start(); else stop();
    }).observe(canvas);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
}
