import { adminFetch } from './eventsAdmin';
import { doneHref, formValues, readForm, str, type FormOutcome } from './eventsAdminForms';

/**
 * Pantalla de entregas del panel (SPEC v3 §6.4 y §8, W-07): listado con
 * propietario, URLs, checks y premio; edición de campos, retirada y
 * restauración, forzar o reiniciar un check, fijar o reiniciar la
 * elegibilidad de premio y "verificar todas". Sin JavaScript: cada acción es
 * un formulario POST que procesa el fichero de ruta y acaba en redirección
 * con `?ok=`, o en la misma página con el error del backend.
 */

/** Un check de la entrega (`checks[name]`). */
export interface SubmissionCheck {
  pass: boolean;
  checked_at: string | null;
  http_status?: number;
  host?: string;
  forced?: boolean;
  reason?: string;
}

/** Fila de `GET /{slug}/admin/submissions` (entrega más `owner` y `owner_emails`). */
export interface AdminSubmissionRow {
  id: string;
  participant_id: string | null;
  team_id: string | null;
  title: string;
  description: string;
  public_url: string;
  space_url: string;
  repo_url: string;
  image_url: string;
  video_url: string;
  submitted_by: string;
  submitted_at: string;
  updated_at: string;
  withdrawn_at: string | null;
  checks: Record<string, SubmissionCheck> | null;
  auto_points: number;
  not_prize_eligible: boolean;
  /** Solo si el admin la ha fijado a mano (§6.4); sin ella manda `prize_requires`. */
  prize_eligible?: boolean;
  prize_reason?: string;
  owner: { type: string; id: string; name: string };
  owner_emails: string[];
}

export const CHECK_LABELS: Record<string, string> = {
  url_live: 'URL viva',
  in_nan_space: 'en un space de NaN',
  repo_public: 'repositorio público',
};

/** Campos editables de una entrega, en el orden del formulario. */
export const SUBMISSION_EDIT_FIELDS = [
  { key: 'title', label: 'Título', kind: 'text' },
  { key: 'public_url', label: 'URL pública', kind: 'url' },
  { key: 'description', label: 'Descripción', kind: 'textarea' },
  { key: 'repo_url', label: 'URL del repositorio', kind: 'url' },
  { key: 'space_url', label: 'URL del space', kind: 'url' },
  { key: 'image_url', label: 'URL de imagen', kind: 'url' },
  { key: 'video_url', label: 'URL de vídeo', kind: 'url' },
] as const;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CHECK = /^[a-z_]{1,32}$/;

function bad(action: string, values: FormOutcome['values'], field: string, message: string): FormOutcome {
  return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message, warnings: [], dryRun: false, fields: [field] } };
}

/**
 * `/events/admin/{slug}/entregas`: procesa el POST según `action`
 * (`update`, `withdraw`, `restore`, `check`, `prize`, `verify`). Todas menos
 * `verify` llevan `id`. `check` lleva `name` y `pass` (`true`/`false`) o
 * `reset=on`; `prize` lleva `eligible` (`true`/`false`) o `reset=on`; ambas
 * admiten `reason`.
 */
export async function handleSubmissionsForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action');
  const back = (ok: string, warnings: string[]) => doneHref(slug, ok, warnings, 'entregas');

  if (action === 'verify') {
    const result = await adminFetch<{ verified?: number }>(cookie, `${slug}/admin/verify`, { method: 'POST', body: {} });
    if (result.ok) return { redirect: back('verificado', result.warnings) };
    return { action, result, values };
  }

  const id = str(values, 'id');
  if (!SAFE_ID.test(id)) return bad(action, values, 'id', 'Falta la entrega.');
  const base = `${slug}/admin/submissions/${id}`;

  if (action === 'update') {
    // Parcial: se mandan solo los campos presentes en el formulario (§6.4, B-18).
    const body: Record<string, string> = {};
    for (const f of SUBMISSION_EDIT_FIELDS) if (fd.has(f.key)) body[f.key] = str(values, f.key);
    const result = await adminFetch(cookie, base, { method: 'PUT', body });
    if (result.ok) return { redirect: back('entrega_editada', result.warnings) };
    return { action, result, values };
  }

  if (action === 'withdraw' || action === 'restore') {
    const result = await adminFetch(cookie, `${base}/${action}`, { method: 'POST', body: {} });
    if (result.ok) return { redirect: back(action === 'withdraw' ? 'entrega_retirada' : 'entrega_restaurada', result.warnings) };
    return { action, result, values };
  }

  if (action === 'check') {
    const name = str(values, 'name');
    if (!SAFE_CHECK.test(name)) return bad(action, values, 'name', 'Falta el check.');
    const reset = str(values, 'reset') !== '';
    const pass = str(values, 'pass');
    if (!reset && pass !== 'true' && pass !== 'false') return bad(action, values, 'pass', 'Indica si el check pasa o no.');
    const body = reset ? { reset: true } : { pass: pass === 'true', reason: str(values, 'reason') };
    const result = await adminFetch(cookie, `${base}/checks/${name}`, { method: 'PUT', body });
    if (result.ok) return { redirect: back(reset ? 'check_reiniciado' : 'check_forzado', result.warnings) };
    return { action, result, values };
  }

  if (action === 'prize') {
    const reset = str(values, 'reset') !== '';
    const eligible = str(values, 'eligible');
    if (!reset && eligible !== 'true' && eligible !== 'false') return bad(action, values, 'eligible', 'Indica si opta al premio o no.');
    const body = reset ? { reset: true } : { eligible: eligible === 'true', reason: str(values, 'reason') };
    const result = await adminFetch(cookie, `${base}/prize-eligibility`, { method: 'PUT', body });
    if (result.ok) return { redirect: back(reset ? 'premio_automatico' : 'premio', result.warnings) };
    return { action, result, values };
  }

  return bad(action, values, 'action', 'Acción desconocida.');
}
