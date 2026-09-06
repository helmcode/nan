import { adminFetch } from './eventsAdmin';
import { doneHref, formValues, readForm, str, type FormOutcome } from './eventsAdminForms';

/**
 * Pantalla de auditoría y backups del panel (SPEC v3 §6.6, §6.7 y §8, W-09).
 * La auditoría es solo lectura (`GET …/admin/audit` con filtros); lo único
 * que se escribe es restaurar un backup (`POST …/admin/backups/restore`),
 * con previsualización `dry_run` y confirmación.
 */

/** Quién hizo la acción: staff con sesión o clave de admin (scripts, curl). */
export interface AuditActor {
  kind: string;
  user_uuid?: string;
  email?: string;
  label?: string;
}

/** Línea de `audit.jsonl` tal como la devuelve `GET …/admin/audit` (B-03). */
export interface AuditEntry {
  ts: string;
  actor: AuditActor | null;
  action: string;
  target?: string;
  before: unknown;
  after: unknown;
  warnings: string[];
}

/** Fila de `GET …/admin/backups`: `timestamp` es el sufijo del fichero (`20260905T100000Z[-n]`). */
export interface BackupInfo {
  file: string;
  timestamp: string;
  size: number;
}

/** Respuesta de restaurar: `previous_backup` solo en la restauración real. */
export interface RestoreResult {
  file: string;
  timestamp: string;
  previous_backup?: string;
}

/** Filtros de la lista de auditoría, tal como los acepta el backend. */
export interface AuditFilters {
  since: string;
  action: string;
  limit: number;
}

/** Límite por defecto del backend (DefaultAuditLimit); el máximo es 1000. */
export const AUDIT_DEFAULT_LIMIT = 100;
export const AUDIT_MAX_LIMIT = 1000;

/** Grupos de acciones para el desplegable de filtro (prefijo con punto final = "todas las de ese grupo"). */
export const AUDIT_ACTION_GROUPS: { key: string; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'event.', label: 'Evento (crear, editar, clonar, archivar)' },
  { key: 'state.', label: 'Cambios de estado' },
  { key: 'modules.', label: 'Módulos' },
  { key: 'participant.', label: 'Participantes' },
  { key: 'participants.', label: 'Importaciones' },
  { key: 'team.', label: 'Equipos' },
  { key: 'teams.', label: 'Generación de equipos' },
  { key: 'submission.', label: 'Entregas' },
  { key: 'voting.', label: 'Votación' },
  { key: 'backup.', label: 'Backups' },
];

/**
 * Lee `?desde=`, `?accion=` y `?limite=` de la URL de la pantalla. Lo que no
 * vale se ignora (sin filtro) para no provocar un 400 del backend; el límite
 * se acota a [1, 1000].
 */
export function readAuditFilters(url: URL): AuditFilters {
  const rawSince = url.searchParams.get('desde') ?? '';
  const since = isoDate(rawSince);
  const action = (url.searchParams.get('accion') ?? '').trim();
  const rawLimit = Number.parseInt(url.searchParams.get('limite') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, AUDIT_MAX_LIMIT) : AUDIT_DEFAULT_LIMIT;
  return { since, action: /^[a-z_.]*$/.test(action) ? action : '', limit };
}

/** Convierte un `datetime-local` o una fecha `AAAA-MM-DD` (UTC) en RFC 3339; vacío si no es una fecha. */
function isoDate(v: string): string {
  const s = v.trim();
  if (!s) return '';
  // Un datetime-local o una fecha suelta se interpretan en UTC, como el resto de fechas del panel.
  const withZone = /[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : `${s}${/T/.test(s) ? '' : 'T00:00'}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Query string para `GET …/admin/audit` a partir de los filtros. */
export function auditSearch(f: AuditFilters): string {
  const q = new URLSearchParams();
  if (f.since) q.set('since', f.since);
  if (f.action) q.set('action', f.action);
  q.set('limit', String(f.limit));
  return `?${q.toString()}`;
}

/** Texto corto del actor: email del staff, etiqueta del script o "clave de admin". */
export function actorLabel(a: AuditActor | null | undefined): string {
  if (!a) return 'sistema';
  if (a.kind === 'staff') return a.email || a.user_uuid || 'staff';
  return a.label ? `${a.label} (clave de admin)` : 'clave de admin';
}

/** Bytes en formato legible (KB con un decimal a partir de 1024). */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fecha ISO a partir del sufijo de backup `20260905T100000Z[-n]`; vacío si no encaja. */
export function backupDate(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(timestamp);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

/**
 * `/events/admin/{slug}/auditoria`: procesa el POST según `action`
 * (`restore_preview`, `restore`) con `file` y `timestamp` del backup. La
 * previsualización (`dry_run`) solo comprueba que el backup validaría y se
 * queda en la página; la restauración real redirige con el flash.
 */
export async function handleAuditForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action');
  const m = /^restore(_preview)?$/.exec(action);
  if (!m) {
    return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message: 'Acción desconocida.', warnings: [], dryRun: false, fields: ['action'] } };
  }
  const preview = Boolean(m[1]);
  const file = str(values, 'file');
  const timestamp = str(values, 'timestamp');
  if (!file || !timestamp) {
    return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message: 'Falta el backup a restaurar.', warnings: [], dryRun: false, fields: [!file ? 'file' : 'timestamp'] } };
  }
  const result = await adminFetch<RestoreResult>(cookie, `${slug}/admin/backups/restore`, {
    method: 'POST',
    body: { file, timestamp, dry_run: preview },
  });
  if (result.ok && !preview) return { redirect: doneHref(slug, 'restaurado', result.warnings, 'auditoria') };
  return { action, result, values };
}
