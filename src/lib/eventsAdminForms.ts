import { adminFetch, adminHref, type AdminScreen, type ApiResult } from './eventsAdmin';

/**
 * Formularios del panel de eventos (SPEC v3 §8, W-03): lista, alta, edición,
 * clonado y archivado. Sin JavaScript en el cliente: cada pantalla es un
 * `<form method="post">` que el fichero de ruta procesa en SSR y que acaba
 * en una redirección (patrón POST → redirect → GET) o en el mismo
 * formulario con el error del backend.
 *
 * El cuerpo que se manda al backend es el `event.json` de §5.1: aquí solo
 * se traduce el formulario a ese JSON (y a la inversa para rellenarlo).
 * La validación real la hace el servidor; el panel solo enseña su respuesta.
 */

export const EVENT_KINDS = [
  { value: 'hackathon', label: 'Hackatón' },
  { value: 'challenge', label: 'Reto' },
  { value: 'workshop', label: 'Taller' },
  { value: 'other', label: 'Otro' },
] as const;

export const FIELD_MODES = [
  { value: 'required', label: 'Obligatorio' },
  { value: 'optional', label: 'Opcional' },
  { value: 'hidden', label: 'Oculto' },
] as const;

export const SUBMISSION_FIELDS = [
  { key: 'description', label: 'Descripción' },
  { key: 'repo_url', label: 'URL del repositorio' },
  { key: 'space_url', label: 'URL del space' },
  { key: 'image_url', label: 'URL de imagen' },
  { key: 'video_url', label: 'URL de vídeo' },
] as const;

export const CHECKS = [
  { value: 'url_live', label: 'URL viva (puntúa)' },
  { value: 'in_nan_space', label: 'Desplegado en un space de NaN (puntúa)' },
  { value: 'repo_public', label: 'Repositorio público (no puntúa; puede condicionar el premio)' },
] as const;

/** Checks que suman puntos automáticos: `voting.auto_max` se deriva de ellos (el backend lo exige). */
const SCORING_CHECKS = ['url_live', 'in_nan_space'];

export const DATE_FIELDS = [
  { key: 'registration_open', label: 'Apertura de inscripción' },
  { key: 'registration_close', label: 'Cierre de inscripción' },
  { key: 'submission_open', label: 'Apertura de entregas' },
  { key: 'submission_close', label: 'Cierre de entregas' },
  { key: 'voting_open', label: 'Apertura de votación' },
  { key: 'voting_close', label: 'Cierre de votación' },
  { key: 'demo_day', label: 'Demo day' },
] as const;

/** Etiquetas en español de los avisos del backend (API.md §8). */
export const WARNING_LABELS: Record<string, string> = {
  no_change: 'La operación no cambia nada.',
  dates_changed_registration: 'Cambia una fecha con la inscripción abierta.',
  dates_changed_submission: 'Cambia una fecha con las entregas abiertas.',
  dates_changed_voting: 'Cambia una fecha con la votación abierta.',
  team_size_changed: 'Cambia el tamaño de equipo con equipos ya creados.',
  modules_changed: 'Cambian los módulos con datos ya creados o fuera de borrador.',
  format_changed: 'Cambia el formato con datos ya creados o fuera de borrador.',
  capacity_exceeded: 'Hay más inscritos activos que aforo.',
  automation_dates_missing: 'La automatización por fechas está activa pero faltan fechas.',
  automation_off: 'La automatización por fechas está apagada.',
  slug_changed: 'El evento se ha renombrado: cambian las URLs.',
  votes_kept: 'Se conservan los votos.',
  submissions_kept: 'Se conservan las entregas.',
  leaderboard_hidden: 'El ranking deja de ser público.',
  leaderboard_not_public: 'Se cierra sin publicar el ranking.',
  teams_missing: 'Formato por equipos sin equipos creados.',
  voting_not_open: 'Se entra en votación sin abrir la votación.',
  voting_closed: 'La votación abierta se cierra con este cambio.',
  archive_active: 'El evento no está cerrado ni cancelado: solo se archiva forzando.',
  event_archived: 'El evento está archivado.',
  seat_free: 'Se libera una plaza y nadie sube de reserva automáticamente.',
  member_not_found: 'Ese email no tiene cuenta de NaN.',
  invalid_email: 'Email mal formado.',
  participant_exists: 'Esa cuenta ya está inscrita.',
  team_under_min: 'Equipo por debajo del mínimo.',
  team_over_size: 'Equipo por encima del tamaño.',
  team_empty: 'Equipo vacío.',
  participant_restored: 'El alta reincorporó a alguien que estaba de baja.',
  teams_replaced: 'Se han sustituido los equipos existentes.',
  checks_rerun: 'Se han vuelto a ejecutar los checks.',
};

