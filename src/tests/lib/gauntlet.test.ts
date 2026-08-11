import { describe, expect, test } from 'vitest';
import { calendarMonth, daysBetween, gauntletState, statusText, type GauntletDates } from '../../lib/gauntlet';

/**
 * La fase del challenge se calcula con la fecha del servidor, así que los
 * errores que importan son los de los bordes: el día del cierre tiene que
 * seguir siendo "se puede entregar", no "cerrado". Con el reloj como parámetro
 * se puede fijar cada uno de esos días.
 */

const DATES: GauntletDates = {
  workshop: '2026-08-07',
  start: '2026-08-08',
  close: '2026-08-28',
  votingEnd: '2026-08-31',
};

/** Fecha local, que es con la que trabajan fmtISO/parseISO. */
const on = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

describe('gauntletState', () => {
  test('antes del arranque va en pre, con los días que faltan', () => {
    expect(gauntletState(DATES, on('2026-07-20'))).toEqual({ phase: 'pre', days: 19 });
  });

  test('el día del workshop sigue siendo pre: el challenge abre al día siguiente', () => {
    expect(gauntletState(DATES, on('2026-08-07'))).toEqual({ phase: 'pre', days: 1 });
  });

  test('el primer día de construcción ya es live', () => {
    expect(gauntletState(DATES, on('2026-08-08'))).toEqual({ phase: 'live', days: 20 });
  });

  test('el día del cierre TODAVÍA es live: se entrega hasta el final del día', () => {
    // Es el borde que importa. Un `<` en vez de `<=` aquí cerraría la
    // inscripción una jornada antes de lo anunciado.
    expect(gauntletState(DATES, on('2026-08-28'))).toEqual({ phase: 'live', days: 0 });
  });

  test('el día siguiente al cierre abre la votación', () => {
    expect(gauntletState(DATES, on('2026-08-29')).phase).toBe('voting');
  });

  test('el último día de votación sigue en votación', () => {
    expect(gauntletState(DATES, on('2026-08-31')).phase).toBe('voting');
  });

  test('pasada la votación, cerrado', () => {
    expect(gauntletState(DATES, on('2026-09-01')).phase).toBe('closed');
  });

  test('votación y cierre no llevan cuenta atrás', () => {
    // La votación no tiene final anunciado ("unos días"), así que no se puede
    // prometer un contador.
    expect(gauntletState(DATES, on('2026-08-30')).days).toBe(0);
    expect(gauntletState(DATES, on('2026-09-10')).days).toBe(0);
  });

  test('el cambio de mes no descuadra la cuenta', () => {
    expect(daysBetween('2026-07-31', '2026-08-08')).toBe(8);
    expect(daysBetween('2026-08-08', '2026-07-31')).toBe(-8);
  });
});

describe('calendarMonth', () => {
  const month = calendarMonth(DATES);
  const kind = (day: number) => month.cells[day - 1].kind;

  test('pinta el mes entero, no solo la ventana del challenge', () => {
    expect(month.cells).toHaveLength(31);
    expect(month.cells[0]).toEqual({ day: 1, iso: '2026-08-01', kind: 'idle' });
  });

  test('la semana empieza en lunes: el 1 de agosto de 2026 cae en sábado', () => {
    // Con la semana empezando en domingo el lead sería 6 y el mes entero
    // saldría corrido una casilla. Es el fallo típico de una rejilla de mes.
    expect(month.lead).toBe(5);
  });

  test('cada día lleva lo que pasa ese día', () => {
    expect(kind(6)).toBe('idle');
    expect(kind(7)).toBe('workshop');
    expect(kind(8)).toBe('build');
    expect(kind(27)).toBe('build');
    // El 28 es cierre, no construcción: es el hito, y se pinta distinto.
    expect(kind(28)).toBe('close');
    expect(kind(29)).toBe('voting');
    expect(kind(31)).toBe('voting');
  });

  test('el mes sale de las fechas, no de un literal de agosto', () => {
    const sept = calendarMonth({
      workshop: '2026-08-31',
      start: '2026-09-01',
      close: '2026-09-20',
      votingEnd: '2026-09-24',
    });
    expect(sept.cells).toHaveLength(30);
    expect(sept.cells[0].iso).toBe('2026-09-01');
    // El workshop cae fuera del mes que se pinta: ningún día lo reclama.
    expect(sept.cells.some((c) => c.kind === 'workshop')).toBe(false);
  });
});

describe('statusText', () => {
  const strings = {
    pre: 'empieza en {n} días',
    preOne: 'empieza mañana',
    preZero: 'empieza hoy',
    live: 'quedan {n} días',
    liveOne: 'mañana es el último día',
    liveZero: 'último día',
    voting: 'votaciones abiertas',
    closed: 'edición cerrada',
  };

  test('interpola los días cuando faltan varios', () => {
    expect(statusText({ phase: 'pre', days: 19 }, strings)).toBe('empieza en 19 días');
    expect(statusText({ phase: 'live', days: 20 }, strings)).toBe('quedan 20 días');
  });

  test('hoy y mañana tienen frase propia: "en 0 días" no lo dice nadie', () => {
    expect(statusText({ phase: 'pre', days: 0 }, strings)).toBe('empieza hoy');
    expect(statusText({ phase: 'pre', days: 1 }, strings)).toBe('empieza mañana');
    expect(statusText({ phase: 'live', days: 0 }, strings)).toBe('último día');
    expect(statusText({ phase: 'live', days: 1 }, strings)).toBe('mañana es el último día');
  });

  test('votación y cierre son frases fijas', () => {
    expect(statusText({ phase: 'voting', days: 0 }, strings)).toBe('votaciones abiertas');
    expect(statusText({ phase: 'closed', days: 0 }, strings)).toBe('edición cerrada');
  });

  test('no deja plantillas sin sustituir', () => {
    for (const phase of ['pre', 'live'] as const) {
      for (const days of [0, 1, 2, 30]) {
        expect(statusText({ phase, days }, strings)).not.toContain('{n}');
      }
    }
  });
});
