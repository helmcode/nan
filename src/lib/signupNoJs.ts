/**
 * The page a browser gets when the hero signup form is submitted without our
 * script (blocked or failed). The form has method="post", so the data never
 * lands in a URL; this page never reads the request body, so it cannot echo it.
 *
 * A redirect to cloud.nan.builders is not an option: the site's CSP has
 * `form-action 'self'`, which also applies to redirects after a form post.
 * So the page explains and links instead. Static HTML, no JS, own CSP.
 */
import { signupUrl } from './signup';

export type NoJsLang = 'en' | 'es';

/**
 * Language of the page: the path the form was posted from (same origin only),
 * then Accept-Language, then English.
 */
export function noJsLang(requestUrl: string, referer: string | null, acceptLanguage: string | null): NoJsLang {
  if (referer) {
    try {
      const ref = new URL(referer);
      if (ref.origin === new URL(requestUrl).origin) {
        return ref.pathname === '/es' || ref.pathname.startsWith('/es/') ? 'es' : 'en';
      }
    } catch {
      // unusable Referer: fall through
    }
  }
  // Highest-weighted language wins; ties keep header order.
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.tag && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const { tag } of ranked) {
    if (tag === 'es' || tag.startsWith('es-')) return 'es';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}

const COPY: Record<NoJsLang, { title: string; heading: string; body: string; cta: string; back: string; home: string }> = {
  en: {
    title: 'Create your account — NaN',
    heading: 'This form needs JavaScript.',
    body: 'The signup form on nan.builders runs with JavaScript, and it did not load in your browser. Nothing you typed was saved. You can create your account directly on the NaN platform.',
    cta: 'Create your account',
    back: 'Back to nan.builders',
    home: '/',
  },
  es: {
    title: 'Crea tu cuenta — NaN',
    heading: 'Este formulario necesita JavaScript.',
    body: 'El formulario de alta de nan.builders funciona con JavaScript y no se ha cargado en tu navegador. No se ha guardado nada de lo que escribiste. Puedes crear tu cuenta directamente en la plataforma de NaN.',
    cta: 'Crea tu cuenta',
    back: 'Volver a nan.builders',
    home: '/es',
  },
};

export function noJsPage(lang: NoJsLang): string {
  const c = COPY[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${c.title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px 16px; background: #0B0B0C; color: #FFFFFF;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 560px; border: 1px solid rgba(255,255,255,0.16); background: #121214; padding: 40px 32px; }
  .eyebrow { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 12px; letter-spacing: 0.08em; color: #9B6BF0; }
  h1 { margin-top: 16px; font-size: clamp(26px, 5vw, 34px); line-height: 1.1; }
  p { margin-top: 16px; color: #C9C9CC; font-size: 16px; line-height: 1.6; }
  .actions { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; }
  .btn {
    display: inline-flex; align-items: center; height: 46px; padding: 0 24px;
    background: #7D39EB; color: #fff; text-decoration: none;
    font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 14px;
  }
  .btn:hover, .btn:focus-visible { background: #fff; color: #0B0B0C; }
  .back { color: #9B6BF0; font-size: 14px; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">nan.builders</p>
  <h1>${c.heading}</h1>
  <p>${c.body}</p>
  <div class="actions">
    <a class="btn" href="${signupUrl()}">${c.cta} →</a>
    <a class="back" href="${c.home}">${c.back}</a>
  </div>
</main>
</body>
</html>
`;
}
