/**
 * En qué momento del Gauntlet Challenge estamos.
 *
 * Vive aquí y no en la página por lo mismo que `agenda.ts`: es aritmética de
 * fechas, se equivoca en silencio (un día de más y el CTA de inscripción
 * desaparece mientras el formulario sigue abierto) y con el reloj como
 * parámetro se prueba sin depender de cuándo se ejecute el test.
 *
 * Las fechas NO se cablean aquí: vienen de `data/eventos.json`, porque el fin
 * de la votación todavía no está cerrado ("unos días" desde el 28) y tiene que
 * poder cambiarse sin tocar código.
 *
 * Importante: la fase solo cambia texto y enlaces. No habilita ni deshabilita
 * nada, porque no hay nada que habilitar — la inscripción es un Google Form
 * externo. Es deliberado: el reloj del Worker es UTC y cerca de medianoche en
 * Canarias o LATAM va un día adelantado, así que un cálculo de fase nunca puede
 * ser lo que deje a alguien fuera.
 */

import { parseISO, fmtISO } from './agenda';

export type GauntletDates = {
  /** Workshop de kickoff. */
  workshop: string;
  /** Primer día para construir. */
  start: string;
  /** Último día para inscribirse y entregar, inclusivo. */
  close: string;
  /** Último día de votación, inclusivo. Provisional hasta que se cierre. */
  votingEnd: string;
};

export type GauntletPhase = 'pre' | 'live' | 'voting' | 'closed';

export type GauntletState = {
  phase: GauntletPhase;
  /**
   * Días que faltan para el hito de la fase: para el arranque en `pre`, para
   * el cierre en `live`. En `voting` y `closed` no hay cuenta atrás (la
   * votación no tiene final anunciado), así que es 0.
   */
  days: number;
};

const DAY = 86_400_000;

/** Días completos entre dos ISO, positivo si `to` es posterior. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / DAY);

export function gauntletState(dates: GauntletDates, today: Date): GauntletState {
  const iso = fmtISO(today);

  if (iso < dates.start) return { phase: 'pre', days: daysBetween(iso, dates.start) };
  // El día del cierre sigue siendo `live`: se entrega hasta el final del día.
  if (iso <= dates.close) return { phase: 'live', days: daysBetween(iso, dates.close) };
  if (iso <= dates.votingEnd) return { phase: 'voting', days: 0 };
  return { phase: 'closed', days: 0 };
}

/** Qué pasa cada día del mes en la rejilla del calendario. */
export type DayKind = 'idle' | 'workshop' | 'build' | 'close' | 'voting';

export type CalendarCell = { day: number; iso: string; kind: DayKind };

export type CalendarMonth = {
  /** Huecos vacíos antes del día 1, con la semana empezando en lunes. */
  lead: number;
  cells: CalendarCell[];
};

/** ISO de un día concreto sin pasar por Date, que ya trae bastantes zonas. */
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * La rejilla del mes en el que se construye, marcada con lo que pasa cada día.
 *
 * El mes sale de `dates.start`, no de un literal: si la edición se mueve a
 * septiembre, el calendario se mueve con ella. Los días fuera de las ventanas
 * (antes del workshop, después de la votación) quedan en `idle` — se pintan,
 * pero apagados, para que el mes se lea entero y no solo el trozo activo.
 */
export function calendarMonth(dates: GauntletDates): CalendarMonth {
  const [year, month] = dates.start.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  // getDay() cuenta desde el domingo; aquí la semana empieza en lunes.
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const cells = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const iso = isoOf(year, month, day);
    const kind: DayKind =
      iso === dates.workshop
        ? 'workshop'
        : iso === dates.close
          ? 'close'
          : iso >= dates.start && iso < dates.close
            ? 'build'
            : iso > dates.close && iso <= dates.votingEnd
              ? 'voting'
              : 'idle';
    return { day, iso, kind };
  });

  return { lead, cells };
}

/**
 * El texto de estado del hero. Hoy y mañana tienen frase propia porque
 * "empieza en 0 días" no lo dice nadie.
 */
export function statusText(
  state: GauntletState,
  strings: {
    pre: string;
    preOne: string;
    preZero: string;
    live: string;
    liveOne: string;
    liveZero: string;
    voting: string;
    closed: string;
  },
): string {
  switch (state.phase) {
    case 'pre':
      if (state.days === 0) return strings.preZero;
      if (state.days === 1) return strings.preOne;
      return strings.pre.replace('{n}', String(state.days));
    case 'live':
      if (state.days === 0) return strings.liveZero;
      if (state.days === 1) return strings.liveOne;
      return strings.live.replace('{n}', String(state.days));
    case 'voting':
      return strings.voting;
    default:
      return strings.closed;
  }
}
