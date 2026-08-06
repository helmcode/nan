/**
 * El calendario de "este mes en NaN": los próximos N días y lo que cae dentro.
 *
 * Vive aquí y no en la página porque una entrada puede durar varios días (un
 * reto de un mes, una semana de hackathon) y esa aritmética se puede equivocar
 * de formas silenciosas: pintar solo el primer día, o dejar de listar algo que
 * sigue vivo porque empezó antes de hoy. Con el reloj como parámetro se prueba
 * sin depender de cuándo se ejecute el test.
 */

import type { Locale } from './i18n';

/** Los textos de eventos.json vienen en un idioma (nombres propios) o como par. */
export type Localized = string | { en: string; es: string };

export type AgendaItem = {
  /** Primer día, ISO `YYYY-MM-DD`. */
  date: string;
  /** Último día, ISO e inclusivo. Sin él, la entrada es de un solo día. */
  until?: string;
  type: string;
  title: Localized;
  by?: string;
};

export const loc = (v: Localized, lang: Locale): string => (typeof v === 'string' ? v : v[lang]);

/** Último día de la entrada: `until` si lo trae, y si no el propio `date`. */
export const endOf = (a: AgendaItem): string => a.until ?? a.date;

export const fmtISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const shiftDays = (from: Date, n: number): Date =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);

export type CalendarDay = {
  iso: string;
  /** Día del mes, para pintar. */
  day: number;
  /** Índice lunes-primero, para indexar las etiquetas del diccionario. */
  weekday: number;
  isToday: boolean;
  hasEvent: boolean;
};

/** La tira de días a partir de hoy, marcando los que caen dentro de alguna entrada. */
export function calendarDays(agenda: AgendaItem[], today: Date, days = 30): CalendarDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = shiftDays(today, i);
    const iso = fmtISO(d);
    return {
      iso,
      day: d.getDate(),
      weekday: (d.getDay() + 6) % 7,
      isToday: i === 0,
      hasEvent: agenda.some((a) => iso >= a.date && iso <= endOf(a)),
    };
  });
}

/**
 * Lo que se solapa con la ventana, ordenado por fecha de inicio. Por solape y no
 * por fecha de inicio: algo que arrancó antes de hoy y sigue en marcha cuenta.
 */
export function upcomingIn(agenda: AgendaItem[], today: Date, days = 30): AgendaItem[] {
  const start = fmtISO(today);
  const end = fmtISO(shiftDays(today, days - 1));
  return agenda
    .filter((a) => endOf(a) >= start && a.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Fecha para la fila de agenda. `formatRange` colapsa lo repetido ("8-31 ago",
 * "Aug 8 - 31"), así que un rango cabe en la columna sin partirse en dos líneas.
 */
export function spanLabel(a: AgendaItem, lang: Locale): string {
  const fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
  const end = endOf(a);
  return end === a.date
    ? fmt.format(parseISO(a.date))
    : fmt.formatRange(parseISO(a.date), parseISO(end));
}