export function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

/** Mensajes de confirmación tras una redirección (`?ok=`); solo claves conocidas. */
export const FLASH_LABELS: Record<string, string> = {
  creado: 'Evento creado en borrador.',
  guardado: 'Cambios guardados.',
  clonado: 'Evento clonado en borrador, sin participantes ni fechas.',
  archivado: 'Evento archivado: queda en solo lectura.',
  desarchivado: 'Evento desarchivado.',
  estado: 'Estado cambiado.',
  sweep: 'Sweep ejecutado: el estado ha avanzado por fecha.',
  alta: 'Participante dado de alta.',
  editado: 'Participante actualizado.',
  baja: 'Participante dado de baja (se conserva el historial).',
  reincorporado: 'Participante reincorporado.',
  promovido: 'Participante promovido de reserva a inscrito.',
  reserva: 'Participante pasado a reserva.',
  importado: 'Importación aplicada.',
  equipo_creado: 'Equipo creado.',
  renombrado: 'Equipo renombrado.',
  disuelto: 'Equipo disuelto: sus miembros siguen inscritos, sin equipo.',
  movido: 'Participante movido de equipo.',
  quitado: 'Participante sacado del equipo (sigue inscrito).',
  generado: 'Equipos generados.',
  entrega_editada: 'Entrega actualizada.',
  entrega_retirada: 'Entrega retirada (se conserva; se puede restaurar).',
  entrega_restaurada: 'Entrega restaurada.',
  check_forzado: 'Check fijado a mano: verify no lo pisará.',
  check_reiniciado: 'Check devuelto al resultado automático.',
  premio: 'Elegibilidad de premio fijada a mano.',
  premio_automatico: 'Elegibilidad de premio devuelta al cálculo automático.',
  verificado: 'Checks verificados en todas las entregas activas.',
  restaurado: 'Backup restaurado: el fichero anterior queda guardado como backup nuevo.',
  votacion_abierta: 'Votación abierta.',
  votacion_cerrada: 'Votación cerrada: el ranking queda congelado y publicado.',
};

/**
 * Orden canónico de estados según los módulos (SPEC v3 §4.1; espejo de
 * `EventModules.StatusSequence` del backend). `cancelled` no está en la
 * secuencia.
 */
export function statusSequence(m: { registration: boolean; teams: boolean; submissions: boolean; voting: boolean }): string[] {
  const seq = ['draft'];
  if (m.registration && m.teams) seq.push('registration');
  if (m.submissions) {
    seq.push('building', 'submission');
    if (m.voting) seq.push('voting');
  } else if (m.registration && !m.teams) {
    seq.push('registration'); // workshop: solo inscripción
  } else if (!m.registration) {
    seq.push('published'); // informativo: se anuncia y se cierra (B-26)
  }
  seq.push('closed');
  return seq;
}

export type StateMove = 'forward' | 'back' | 'cancel' | 'restore';

/** Un destino de transición permitido por §4.2 y cómo se llega a él. */
export interface StateTarget {
  status: string;
  move: StateMove;
}

/**
 * Destinos a los que se puede pasar desde `status` (SPEC v3 §4.2): avanzar
 * a cualquier estado posterior, retroceder solo uno, cancelar salvo desde
 * `closed`, y desde `cancelled` solo volver a `previous_status`. Es el mismo
 * cálculo que hace el backend; el panel lo usa para no ofrecer botones que
 * fallarían con `invalid_transition`.
 */
export function stateTargets(
  status: string,
  modules: Parameters<typeof statusSequence>[0],
  previousStatus?: string | null,
): StateTarget[] {
  if (status === 'cancelled') {
    return previousStatus ? [{ status: previousStatus, move: 'restore' }] : [];
  }
  const seq = statusSequence(modules);
  const at = seq.indexOf(status);
  const out: StateTarget[] = [];
  if (at >= 0) {
    if (at > 0) out.push({ status: seq[at - 1], move: 'back' });
    for (const s of seq.slice(at + 1)) out.push({ status: s, move: 'forward' });
  }
  if (status !== 'closed') out.push({ status: 'cancelled', move: 'cancel' });
  return out;
}

