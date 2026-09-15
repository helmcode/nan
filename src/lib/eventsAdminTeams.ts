import { adminFetch } from './eventsAdmin';
import { badForm, beginForm, on, SAFE_ID, str, type FormOutcome } from './eventsAdminForms';

/**
 * Pantalla de equipos del panel (SPEC v3 §6.3 y §8, W-06): tablero con una
 * columna por equipo y otra de inscritos sin equipo; mover entre columnas,
 * crear, renombrar, disolver y generar (con previsualización). Sin
 * JavaScript: cada movimiento es un formulario POST que procesa el fichero de
 * ruta y acaba en redirección con `?ok=`, o en la misma página con el error.
 */

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  discord_user: string;
  specialty: string | null;
  level: string | null;
  status: string;
}

/** Fila de `GET /{slug}/admin/teams` (equipo más `locked`, entrega, miembros y avisos). */
export interface AdminTeamRow {
  id: string;
  name: string;
  origin: string;
  member_ids: string[];
  size: number;
  balance_score: { avg_level: number; specialties: Record<string, number> | null };
  created_at: string;
  updated_at: string;
  locked: boolean;
  submission_id: string | null;
  members: TeamMemberRow[];
  warnings: string[];
}

/** Respuesta de `POST …/teams/generate` (B-16). */
export interface GenerateReport {
  teams: number;
  kept: number;
  created: number;
  warnings: string[];
}

export const TEAM_ORIGIN_LABELS: Record<string, string> = {
  auto: 'automático',
  manual: 'manual',
};

/** Valor del destino "sin equipo" en el selector de mover. */
export const NO_TEAM = 'none';

/**
 * `/events/admin/{slug}/equipos`: procesa el POST según `action`
 * (`create`, `rename`, `delete`, `move`, `generate_preview`, `generate`).
 * `move` lleva `participant_id` y `to` (id de equipo o `none` para sacarlo
 * del suyo, que en ese caso también exige `from`).
 */
export async function handleTeamsForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const f = await beginForm(request, { slug, screen: 'equipos' });
  if (f.done) return f.done;
  const { fd, values, action, back } = f;

  if (action === 'create') {
    const memberIds = fd.getAll('member_ids').map((m) => String(m).trim()).filter((m) => SAFE_ID.test(m));
    const result = await adminFetch(cookie, `${slug}/admin/teams`, { method: 'POST', body: { name: str(values, 'name'), member_ids: memberIds } });
    if (result.ok) return { redirect: back('equipo_creado', result.warnings) };
    return { action, result, values };
  }

  if (action === 'generate_preview' || action === 'generate') {
    const body = { keep_manual: on(values, 'keep_manual'), dry_run: action === 'generate_preview' };
    const result = await adminFetch<GenerateReport>(cookie, `${slug}/admin/teams/generate`, { method: 'POST', body });
    if (result.ok && action === 'generate') return { redirect: back('generado', result.warnings) };
    return { action, result, values };
  }

  if (action === 'move') {
    const pid = str(values, 'participant_id');
    const to = str(values, 'to');
    if (!SAFE_ID.test(pid)) return badForm(action, values, ['participant_id'], 'Falta el participante.');
    if (to === NO_TEAM) {
      const from = str(values, 'from');
      if (!SAFE_ID.test(from)) return badForm(action, values, ['from'], 'Falta el equipo de origen.');
      const result = await adminFetch(cookie, `${slug}/admin/teams/${from}/members/${pid}`, { method: 'DELETE' });
      if (result.ok) return { redirect: back('quitado', result.warnings) };
      return { action, result, values };
    }
    if (!SAFE_ID.test(to)) return badForm(action, values, ['to'], 'Falta el equipo de destino.');
    const result = await adminFetch(cookie, `${slug}/admin/teams/${to}/members`, { method: 'POST', body: { participant_id: pid } });
    if (result.ok) return { redirect: back('movido', result.warnings) };
    return { action, result, values };
  }

  const id = str(values, 'id');
  if (!SAFE_ID.test(id)) return badForm(action, values, ['id'], 'Falta el equipo.');

  if (action === 'rename') {
    const result = await adminFetch(cookie, `${slug}/admin/teams/${id}`, { method: 'PUT', body: { name: str(values, 'name') } });
    if (result.ok) return { redirect: back('renombrado', result.warnings) };
    return { action, result, values };
  }

  if (action === 'delete') {
    const result = await adminFetch(cookie, `${slug}/admin/teams/${id}`, { method: 'DELETE' });
    if (result.ok) return { redirect: back('disuelto', result.warnings) };
    return { action, result, values };
  }

  return badForm(action, values, ['action'], 'Acción desconocida.');
}
