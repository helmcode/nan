import { adminFetch } from './eventsAdmin';
import { doneHref, formValues, on, readForm, str, type FormOutcome } from './eventsAdminForms';

/**
 * Pantalla de participantes del panel (SPEC v3 §6.2 y §8, W-05): tabla con
 * filtros, alta manual, edición, baja, reincorporación, promoción, paso a
 * reserva, importación CSV (con previsualización) y exportación. Igual que
 * el resto del panel: formularios sin JavaScript que procesa el fichero de
 * ruta y acaban en redirección o en la misma página con la respuesta.
 */

/** Fila de `GET /{slug}/admin/participants` (participante completo más equipo y entrega). */
export interface AdminParticipantRow {
  id: string;
  position: number;
  member_uuid: string;
  name: string;
  email: string;
  discord_user: string;
  specialty: string | null;
  level: string | null;
  status: string;
  is_reserve: boolean;
  team_id: string | null;
  team_name: string | null;
  submission_id: string | null;
  source: string;
  added_by: { actor: string; email?: string } | null;
  notes: string;
  withdrawn_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  registered: 'Inscrito',
  reserve: 'Reserva',
  promoted: 'Promovido',
  withdrawn: 'Baja',
};

export const PARTICIPANT_SOURCE_LABELS: Record<string, string> = {
  register: 'inscripción',
  submission: 'entrega',
  import: 'importación',
  admin: 'alta manual',
};

/** Informe de `POST …/participants/import` (SPEC v3 §6.2, B-12). */
export interface ImportReport {
  rows: { line: number; email: string; action: string; error?: string | null; participant_id?: string | null; warnings?: string[] }[];
  created: number;
  updated: number;
  restored: number;
  unchanged: number;
  rejected: number;
}

export const IMPORT_ACTION_LABELS: Record<string, string> = {
  created: 'creada',
  updated: 'actualizada',
  restored: 'reincorporada',
  unchanged: 'sin cambios',
  rejected: 'rechazada',
};

/** Filtros de la tabla leídos de la URL (`?estado=&equipo=&reserva=&q=`). */
export interface ParticipantFilters {
  status: string;
  team: string;
  reserve: string;
  q: string;
}

export function readParticipantFilters(url: URL): ParticipantFilters {
  const p = url.searchParams;
  const status = p.get('estado') ?? '';
  const reserve = p.get('reserva') ?? '';
  return {
    status: status in PARTICIPANT_STATUS_LABELS ? status : '',
    team: (p.get('equipo') ?? '').trim().slice(0, 64),
    reserve: reserve === 'si' ? 'si' : reserve === 'no' ? 'no' : '',
    q: (p.get('q') ?? '').trim().slice(0, 100),
  };
}

/** Filtros → query string de `GET …/admin/participants` (`?status=&team=&reserve=&q=`). */
export function participantsSearch(f: ParticipantFilters): string {
  const q = new URLSearchParams();
  if (f.status) q.set('status', f.status);
  if (f.team) q.set('team', f.team);
  if (f.reserve) q.set('reserve', f.reserve === 'si' ? 'true' : 'false');
  if (f.q) q.set('q', f.q);
  const s = q.toString();
  return s ? `?${s}` : '';
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `/events/admin/{slug}/participantes`: procesa el POST según `action`
 * (`add`, `update`, `withdraw`, `reinstate`, `promote`, `demote`,
 * `import_preview`, `import`). Las acciones que escriben redirigen a la
 * pantalla con `?ok=`; la previsualización de la importación y los errores
 * vuelven a pintar la página con la respuesta.
 */
export async function handleParticipantsForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action');
  const back = (ok: string, warnings: string[]) => doneHref(slug, ok, warnings, 'participantes');

  if (action === 'add') {
    const body = {
      email: str(values, 'email'),
      name: str(values, 'name'),
      discord_user: str(values, 'discord_user'),
      specialty: str(values, 'specialty'),
      level: str(values, 'level'),
      reserve: on(values, 'reserve'),
      notes: str(values, 'notes'),
    };
    const result = await adminFetch(cookie, `${slug}/admin/participants`, { method: 'POST', body });
    if (result.ok) return { redirect: back('alta', result.warnings) };
    return { action, result, values };
  }

  if (action === 'import_preview' || action === 'import') {
    const file = fd.get('csv');
    const csv = file instanceof File ? await file.text() : typeof file === 'string' ? file : '';
    if (!csv.trim()) {
      return { action, values, result: { ok: false, status: 400, data: null, error: 'csv_invalid', message: 'Falta el fichero CSV.', warnings: [], dryRun: false, fields: ['csv'] } };
    }
    const result = await adminFetch<ImportReport>(cookie, `${slug}/admin/participants/import`, {
      method: 'POST',
      body: csv,
      search: action === 'import_preview' ? '?dry_run=true' : '',
    });
    // La importación real también se queda en la página: el informe fila a fila es lo útil.
    return { action, result, values };
  }

  const id = str(values, 'id');
  if (!SAFE_ID.test(id)) {
    return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message: 'Falta el participante.', warnings: [], dryRun: false, fields: ['id'] } };
  }

  if (action === 'update') {
    const body = {
      name: str(values, 'name'),
      discord_user: str(values, 'discord_user'),
      specialty: str(values, 'specialty'),
      level: str(values, 'level'),
      notes: str(values, 'notes'),
    };
    const result = await adminFetch(cookie, `${slug}/admin/participants/${id}`, { method: 'PUT', body });
    if (result.ok) return { redirect: back('editado', result.warnings) };
    return { action, result, values };
  }

  const STATUS_ACTIONS: Record<string, string> = { withdraw: 'baja', reinstate: 'reincorporado', promote: 'promovido', demote: 'reserva' };
  if (action in STATUS_ACTIONS) {
    const body = action === 'reinstate' ? { reserve: on(values, 'reserve'), restore_submission: on(values, 'restore_submission') } : {};
    const result = await adminFetch(cookie, `${slug}/admin/participants/${id}/${action}`, { method: 'POST', body });
    if (result.ok) return { redirect: back(STATUS_ACTIONS[action], result.warnings) };
    return { action, result, values };
  }

  return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message: 'Acción desconocida.', warnings: [], dryRun: false, fields: ['action'] } };
}