export const STATE_MOVE_LABELS: Record<StateMove, string> = {
  forward: 'avanzar a',
  back: 'retroceder a',
  cancel: 'cancelar el evento',
  restore: 'volver a',
};

/** Fecha RFC 3339 → valor de `<input type="datetime-local">` en UTC (`2027-01-10T00:00`). */
export function isoToLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

/** Valor de `datetime-local` (interpretado en UTC) → RFC 3339, o `null` si está vacío. */
export function localToIso(local?: string | null): string | null {
  const v = (local ?? '').trim();
  if (!v) return null;
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Lista separada por comas o saltos de línea, sin vacíos ni duplicados. */
export function splitList(raw?: string | null): string[] {
  const out: string[] = [];
  for (const item of (raw ?? '').split(/[,\n]/)) {
    const v = item.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Valores del formulario, siempre como texto (lo que Astro recibe y lo que se pinta). */
export type EventFormValues = Record<string, string | string[]>;

/** Lo que hace falta del `event.json` para rellenar el formulario. */
export interface EventLike {
  slug?: string;
  kind?: string;
  name?: string;
  description?: string;
  rules?: string;
  prize?: string;
  format?: string;
  modules?: { registration?: boolean; teams?: boolean; submissions?: boolean; voting?: boolean };
  automation?: { date_transitions?: boolean };
  dates?: Record<string, string | null>;
  registration?: { capacity?: number; reserve_capacity?: number; discord_user?: string; specialties?: string[]; levels?: string[] };
  team?: { size?: number; min_size?: number; max_teams?: number } | null;
  submission?: { fields?: Record<string, string>; checks?: string[]; prize_requires?: string[]; gallery_visibility?: string };
  voting?: { enabled?: boolean; vote_weight?: number; auto_max?: number };
}

/** Valores por defecto de un evento nuevo (los del ejemplo de `docs/examples/evento-v3`). */
export const NEW_EVENT_DEFAULTS: EventLike = {
  kind: 'hackathon',
  format: 'team',
  modules: { registration: true, teams: true, submissions: true, voting: true },
  automation: { date_transitions: true },
  registration: { capacity: 40, reserve_capacity: 10, discord_user: 'required', specialties: ['backend', 'frontend', 'devops', 'data'], levels: ['junior', 'mid', 'senior'] },
  team: { size: 4, min_size: 3, max_teams: 10 },
  submission: {
    fields: { description: 'optional', repo_url: 'required', space_url: 'optional', image_url: 'optional', video_url: 'optional' },
    checks: ['url_live', 'repo_public'],
    prize_requires: ['repo_public'],
    gallery_visibility: 'from_voting',
  },
  voting: { enabled: true, vote_weight: 8 },
};

/** `event.json` → valores del formulario. */
export function eventToForm(ev: EventLike): EventFormValues {
  const v: EventFormValues = {
    slug: ev.slug ?? '',
    kind: ev.kind ?? 'hackathon',
    name: ev.name ?? '',
    description: ev.description ?? '',
    rules: ev.rules ?? '',
    prize: ev.prize ?? '',
    format: ev.format ?? 'team',
    module_registration: ev.modules?.registration ? 'on' : '',
    module_submissions: ev.modules?.submissions ? 'on' : '',
    voting_enabled: (ev.voting?.enabled ?? ev.modules?.voting) ? 'on' : '',
    date_transitions: ev.automation?.date_transitions ? 'on' : '',
    capacity: String(ev.registration?.capacity ?? 0),
    reserve_capacity: String(ev.registration?.reserve_capacity ?? 0),
    discord_user: ev.registration?.discord_user ?? 'optional',
    specialties: (ev.registration?.specialties ?? []).join(', '),
    levels: (ev.registration?.levels ?? []).join(', '),
    team_size: String(ev.team?.size ?? 4),
    team_min_size: String(ev.team?.min_size ?? 3),
    team_max_teams: String(ev.team?.max_teams ?? 10),
    checks: ev.submission?.checks ?? [],
    prize_requires: ev.submission?.prize_requires ?? [],
    gallery_visibility: ev.submission?.gallery_visibility ?? 'from_voting',
    vote_weight: String(ev.voting?.vote_weight ?? 0),
  };
  for (const d of DATE_FIELDS) v[`date_${d.key}`] = isoToLocal(ev.dates?.[d.key]);
  for (const f of SUBMISSION_FIELDS) v[`field_${f.key}`] = ev.submission?.fields?.[f.key] ?? 'optional';
  return v;
}

/** FormData → valores del formulario (los checkboxes múltiples como lista). */
export function formValues(fd: FormData): EventFormValues {
  const v: EventFormValues = {};
  for (const [k, raw] of fd.entries()) {
    if (typeof raw !== 'string') continue;
    if (k === 'checks' || k === 'prize_requires') {
      v[k] = [...((v[k] as string[] | undefined) ?? []), raw];
    } else {
      v[k] = raw;
    }
  }
  v.checks ??= [];
  v.prize_requires ??= [];
  return v;
}

export const str = (v: EventFormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const list = (v: EventFormValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const num = (v: EventFormValues, k: string) => {
  const n = Number(str(v, k));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
export const on = (v: EventFormValues, k: string) => str(v, k) !== '';

/**
 * Valores del formulario → cuerpo de `POST admin/events` / `PUT {slug}/admin`
 * (§5.1). Se mandan siempre `modules`, `format` y `voting.enabled`
 * coherentes entre sí y `voting.auto_max` derivado de los checks puntuables.
 */
export function formToEventBody(v: EventFormValues): Record<string, unknown> {
  const format = str(v, 'format') === 'solo' ? 'solo' : 'team';
  const checks = list(v, 'checks');
  const prizeRequires = list(v, 'prize_requires').filter((c) => checks.includes(c));
  const dates: Record<string, string | null> = {};
  for (const d of DATE_FIELDS) dates[d.key] = localToIso(str(v, `date_${d.key}`));
  const fields: Record<string, string> = {};
  for (const f of SUBMISSION_FIELDS) fields[f.key] = str(v, `field_${f.key}`) || 'optional';
  const votingEnabled = on(v, 'voting_enabled');

  const body: Record<string, unknown> = {
    slug: str(v, 'slug'),
    kind: str(v, 'kind') || 'hackathon',
    name: str(v, 'name'),
    description: str(v, 'description'),
    rules: str(v, 'rules'),
    prize: str(v, 'prize'),
    format,
    modules: {
      registration: on(v, 'module_registration'),
      teams: format === 'team',
      submissions: on(v, 'module_submissions'),
      voting: votingEnabled,
    },
    automation: { date_transitions: on(v, 'date_transitions') },
    dates,
    registration: {
      capacity: num(v, 'capacity'),
      reserve_capacity: num(v, 'reserve_capacity'),
      discord_user: str(v, 'discord_user') || 'optional',
      specialties: splitList(str(v, 'specialties')),
      levels: splitList(str(v, 'levels')),
    },
    submission: {
      fields,
      checks,
      prize_requires: prizeRequires,
      gallery_visibility: str(v, 'gallery_visibility') || 'from_voting',
    },
    voting: {
      enabled: votingEnabled,
      vote_weight: num(v, 'vote_weight'),
      auto_max: checks.filter((c) => SCORING_CHECKS.includes(c)).length,
    },
  };
  if (format === 'team') {
    body.team = { size: num(v, 'team_size'), min_size: num(v, 'team_min_size'), max_teams: num(v, 'team_max_teams') };
  }
  return body;
}

/**
 * Un POST del panel tiene que venir de nan.builders: con `Origin` (o
 * `Sec-Fetch-Site`) de otro sitio no se procesa. Es la defensa CSRF del
 * panel, por si la cookie llegara a viajar en una navegación de terceros.
 */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Resultado de procesar un formulario: redirigir o volver a pintar con lo que dijo el backend. */
export interface FormOutcome {
  /** Adónde ir (303) tras un cambio real. */
  redirect?: string;
  /** Qué botón se pulsó (`save`, `simulate`, `create`, `clone`, `archive`, `unarchive`, `state_preview`, `state`, `sweep`). */
  action?: string;
  /** Respuesta del backend cuando no hay redirección (error o simulación). */
  result?: ApiResult<unknown>;
  /** Lo que el usuario había escrito, para no perderlo al re-pintar. */
  values?: EventFormValues;
  /** El POST no venía de nan.builders. */
  forbidden?: boolean;
}

export async function readForm(request: Request): Promise<{ fd: FormData | null; forbidden: boolean }> {
  if (request.method !== 'POST') return { fd: null, forbidden: false };
  if (!sameOrigin(request)) return { fd: null, forbidden: true };
  try {
    return { fd: await request.formData(), forbidden: false };
  } catch {
    return { fd: null, forbidden: true };
  }
}

/** URL de vuelta tras un cambio: `/events/admin/{slug}[/pantalla]?ok=…&warn=a,b`. */
export function doneHref(slug: string, ok: string, warnings: string[] = [], screen: AdminScreen = 'evento'): string {
  const q = new URLSearchParams({ ok });
  // Sin repetidos: al mover entre equipos el backend puede avisar lo mismo del origen y del destino.
  const warn = [...new Set(warnings)].filter((w) => w !== 'no_change');
  if (warn.length) q.set('warn', warn.join(','));
  return `${adminHref(slug, screen)}?${q.toString()}`;
}

/**
 * Lee `?ok=` y `?warn=` de una URL y los convierte en textos; ignora lo
 * desconocido. Si en este mismo render se ha atendido un POST (`outcome`),
 * el flash se descarta: viene del cambio anterior (el formulario envía a la
 * URL actual, `?ok=` incluido) y contarlo otra vez encima del resultado
 * nuevo miente sobre lo que acaba de pasar.
 */
export function readFlash(url: URL, outcome?: FormOutcome): { ok: string | null; warnings: string[] } {
  if (outcome && (outcome.action || outcome.forbidden)) return { ok: null, warnings: [] };
  const okKey = url.searchParams.get('ok') ?? '';
  const ok = FLASH_LABELS[okKey] ?? null;
  const warnings = (url.searchParams.get('warn') ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter((w) => /^[a-z_]+$/.test(w));
  return { ok, warnings };
}

/** `/events/admin/nuevo`: crear (o simular) un evento. */
export async function handleNewEventForm(request: Request, cookie: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action') || 'create';
  const body = formToEventBody(values);
  if (action === 'simulate') body.dry_run = true;
  const result = await adminFetch<{ event?: { slug?: string } }>(cookie, 'admin/events', { method: 'POST', body });
  if (result.ok && action !== 'simulate') {
    return { redirect: doneHref(result.data?.event?.slug || String(body.slug), 'creado', result.warnings) };
  }
  return { action, result, values };
}

/** `/events/admin/{slug}`: guardar, simular, clonar, archivar, desarchivar, cambiar de estado (con previsualización) o forzar el sweep. */
export async function handleEventForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action') || 'save';

  if (action === 'clone') {
    const to = str(values, 'clone_slug');
    const result = await adminFetch<{ event?: { slug?: string } }>(cookie, `admin/events/${slug}/clone`, { method: 'POST', body: { slug: to } });
    if (result.ok) return { redirect: doneHref(result.data?.event?.slug || to, 'clonado', result.warnings) };
    return { action, result, values };
  }
  if (action === 'archive' || action === 'unarchive') {
    const body = action === 'archive' ? { force: on(values, 'force') } : {};
    const result = await adminFetch<{ archived?: boolean }>(cookie, `${slug}/admin/${action}`, { method: 'POST', body });
    // El backend responde ok aunque no archive (aviso archive_active sin force): lo que manda es `archived`.
    if (result.ok && result.data?.archived === (action === 'archive')) {
      return { redirect: doneHref(slug, action === 'archive' ? 'archivado' : 'desarchivado', result.warnings) };
    }
    return { action, result, values };
  }
  if (action === 'state_preview' || action === 'state') {
    // Control de estado (SPEC v3 §4.2): primero se previsualizan los avisos
    // con dry_run y solo después se confirma la transición.
    const body = { status: str(values, 'status'), dry_run: action === 'state_preview' };
    const result = await adminFetch<{ status?: string }>(cookie, `${slug}/admin/state`, { method: 'POST', body });
    if (result.ok && action === 'state') return { redirect: doneHref(slug, 'estado', result.warnings) };
    return { action, result, values };
  }
  if (action === 'sweep') {
    // Solo redirige si el sweep ha movido el estado; si no, se enseña el
    // resultado (automation_off o nada que hacer) sin salir de la página.
    const result = await adminFetch<{ transitions?: string[] }>(cookie, `${slug}/admin/sweep`, { method: 'POST', body: {} });
    if (result.ok && (result.data?.transitions?.length ?? 0) > 0) return { redirect: doneHref(slug, 'sweep', result.warnings) };
    return { action, result, values };
  }

  const body = formToEventBody(values);
  if (action === 'simulate') body.dry_run = true;
  const result = await adminFetch<{ event?: { slug?: string } }>(cookie, `${slug}/admin`, { method: 'PUT', body });
  if (result.ok && action !== 'simulate') {
    return { redirect: doneHref(result.data?.event?.slug || slug, 'guardado', result.warnings) };
  }
  return { action, result, values };
}
