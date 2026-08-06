import { describe, expect, test } from 'vitest';
import { calendarDays, endOf, loc, spanLabel, upcomingIn, type AgendaItem } from './agenda';

/**
 * El calendario de eventos con entradas de varios días.
 *
 * Antes solo entendía eventos de un día (`a.date === iso`), así que un reto de
 * tres semanas pintaba un único día en la tira y desaparecía del listado en
 * cuanto pasaba su fecha de inicio. Estos tests fijan las dos cosas que se
 * pueden romper en silencio: qué días se marcan y qué entradas se listan.
 */

const workshop: AgendaItem = {
  date: '2026-08-07',
  type: 'workshop',
  title: { en: 'Gauntlet Loop', es: 'Gauntlet Loop' },
  by: '@sahul_125',
};
const reto: AgendaItem = {
  date: '2026-08-08',
  until: '2026-08-31',
  type: 'event',
  title: 'Gauntlet Challenge',
};
/** 6 de agosto de 2026, jueves. */
const hoy = new Date(2026, 7, 6);

describe('endOf', () => {
  test('sin until, la entrada acaba el día que empieza', () => {
    expect(endOf(workshop)).toBe('2026-08-07');
  });

  test('con until, acaba ahí', () => {
    expect(endOf(reto)).toBe('2026-08-31');
  });
});

describe('calendarDays', () => {
  const days = calendarDays([workshop, reto], hoy);

  test('son 30 días a partir de hoy', () => {
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ iso: '2026-08-06', day: 6, isToday: true });
    expect(days[29].iso).toBe('2026-09-04');
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  test('el día de la semana va con lunes primero', () => {
    // 6 de agosto de 2026 es jueves: índice 3 con lunes en 0.
    expect(days[0].weekday).toBe(3);
    expect(days[2].weekday).toBe(5); // sábado 8
  });

  test('marca todos los días del rango, no solo el primero', () => {
    const marcados = days.filter((d) => d.hasEvent).map((d) => d.iso);
    expect(marcados[0]).toBe('2026-08-07'); // el workshop
    expect(marcados).toContain('2026-08-08'); // arranque del reto
    expect(marcados).toContain('2026-08-20'); // en medio
    expect(marcados).toContain('2026-08-31'); // último día, inclusivo
    expect(marcados).toHaveLength(25); // del 7 al 31
  });

  test('no marca hoy ni lo que viene después del rango', () => {
    expect(days[0].hasEvent).toBe(false);
    expect(days.find((d) => d.iso === '2026-09-01')?.hasEvent).toBe(false);
  });
});

describe('upcomingIn', () => {
  test('lista lo que cae en la ventana, ordenado por fecha de inicio', () => {
    expect(upcomingIn([reto, workshop], hoy).map((a) => a.date)).toEqual([
      '2026-08-07',
      '2026-08-08',
    ]);
  });

  test('mantiene un rango que empezó antes de hoy pero sigue vivo', () => {
    // A mitad del reto: no empieza dentro de la ventana, pero está en marcha.
    const enMedio = new Date(2026, 7, 20);
    expect(upcomingIn([reto], enMedio).map((a) => a.date)).toEqual(['2026-08-08']);
  });

  test('descarta lo ya terminado', () => {
    const septiembre = new Date(2026, 8, 1);
    expect(upcomingIn([workshop, reto], septiembre)).toEqual([]);
  });

  test('descarta lo que empieza más allá de la ventana', () => {
    const lejano: AgendaItem = { date: '2026-12-01', type: 'event', title: 'Lejano' };
    expect(upcomingIn([lejano], hoy)).toEqual([]);
  });

  test('la ventana incluye su último día', () => {
    const ultimo: AgendaItem = { date: '2026-09-04', type: 'event', title: 'Justo dentro' };
    const fuera: AgendaItem = { date: '2026-09-05', type: 'event', title: 'Justo fuera' };
    expect(upcomingIn([ultimo, fuera], hoy).map((a) => a.title)).toEqual(['Justo dentro']);
  });
});

describe('spanLabel', () => {
  test('un solo día', () => {
    expect(spanLabel(workshop, 'es')).toBe('7 ago');
    expect(spanLabel(workshop, 'en')).toBe('Aug 7');
  });

  test('un rango colapsa lo repetido en vez de repetir el mes', () => {
    const es = spanLabel(reto, 'es');
    const en = spanLabel(reto, 'en');
    expect(es).toContain('8');
    expect(es).toContain('31');
    expect(es).toContain('ago');
    expect(es.match(/ago/g)).toHaveLength(1);
    expect(en.match(/Aug/g)).toHaveLength(1);
    // Corto: la columna de la fila de agenda mide 92px.
    expect(es.length).toBeLessThanOrEqual(12);
    expect(en.length).toBeLessThanOrEqual(12);
  });
});

describe('loc', () => {
  test('resuelve el par y deja pasar el nombre propio', () => {
    expect(loc({ en: 'Observability', es: 'Observabilidad' }, 'es')).toBe('Observabilidad');
    expect(loc({ en: 'Observability', es: 'Observabilidad' }, 'en')).toBe('Observability');
    expect(loc('Workshop: Opencode', 'es')).toBe('Workshop: Opencode');
  });
});
