/**
 * Forma de las fechas del #2 Hackathon: Fact Check (13–15 nov 2026) en
 * `data/eventos.json`. La página las lee de ahí, nunca de un literal.
 */

export type FactcheckDates = {
  /** Primer día del fin de semana, ISO `YYYY-MM-DD`. */
  start: string;
  /** Último día, ISO e inclusivo. */
  end: string;
  /** Instante del arranque, ISO con zona (Europe/Madrid). */
  kickoff: string;
  /** Instante del cierre de entregas, ISO con zona. */
  deadline: string;
  /**
   * Slug del evento en el sistema de eventos (`/events/{slug}`). Mientras sea
   * `null` el evento no existe en la API y la inscripción se explica en
   * /community: nada de enlazar a una página que respondería 404.
   */
  eventSlug: string | null;
};
