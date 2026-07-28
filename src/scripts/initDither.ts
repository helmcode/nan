/* Dither "enmarcado": encaja una imagen dentro de su canvas (contain), blanca por
   defecto y crossfade a violeta al hover sobre sus píxeles. Mismo lenguaje que el
   hero, sin la estela. Fuente: imagen clara sobre fondo oscuro (se keyea el negro). */
type Opts = { threshold?: number; pad?: number };

export function initDither(canvasId: string, src: string, opts: Opts = {}) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const THRESHOLD = opts.threshold ?? 92;
  const PAD = opts.pad ?? 0.92;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const VIOLET: [number, number, number] = [125, 57, 235];

  let W = 0, H = 0, iw = 1, ih = 1;
  let bufW: HTMLCanvasElement | null = null, bufV: HTMLCanvasElement | null = null;
  let maskImg: ImageData | null = null;
  let dx = 0, dy = 0, dw = 0, dh = 0;
  let hover = 0, hoverTarget = 0;

  function buildBuffers() {
    if (!maskImg) return;
    const w = maskImg.width, h = maskImg.height, s = maskImg.data;
    bufW = document.createElement('canvas'); bufW.width = w; bufW.height = h;
    bufV = document.createElement('canvas'); bufV.width = w; bufV.height = h;
    const cw = bufW.getContext('2d')!, cv = bufV.getContext('2d')!;
    const ow = cw.createImageData(w, h), ov = cv.createImageData(w, h);
    const dwr = ow.data, dvr = ov.data, [r, g, b] = VIOLET;
    for (let i = 0; i < s.length; i += 4) {
      const on = s[i] > THRESHOLD ? 255 : 0;
      dwr[i] = 255; dwr[i + 1] = 255; dwr[i + 2] = 255; dwr[i + 3] = on;
      dvr[i] = r; dvr[i + 1] = g; dvr[i + 2] = b; dvr[i + 3] = on;
    }
    cw.putImageData(ow, 0, 0); cv.putImageData(ov, 0, 0);
  }

  function resize() {
    W = canvas!.clientWidth; H = canvas!.clientHeight;
    canvas!.width = W * dpr; canvas!.height = H * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min((W * PAD) / iw, (H * PAD) / ih);
    dw = iw * scale; dh = ih * scale;
    dx = (W - dw) / 2; dy = (H - dh) / 2;
  }

  function overImg(px: number, py: number) {
    if (!maskImg || px < dx || px > dx + dw || py < dy || py > dy + dh) return false;
    const w = maskImg.width, h = maskImg.height, s = maskImg.data;
    const bx = Math.floor((px - dx) / dw * w), by = Math.floor((py - dy) / dh * h);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const mx = bx + ox, my = by + oy;
      if (mx < 0 || my < 0 || mx >= w || my >= h) continue;
      if (s[(my * w + mx) * 4] > THRESHOLD) return true;
    }
    return false;
  }

  function draw() {
    if (!bufW) return;
    ctx!.clearRect(0, 0, W, H);
    ctx!.imageSmoothingEnabled = false;
    ctx!.globalAlpha = 1; ctx!.drawImage(bufW, dx, dy, dw, dh);
    if (hover > 0.002) { ctx!.globalAlpha = hover; ctx!.drawImage(bufV!, dx, dy, dw, dh); }
    ctx!.globalAlpha = 1;
  }
  /**
   * Por debajo de esto el crossfade ya no se distingue: se cuadra al objetivo,
   * se pinta un último fotograma y el bucle se para.
   *
   * Antes no paraba nunca: redibujaba en cada fotograma aunque `hover` ya
   * hubiera llegado a `hoverTarget` y aunque el canvas estuviera fuera de
   * pantalla. Entre este dither, el del hero y las partículas, la home tenía
   * tres bucles rAF permanentes.
   */
  const SETTLED = 0.002;

  let rafId = 0;
  let visible = true;

  function frame() {
    hover += (hoverTarget - hover) * 0.09;
    if (Math.abs(hoverTarget - hover) < SETTLED) {
      hover = hoverTarget;
      draw();
      rafId = 0;          // se ha estabilizado: nada que animar
      return;
    }
    draw();
    rafId = requestAnimationFrame(frame);
  }

  /** Despierta el bucle. Lo llaman los eventos de puntero, no un rAF eterno. */
  function wake() {
    if (reduce || rafId || !visible) return;
    rafId = requestAnimationFrame(frame);
  }

  const img = new Image();
  img.onload = () => {
    iw = img.width; ih = img.height;
    const tmp = document.createElement('canvas');
    tmp.width = iw; tmp.height = ih;
    const bctx = tmp.getContext('2d')!;
    bctx.drawImage(img, 0, 0);
    const im = bctx.getImageData(0, 0, iw, ih);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    maskImg = im;
    buildBuffers();
    resize();
    draw();
  };
  img.src = src;

  window.addEventListener('resize', () => { resize(); draw(); });

  /**
   * `pointermove` sobre el canvas y no `mousemove` sobre `window`: antes se
   * ejecutaba en cada movimiento de ratón en toda la página, y cada vez hacía un
   * `getBoundingClientRect()` (que fuerza layout) más un escaneo de 25 píxeles
   * de la máscara. Aquí solo corre encima del canvas, y el rect va cacheado.
   */
  let rect: DOMRect | null = null;
  const invalidateRect = () => { rect = null; };
  window.addEventListener('resize', invalidateRect);
  window.addEventListener('scroll', invalidateRect, { passive: true });

  canvas.addEventListener('pointermove', (e) => {
    if (!rect) rect = canvas.getBoundingClientRect();
    const next = overImg(e.clientX - rect.left, e.clientY - rect.top) ? 1 : 0;
    if (next === hoverTarget) return;   // nada ha cambiado: no despertar el bucle
    hoverTarget = next;
    wake();
  });

  canvas.addEventListener('pointerleave', () => {
    if (hoverTarget === 0) return;
    hoverTarget = 0;
    wake();
  });

  // Fuera de pantalla no se anima. Al volver a entrar, si quedaba crossfade a
  // medias, se retoma.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (!visible) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      } else if (hover !== hoverTarget) {
        wake();
      }
    }).observe(canvas);
  }
}
