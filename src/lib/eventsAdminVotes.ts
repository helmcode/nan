import type { LeaderboardRow, LeaderboardView, Owner } from './events';
import { adminFetch } from './eventsAdmin';
import { doneHref, formValues, readForm, str, type FormOutcome } from './eventsAdminForms';

/**
 * Pantalla de votos y ranking del panel (SPEC v3 §6.5, B-23 y §8, W-08).
 * Los votos son solo lectura (decisión 23: no se anulan ni se editan). Lo
 * único que se escribe son los atajos de §4.4: abrir la votación y cerrarla
 * (que congela y publica el ranking), ambos con previsualización `dry_run`.
 */

/** Fila de `GET /{slug}/admin/votes` (B-20). */
export interface AdminVoteRow {
  id: string;
  voter_email: string;
  voter_member_uuid: string;
  submission_id: string;
  /** Vacío si la entrega ya no existe. */
  submission_title: string;
  /** La entrega votada está retirada: el voto no cuenta en el ranking. */
  withdrawn: boolean;
  owner: Owner | null;
  created_at: string;
}

/** `GET /{slug}/admin/leaderboard` (B-23) tiene el mismo formato que el público: se re-exporta de `events.ts`. */
export type { LeaderboardRow, LeaderboardView };

/** Resumen de los votos: cuántos cuentan y cuántos no (entrega retirada o desaparecida). */
export function voteStats(votes: AdminVoteRow[]): { total: number; counted: number; discarded: number; voters: number } {
  const counted = votes.filter((v) => v.owner && !v.withdrawn).length;
  return { total: votes.length, counted, discarded: votes.length - counted, voters: new Set(votes.map((v) => v.voter_member_uuid || v.voter_email)).size };
}

/**
 * `/events/admin/{slug}/votos`: procesa el POST según `action`
 * (`open_preview`, `open`, `close_preview`, `close`). Las previsualizaciones
 * van con `?dry_run=true` y se quedan en la página; las reales redirigen.
 */
export async function handleVotesForm(request: Request, cookie: string, slug: string): Promise<FormOutcome> {
  const { fd, forbidden } = await readForm(request);
  if (forbidden) return { forbidden: true };
  if (!fd) return {};
  const values = formValues(fd);
  const action = str(values, 'action');
  const m = /^(open|close)(_preview)?$/.exec(action);
  if (!m) {
    return { action, values, result: { ok: false, status: 400, data: null, error: 'validation_failed', message: 'Acción desconocida.', warnings: [], dryRun: false, fields: ['action'] } };
  }
  const [, verb, preview] = m;
  const result = await adminFetch(cookie, `${slug}/admin/voting/${verb}`, { method: 'POST', search: preview ? '?dry_run=true' : '' });
  if (result.ok && !preview) return { redirect: doneHref(slug, verb === 'open' ? 'votacion_abierta' : 'votacion_cerrada', result.warnings, 'votos') };
  return { action, result, values };
}
