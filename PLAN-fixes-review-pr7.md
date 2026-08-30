# Plan: aplicar los fixes del review del PR #7 (frontend Hackatón NaN)

## Contexto

El PR [helmcode/nan#7](https://github.com/helmcode/nan/pull/7) añade el frontend del
#1 Hackatón NaN (Astro 6 SSR + Preact islands). El review de `barckcode` (equipo NaN)
listó hallazgos agrupados por severidad. Este plan aplica **todos** los fixes
(🔴 blockers, 🟡 importantes y 🟢 nits) sobre la rama `feat/hackaton-platform`.

Hallazgo verificado contra el backend (`nan-cloud-api`) durante la planificación:
la "inconsistencia de IP" no es un bug funcional (cada proxy ya casa con el header
que lee su endpoint Go), pero sí es frágil. El fix robusto es **reenviar ambos
headers** en ambos proxies (ver Fix 5).

Verificación de runtime: el proyecto usa `@astrojs/cloudflare@13.1.3` + Cloudflare
Workers, con `@cloudflare/workers-types` en `tsconfig.json` → `Headers.getSetCookie()`
está disponible (necesario para Fix 2).

Orden recomendado de commits: **(A) blockers de seguridad → (B) helpers/tipos
compartidos (`withLang`, `jsonData`, `hackaton-types`) → (C) importantes →
(D) nits/tests**. Tras cada bloque correr `npx astro check && npm test && npm run build`.

---

## 🔴 BLOCKERS

### Fix 1 — CSP `img-src`: permitir HTTPS externo y quitar `data:`

Afecta 3 layouts, todos con la **misma** línea idéntica (`content="..."`):
- `src/layouts/Page.astro:39`
- `src/layouts/Base.astro:53`
- `src/layouts/Docs.astro:68`

**Buscar** (idéntico en los 3): `img-src 'self' data:`
**Reemplazar por**: `img-src 'self' https:`

La línea completa pasa de:
```
content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
```
a (solo cambia el fragmento `img-src`):
```
content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
```

Esto desbloquea portadas externas (Imgur/R2/Cloudinary) **y** elimina el vector
`data:` SVG. Nota: en `Edit` usar `replace_all` no aplica entre archivos distintos;
hay que editar los 3 archivos. Si se prefiere whitelist estricta en vez de `https:`
amplio, sustituir por los hosts concretos cuando backend los confirme — fuera de scope.

---

### Fix 2 — Colapso de `Set-Cookie` en el proxy

`src/pages/api/hackaton/[...path].ts:41-42`

**Antes:**
```ts
  const setCookie = resp.headers.get('set-cookie');
  if (setCookie) headers.append('set-cookie', setCookie);
```
**Después:**
```ts
  // getSetCookie() devuelve un array sin colapsar comas (WHATWG); preserva
  // múltiples cookies (login + refresh, handoff de onboarding, etc.).
  for (const cookie of resp.headers.getSetCookie()) headers.append('set-cookie', cookie);
```

---

## 🟡 IMPORTANTES

### Fix 3 — `isAdminPath` normaliza ruta (defensa en profundidad)

`src/lib/hackaton.ts:6-8`

**Antes:**
```ts
export function isAdminPath(path: string): boolean {
  return path === ADMIN_PREFIX || path.startsWith(ADMIN_PREFIX + '/');
}
```
**Después:**
```ts
export function isAdminPath(path: string): boolean {
  // Normaliza: decodifica %2f, baja a minúsculas, quita barras iniciales y
  // colapsa barras repetidas, para que //admin, Admin/, %2fadmin no se cuelen.
  let p = path;
  try { p = decodeURIComponent(path); } catch { /* ruta malformada: usar tal cual */ }
  p = p.toLowerCase().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  return p === ADMIN_PREFIX || p.startsWith(ADMIN_PREFIX + '/');
}
```
Actualizar el test existente para cubrir las nuevas variantes (ver Fix 22).

---

### Fix 4 — No reenviar `Authorization` al backend

`src/lib/hackaton.ts:23-24` (dentro de `forwardHeaders`)

**Eliminar** estas dos líneas:
```ts
  const auth = request.headers.get('authorization');
  if (auth) out.set('authorization', auth);
```
La auth es por cookie `nan_session`; reenviar `Authorization` es innecesario y
arriesgado si un endpoint futuro confía en ambos.

---

### Fix 5 — Convención de IP consistente (reenviar ambos headers)

Verificado en backend: los handlers del hackatón leen `CF-Connecting-IP`
(`internal/middleware/hackaton_rate_limit.go:42`, `internal/handlers/hackathon.go:69`),
mientras que el login por email lee `X-Forwarded-For`
(`internal/handlers/auth_email.go:417`). Para que cualquier endpoint reciba la IP
real, **enviar ambos** en los dos proxies.

**5a.** `src/lib/hackaton.ts:27-28` (en `forwardHeaders`)
**Antes:**
```ts
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) out.set('cf-connecting-ip', ip);
```
**Después:**
```ts
  // Backend hackatón lee CF-Connecting-IP; otros endpoints X-Forwarded-For.
  // Reenviamos ambos para que el rate-limit por IP funcione en cualquier ruta.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) { out.set('cf-connecting-ip', ip); out.set('x-forwarded-for', ip); }
```

**5b.** `src/pages/api/auth/login-request.ts:31-32`
**Antes:**
```ts
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-forwarded-for', ip);
```
**Después:**
```ts
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) { headers.set('x-forwarded-for', ip); headers.set('cf-connecting-ip', ip); }
```

---

### Fix 6 — Paralelizar fetches SSR con `Promise.all`

Patrón: dos `await fetch` secuenciales independientes → un solo `Promise.all`.
Aplica a las páginas que hacen dos llamadas independientes:

**6a.** `src/pages/hackaton/me.astro:12-19`
**Antes:**
```ts
try {
  const res = await fetch(`${base}/api/hackaton/me`, {
    headers: { cookie: Astro.request.headers.get('cookie') ?? '', origin: 'https://nan.builders' },
  });
  if (res.ok) { const b = await res.json() as { data?: any }; me = b?.data?.participant; team = b?.data?.team; }
  const ev = await fetch(`${base}/api/hackaton/event`, { headers: { origin: 'https://nan.builders' } });
  if (ev.ok) status = (await ev.json() as { data?: any })?.data?.status ?? 'draft';
} catch {}
```
**Después:**
```ts
try {
  const cookie = Astro.request.headers.get('cookie') ?? '';
  const [res, ev] = await Promise.all([
    fetch(`${base}/api/hackaton/me`, { headers: { cookie, origin: 'https://nan.builders' } }),
    fetch(`${base}/api/hackaton/event`, { headers: { origin: 'https://nan.builders' } }),
  ]);
  if (res.ok) { const b = await jsonData(res); me = b?.participant; team = b?.team; }
  if (ev.ok) status = (await jsonData(ev))?.status ?? 'draft';
} catch {}
```
(usa el helper `jsonData` del Fix 18; implementar Fix 18 antes de hacer este cambio).

**6b.** `src/pages/hackaton/submission.astro:14-25` — mismo patrón: `Promise.all`
de `/me` y `/event`.

**6c.** `src/pages/hackaton/projects.astro:12-25` — `Promise.all` de `/projects` y `/me`.

**6d.** `src/pages/hackaton.astro` — aquí `/me` depende de `hasSession`. Mantener
el guard, pero lanzar `/event` y (si hay sesión) `/me` en paralelo:
```ts
const cookie = Astro.request.headers.get('cookie') ?? '';
const hasSession = cookie.includes('nan_session');
const [eventRes, meRes] = await Promise.all([
  fetch(`${base}/api/hackaton/event`, { headers: { origin: 'https://nan.builders' } }).catch(() => null),
  hasSession
    ? fetch(`${base}/api/hackaton/me`, { headers: { cookie, origin: 'https://nan.builders' } }).catch(() => null)
    : Promise.resolve(null),
]);
```
Luego procesar `eventRes`/`meRes` (ver Fix 9 para el manejo del 401).

---

### Fix 7 — `VoteButton` sin recarga dura de página

`src/components/hackaton/VoteButton.tsx:20-22`

**Implementar el estado del voto como dato local**, no solo como `state` visual:
si no, después de votar sin recarga el resto de tarjetas pierden el ✓, pero siguen
mostrando `Votar` en vez de `Cambiar voto` porque `hasVoted` se calculaba una sola
vez desde la prop SSR.

Cambiar import:
```tsx
import { useState, useEffect } from 'preact/hooks';
```

Cambiar firma para recibir también el enlace localizado de login:
```tsx
export default function VoteButton(
  { teamId, votedTeamId, loginHref, t }:
  { teamId: string; votedTeamId?: string | null; loginHref: string; t: Record<string, string> }
) {
```

Inicializar el voto actual en estado:
```tsx
  const [currentVotedTeamId, setCurrentVotedTeamId] = useState<string | null>(votedTeamId ?? null);
  const initial: 'idle' | 'voted' = currentVotedTeamId === teamId ? 'voted' : 'idle';
  const [state, setState] = useState<'idle' | 'busy' | 'voted' | 'self' | 'login' | 'not_eligible' | 'error'>(initial);
  const hasVoted = Boolean(currentVotedTeamId);
```

**Antes:**
```tsx
    // En éxito recargamos: el SSR vuelve a leer my_vote y deja un único ✓ coherente
    // en toda la galería (las tarjetas son islas independientes).
    if (resp.ok) { window.location.reload(); return; }
```
**Después:** marcar este botón como votado y avisar a las demás islas vía
`CustomEvent` para que limpien su ✓ sin recargar.
```tsx
    // En éxito: marca este voto y notifica a las otras tarjetas (islas
    // independientes) para que limpien su ✓ sin recargar la página.
    if (resp.ok) {
      setCurrentVotedTeamId(teamId);
      setState('voted');
      window.dispatchEvent(new CustomEvent('nan:voted', { detail: { teamId } }));
      return;
    }
```
Y añadir, dentro del componente, un efecto que escuche el evento y sincronice todas
las islas con el nuevo `teamId` votado:
```tsx
  useEffect(() => {
    function onVoted(e: Event) {
      const votedId = (e as CustomEvent<{ teamId: string }>).detail?.teamId;
      setCurrentVotedTeamId(votedId ?? null);
      setState(votedId === teamId ? 'voted' : 'idle');
    }
    window.addEventListener('nan:voted', onVoted);
    return () => window.removeEventListener('nan:voted', onVoted);
  }, [teamId]);
```

Cambiar la rama `login` para no perder `?lang=en`:
```tsx
  if (state === 'login') return <a href={loginHref} class="font-mono text-xs text-violet-400">{t.loginToVote}</a>;
```

En `src/pages/hackaton/projects.astro`, pasar la prop nueva:
```astro
<VoteButton
  client:visible
  teamId={p.team_id}
  votedTeamId={myVote}
  loginHref={withLang('/hackaton', locale)}
  t={tObj('hackaton.projects', locale)}
/>
```

---

### Fix 8 — Re-validar estado de fase al enviar la submission

`src/components/hackaton/SubmissionForm.tsx`, dentro de `onSubmit` (~línea 41,
antes del `fetch` de guardado). Confirmar que la fase sigue siendo editable
consultando `/api/hackaton/event`; si cambió, mostrar `errorClosed` sin perder
lo escrito (el form conserva su estado).
```tsx
    setBusy(true);
    setError('');
    // Revalidar fase: si pasó a congelado mientras el form estaba abierto,
    // avisar sin enviar (el usuario conserva lo escrito).
    try {
      const ev = await fetch('/api/hackaton/event');
      const evb = await ev.json().catch(() => null) as { data?: { status?: string } } | null;
      const st = evb?.data?.status;
      if (st && st !== 'building') { setBusy(false); setError(t.errorClosed); return; }
    } catch { /* best-effort: si falla, dejamos que el backend decida */ }
```
(El backend sigue siendo la autoridad: el POST mapea `wrong_state → errorClosed`
en la línea 61, esto solo mejora el caso común.)

---

### Fix 9 — Cookie expirada: tratar 401 de `/me` como "sin sesión"

`src/pages/hackaton.astro` (lógica de sesión, ~líneas 41-58). Con el Fix 6d ya
tenemos `meRes`. Tratar **solo** `401` y `403` como sesión inválida. No convertir
cualquier `!ok` en sesión caducada: un `500` upstream debe caer al comportamiento
best-effort actual, no forzar un login engañoso.
```ts
let myParticipant: Participant | null = null;
let sessionInvalid = false;
if (meRes) {
  if (meRes.status === 401 || meRes.status === 403) sessionInvalid = true;
  else if (meRes.ok) {
    const meData = await jsonData<MeData>(meRes);
    myParticipant = meData?.participant ?? null;
  }
}
// Si había cookie pero el backend la rechazó, la sesión está caducada.
const sessionExpired = hasSession && sessionInvalid;
```
En el `<template>` de la página, donde hoy se decide entre `RegisterForm` y panel,
añadir la rama: si `sessionExpired` → renderizar `<LoginForm client:load t={login} />`
(el componente ya existe y se importa en la línea 5). Ajustar la condición existente
para que `RegisterForm` solo se muestre cuando NO haya `sessionExpired`.

---

### Fix 10 — `CheckinForm` muestra error en UI

`src/components/hackaton/CheckinForm.tsx`

10a. Ampliar el tipo de strings (línea 3) para incluir `error`:
```tsx
export default function CheckinForm({ t }: { t: { button: string; submitting: string; done: string; closed: string; error: string } }) {
```
10b. Añadir la rama de render que falta (tras la línea 16, `if (state === 'closed')`):
```tsx
  if (state === 'error') return <p role="alert" class="text-red-400 font-mono text-sm">{t.error}</p>;
```
10c. Añadir la clave `error` en `i18n/es.json` y `i18n/en.json` bajo `hackaton.checkin`:
- es: `"error": "No se pudo confirmar la asistencia. Inténtalo de nuevo."`
- en: `"error": "Couldn't confirm attendance. Try again."`
10d. En `src/pages/hackaton/checkin.astro`, donde se construye el objeto `t` para
`CheckinForm`, asegurarse de pasar también `error` (si se pasa el objeto completo
`tObj('hackaton.checkin', locale)` ya queda incluido).

---

### Fix 11 — Enlaces internos preservan `?lang`

Añadir un helper reutilizable en `src/lib/i18n.ts` (al final del archivo):
```ts
// Mantiene el locale en navegación interna: withLang('/hackaton/me', 'en')
// → '/hackaton/me?lang=en'. En 'es' devuelve la ruta tal cual.
export function withLang(path: string, locale: string): string {
  return locale === 'en' ? `${path}${path.includes('?') ? '&' : '?'}lang=en` : path;
}
```
Reemplazar los `href` hardcodeados por `withLang(...)` (importar `withLang` donde
haga falta). Sitios a corregir:
- `src/pages/hackaton/me.astro:41` → `href={withLang('/hackaton/submission', locale)}`
- `src/pages/hackaton/submission.astro:46` → `href={withLang('/hackaton/me', locale)}`
- `src/pages/hackaton/checkin.astro:16` → `href={withLang('/hackaton', locale)}`
- `src/pages/hackaton/projects.astro:30` → `href={withLang('/hackaton', locale)}`
  (las líneas 45-52 son URLs externas de proyecto; no llevan `?lang`).
- `src/components/hackaton/RegisterForm.tsx:72` → el componente no conoce `locale`;
  pasarle props nuevas. En la interfaz `FormStrings` sí debe añadirse `meCta`
  porque el texto actual `→ Mi equipo` está hardcodeado en español; `meHref`
  va como prop aparte.
  - Añadir a `FormStrings`: `meCta: string;`
  - En `i18n/es.json` bajo `hackaton.form`: `"meCta": "→ Mi equipo"`
  - En `i18n/en.json` bajo `hackaton.form`: `"meCta": "→ My team"`
  - Cambiar firma:
    `export default function RegisterForm({ t, meHref }: { t: FormStrings; meHref: string })`
  - Cambiar success link:
    `<a href={meHref} ...>{t.meCta}</a>`
  - En `hackaton.astro` pasar:
    `<RegisterForm client:load t={form} meHref={meUrl} />`
- `src/components/hackaton/VoteButton.tsx:33` → el `href="/hackaton"` del estado
  `login`: pasar `loginHref` como prop desde `projects.astro` (`withLang('/hackaton', locale)`).
- Fix 21 añade el back-link del leaderboard con `withLang`.

---

### Fix 12 — `ReassignForm` sin strings españoles hardcodeados

`src/components/hackaton/ReassignForm.tsx` líneas 105, 109, 112.

12a. Extender la interfaz `ReassignInfo`/labels o pasar nuevas claves. Más simple:
ampliar `ReassignLabels` (líneas 16-21) con tres claves:
```tsx
interface ReassignLabels {
  pending: string;
  filled: string;
  noPool: string;
  already: string;
  selectAbsent: string;  // nuevo
  errorSubmit: string;   // nuevo
  sending: string;       // nuevo
}
```
12b. Sustituir literales:
- línea 105: `<option value="" disabled>Selecciona ausente</option>` →
  `<option value="" disabled>{labels.selectAbsent}</option>`
- línea 109: `...>No se pudo registrar.</p>` → `...>{labels.errorSubmit}</p>`
- línea 112: `{state === 'busy' ? 'Enviando…' : ctaLabel}` →
  `{state === 'busy' ? labels.sending : ctaLabel}`
12c. Añadir las claves en `i18n/{es,en}.json` bajo `hackaton.me`, que es la ruta
real que hoy alimenta `labels` desde `src/pages/hackaton/me.astro`:
- es:
  - `"reassignSelectAbsent": "Selecciona ausente"`
  - `"reassignErrorSubmit": "No se pudo registrar."`
  - `"reassignSending": "Enviando…"`
- en:
  - `"reassignSelectAbsent": "Select absent member"`
  - `"reassignErrorSubmit": "Couldn't register."`
  - `"reassignSending": "Sending…"`
12d. En `src/pages/hackaton/me.astro`, incluir las tres claves nuevas en el objeto
`labels` que se pasa a `<ReassignForm>`:
```astro
labels={{
  pending: t('hackaton.me.reassignPending', locale),
  filled: t('hackaton.me.reassignFilled', locale),
  noPool: t('hackaton.me.reassignNoPool', locale),
  already: t('hackaton.me.reassignAlready', locale),
  selectAbsent: t('hackaton.me.reassignSelectAbsent', locale),
  errorSubmit: t('hackaton.me.reassignErrorSubmit', locale),
  sending: t('hackaton.me.reassignSending', locale),
}}
```

---

### Fix 13 — Validar esquema de URLs en `projects.astro`

`src/pages/hackaton/projects.astro`. Añadir helper en el frontmatter:
```ts
// Solo http/https en enlaces de proyecto (defensa en profundidad frente a
// javascript:, data:, etc. aunque el backend ya valide).
const safeUrl = (u?: string): string | null =>
  u && /^https?:\/\//i.test(u) ? u : null;
```
Aplicar a las líneas 40 (img) y 45-52 (anchors). Para no llamar varias veces al
helper por cada URL, calcular una vez dentro del `map`:
```astro
{projects.map((p) => {
  const imageUrl = safeUrl(p.image_url);
  const publicUrl = safeUrl(p.public_url);
  const spaceUrl = safeUrl(p.space_url);
  const repoUrl = safeUrl(p.repo_url);
  const videoUrl = safeUrl(p.video_url);
  return (
    <article class="...">
      {imageUrl && <img src={imageUrl} alt="" class="..." loading="lazy" />}
      ...
      {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" class="...">Live</a>}
      {spaceUrl && <a href={spaceUrl} target="_blank" rel="noreferrer" class="...">Space</a>}
      {repoUrl && <a href={repoUrl} target="_blank" rel="noreferrer" class="...">Repo</a>}
      {videoUrl && (
        <a href={videoUrl} target="_blank" rel="noreferrer" class="...">▶ {t('hackaton.projects.presentationVideo', locale)}</a>
      )}
    </article>
  );
})}
```
Aplicar la misma validación a la vista readonly de la submission: si se convierten
esas filas en enlaces clicables en este PR, usar `safeUrl`; si siguen como texto
en `<dd>`, no hace falta porque no hay navegación ejecutable.

---

### Fix 14 — `RegistrationBar` defensivo ante `capacity === 0`

`src/components/hackaton/RegistrationBar.astro:30`

**Antes:**
```ts
const mainPct = Math.round((mainTaken / capacity) * 100);
```
**Después:**
```ts
const mainPct = capacity > 0 ? Math.round((mainTaken / capacity) * 100) : 0;
```
(`poolPct` en la línea 32 ya está guardado con `reserve > 0 ? ... : 0`.)

---

## 🟢 NITS

### Fix 15 — Directivas de hidratación

- `src/pages/hackaton/projects.astro:55` (aprox., donde se renderiza `VoteButton`):
  `client:load` → `client:visible`.
- `src/pages/hackaton/me.astro` (`<ReassignForm>`): `client:load` → `client:visible`.
- `src/pages/hackaton/checkin.astro` (`<CheckinForm>`): `client:load` → `client:idle`.

### Fix 16 — Tipado de `SubmissionForm`

`src/components/hackaton/SubmissionForm.tsx`. Sustituir `any`:
- línea 14: `checks?: any;` → definir tipos que reflejen el shape real. Importante:
  `Existing.checks` es el mapa interno de checks; el estado `checks` del componente
  guarda el resumen completo con `auto_points`, `not_prize_eligible` y `checks`.
```tsx
interface CheckItem { pass: boolean }
interface SubmissionChecks {
  url_live?: CheckItem;
  in_nan_space?: CheckItem;
  repo_public?: CheckItem;
}
interface SubmissionValidation {
  auto_points?: number;
  not_prize_eligible?: boolean;
  checks?: SubmissionChecks;
}
interface Existing extends SubmissionValidation {
  title?: string;
  description?: string;
  public_url?: string;
  space_url?: string;
  repo_url?: string;
  image_url?: string;
  video_url?: string;
}
type FieldKey = 'title' | 'description' | 'public_url' | 'space_url' | 'repo_url' | 'image_url' | 'video_url';
```
- Sustituir la interfaz `Existing` actual completa por la anterior.
- línea 28: `useState<any>(existing ?? null)` →
  `useState<SubmissionValidation | null>(existing ?? null)`
- línea 35: `const set = (k: string) => (e: any) =>` → tipar la key y el evento:
  `const set = (k: FieldKey) =>`
  `(e: Event) => setF({ ...f, [k]: (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value })`
- línea 51: tipar la respuesta de guardado:
```tsx
const b = await resp.json().catch(() => null) as { ok?: boolean; data?: SubmissionValidation; error?: string } | null;
```
- líneas 112-114: al hacer opcionales los checks, usar optional chaining para no
  romper si el backend omite alguno:
```tsx
<li>{checks.checks.url_live?.pass ? '✓' : '✗'} {t.urlLive}</li>
<li>{checks.checks.in_nan_space?.pass ? '✓' : '✗'} {t.inNanSpace}</li>
<li>{checks.checks.repo_public?.pass ? '✓' : '✗'} {t.repoPublic}</li>
```

### Fix 17 — Interfaz `MeResponse`

`src/pages/hackaton/me.astro:11,16,18` (y reutilizable en `submission.astro`,
`projects.astro`, `hackaton.astro`). **No poner estos tipos en `src/lib/hackaton.ts`**
si van a importarse desde componentes/islas: ese archivo importa `cloudflare:workers`
en runtime. Crear un archivo separado sin imports de runtime:

`src/lib/hackaton-types.ts`
```ts
export interface Participant {
  id: string;
  name: string;
  status?: string;
  checkin_at?: string | null;
  discord_user?: string;
  specialty?: string;
  level?: string;
  is_reserve?: boolean;
}

export interface Team {
  id: string;
  name?: string;
  members?: Participant[];
}

export interface MeData {
  participant?: Participant | null;
  team?: Team | null;
  my_vote?: string | null;
  submission?: Submission | null;
}

export interface Submission {
  title?: string;
  description?: string;
  public_url?: string;
  space_url?: string;
  repo_url?: string;
  image_url?: string;
  video_url?: string;
  auto_points?: number;
  not_prize_eligible?: boolean;
  checks?: {
    url_live?: { pass: boolean };
    in_nan_space?: { pass: boolean };
    repo_public?: { pass: boolean };
  };
}
```
Usar imports de tipo:
```ts
import type { MeData, Participant, Team, Submission } from '../../lib/hackaton-types';
```
Y reemplazar `any` por `Participant | null`, `Team | null`, `Submission | null`
en las páginas correspondientes. En `src/pages/hackaton/projects.astro` puede
añadirse también un `Project` local o en este archivo si se quiere tipar la lista.

### Fix 18 — Helper `jsonData` para `body.json() as { data?: any }`

Repetido en 5 páginas. Añadir a `src/lib/hackaton.ts` (este helper solo se usa en
SSR/API, no desde islas cliente):
```ts
// Lee el envelope { data } estándar de la API; null si el cuerpo no es JSON.
export async function jsonData<T = unknown>(res: Response): Promise<T | null> {
  try { return ((await res.json()) as { data?: T })?.data ?? null; }
  catch { return null; }
}
```
Reemplazar los `(await x.json() as { data?: any })?.data` en `hackaton.astro`,
`me.astro`, `submission.astro`, `projects.astro`, `leaderboard.astro`.

### Fix 19 — Accesibilidad: `<label>` en inputs

- `src/components/hackaton/SubmissionForm.tsx:74-78,90,99` — cada `<input>`/`<textarea>`
  con solo `placeholder` necesita un `<label>` asociado (o `aria-label`). Patrón mínimo:
  `<label class="sr-only" for="sub-title">{t.fTitle}</label>` + `id="sub-title"` en el input.
  Aplicar a title, description, public_url, space_url, repo_url, video_url, image_url.
- `src/components/hackaton/ReassignForm.tsx:102` — el `<select>` necesita
  `aria-label={info.label}` (ya existe ese string) o un `<label>` asociado.

### Fix 20 — Manejar 429 / `errorRate` en `RegisterForm`

`src/components/hackaton/RegisterForm.tsx`.
- Añadir `errorRate: string;` a `FormStrings` (líneas 4-13).
- En el mapeo de errores (líneas 59-63), añadir:
```tsx
    if (resp.status === 429 || code === 'rate_limited') message = t.errorRate;
    else if (resp.status === 409 || code === 'registration_full') message = t.errorFull;
    else if (resp.status === 403 || code === 'not_eligible') message = t.errorEligible;
    else if (code === 'discord_required') message = t.errorDiscord;
```
  Sustituir el bloque `if/else if` actual por este orden para que `rate_limited`
  no quede escondido detrás de otros códigos.
- Añadir clave `errorRate` en `i18n/{es,en}.json` bajo `hackaton.form`
  (ya existe en `hackaton.login`; reutilizar el mismo texto):
  - es: `"errorRate": "Demasiados intentos. Espera un momento e inténtalo de nuevo."`
  - en: `"errorRate": "Too many attempts. Wait a moment and try again."`

Aplicar también a `src/components/hackaton/SubmissionForm.tsx`, porque el backend
puede rate-limitar guardados:
- Añadir `errorRate` bajo `hackaton.submission` en ambos JSON:
  - es: `"errorRate": "Demasiados intentos. Espera un momento e inténtalo de nuevo."`
  - en: `"errorRate": "Too many attempts. Wait a moment and try again."`
- En el mapeo de errores de submission, antes de `validation_failed`:
```tsx
if (resp.status === 429 || code === 'rate_limited') setError(t.errorRate);
else if (code === 'validation_failed') setError(t.errorRequired);
else if (code === 'wrong_state') setError(t.errorClosed);
else setError(t.error);
```

### Fix 21 — Back-link en `leaderboard.astro`

`src/pages/hackaton/leaderboard.astro` no tiene enlace de vuelta. Añadir en el
`<template>` (cabecera de la página), consistente con `projects.astro:30`:
```astro
<a href={withLang('/hackaton', locale)} class="font-mono text-xs text-neutral-500 hover:text-violet-400">
  {t('hackaton.backToLanding', locale)}
</a>
```
(La clave `hackaton.backToLanding` ya existe en ambos JSON.) Importar `withLang`.

### Fix 22 — Tests (vitest)

`src/tests/api/hackaton.test.ts`. Estado actual: solo cubre `isAdminPath` y
`backendURL` (~19 líneas), con `beforeEach` importado sin usar.

22a. Quitar `beforeEach` del import de la línea 1 (resuelve un hint de astro check):
```ts
import { describe, it, expect, vi } from 'vitest';
```
22b. Ampliar `isAdminPath` para las variantes normalizadas del Fix 3:
```ts
  it('normaliza variantes admin', () => {
    expect(isAdminPath('//admin/state')).toBe(true);
    expect(isAdminPath('admin//x')).toBe(true);
    expect(isAdminPath('Admin/state')).toBe(true);
    expect(isAdminPath('%2fadmin/state')).toBe(true);
    expect(isAdminPath('administration')).toBe(false);
  });
```
22c. Añadir tests del proxy handler end-to-end (`src/pages/api/hackaton/[...path].ts`)
siguiendo el patrón del repo: `vi.mock('cloudflare:workers')`, importar el handler
después del mock y mockear `globalThis.fetch`.

Casos obligatorios:
- admin → 404 y no llama a `fetch`.
- forwarding de cookie y ausencia de `authorization`.
- forwarding de IP en `cf-connecting-ip` y `x-forwarded-for`.
- propagación multi `Set-Cookie` con `getSetCookie()`.
- error upstream → 500.

Ejemplo de mock para multi cookie (usar `Response` real y sobrescribir
`getSetCookie`, porque `Headers.append('set-cookie', ...)` en Node puede colapsar):
```ts
const upstream = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});
Object.defineProperty(upstream.headers, 'getSetCookie', {
  value: () => ['a=1; Path=/; HttpOnly', 'b=2; Path=/; HttpOnly'],
});
(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(upstream);
```
Para invocar el handler:
```ts
const response = await (GET as any)({
  params: { path: 'me' },
  request: new Request('https://nan.builders/api/hackaton/me', {
    headers: { cookie: 'nan_session=s', authorization: 'Bearer leaked', 'cf-connecting-ip': '1.2.3.4' },
  }),
  url: new URL('https://nan.builders/api/hackaton/me'),
});
```
Validar que el `init.headers` enviado al backend contiene `cookie`,
`cf-connecting-ip`, `x-forwarded-for`, `origin`, `content-type` y **no** contiene
`authorization`.

22d. Añadir tests de `/api/auth/login-request` (forwarding de IP en ambos headers).
Mockear `globalThis.fetch`, invocar `POST` con un `Request` JSON y verificar que
el `RequestInit.headers` enviado tiene `x-forwarded-for` y `cf-connecting-ip`
con la IP recibida.

22e. Tests de mapeo de códigos de error en componentes opcional (requiere
`@testing-library/preact`, que no está instalado → dejar como follow-up si no se quiere añadir dependencia).

### Fix 23 — Hints de `astro check`

- `src/pages/hackaton/me.astro:11`: variable `me` — queda **usada** tras Fix 17
  (se renderiza). Si tras los cambios sigue sin usarse en algún punto, eliminarla.
- `src/tests/api/hackaton.test.ts:1`: `beforeEach` sin usar → resuelto en Fix 22a.

---

## Fuera de scope (follow-up, lo dice el propio review)

- `npm audit`: 14 vulnerabilidades (2 high) en dependencias — no es de este PR.
- Whitelist estricta de hosts de imagen (requiere coordinación con backend).
- Tests de componentes con `@testing-library/preact` (nueva dependencia).

---

## Verificación (tras aplicar los fixes)

Las 3 que corre CI, en orden:
```bash
cd /Users/saulgomezjimenez/proyectos/clientes/helmcode/nan
npx astro check   # esperado: 0 errores, 0 hints (Fix 22a/23)
npm test          # esperado: verde, con los tests nuevos del Fix 22
npm run build     # esperado: build limpio
```
Comprobaciones manuales recomendadas:
- CSP: cargar la galería con una `image_url` en host HTTPS externo → se ve (Fix 1).
- Voto: votar y verificar que las otras tarjetas pierden el ✓ sin recargar (Fix 7).
- Sesión caducada: con cookie `nan_session` inválida, la landing muestra `LoginForm`
  en vez de `RegisterForm` (Fix 9).
- i18n: navegar en `?lang=en` por me/submission/projects/checkin/leaderboard y
  confirmar que el idioma se mantiene (Fix 11/21) y que ReassignForm sale en inglés (Fix 12).

## Archivos modificados (resumen)

- `src/layouts/{Page,Base,Docs}.astro` — CSP
- `src/pages/api/hackaton/[...path].ts` — Set-Cookie
- `src/pages/api/auth/login-request.ts` — IP
- `src/lib/hackaton.ts` — isAdminPath, Authorization, IP, jsonData
- `src/lib/hackaton-types.ts` — tipos compartidos de participante/equipo/submission
- `src/lib/i18n.ts` — withLang
- `src/pages/hackaton.astro` — fetches paralelos, sesión 401, prop meHref
- `src/pages/hackaton/{me,submission,projects,leaderboard,checkin}.astro` — fetches, links, URLs seguras, hidratación, back-link
- `src/components/hackaton/{VoteButton,SubmissionForm,CheckinForm,RegisterForm,ReassignForm}.tsx`
- `src/components/hackaton/RegistrationBar.astro` — guard capacity
- `i18n/es.json`, `i18n/en.json` — claves nuevas (checkin.error, form.meCta,
  form.errorRate, submission.errorRate, reassign select/error/sending)
- `src/tests/api/hackaton.test.ts` — tests ampliados
