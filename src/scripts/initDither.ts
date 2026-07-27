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
  function frame() { hover += (hoverTarget - hover) * 0.09; draw(); requestAnimationFrame(frame); }

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
    if (reduce) draw(); else requestAnimationFrame(frame);
  };
  img.src = src;

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    const r = canvas!.getBoundingClientRect();
    hoverTarget = overImg(e.clientX - r.left, e.clientY - r.top) ? 1 : 0;
  });
}
