import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import eventos from '../../data/eventos.json';
import { loc, type AgendaItem, type Localized } from '../../lib/agenda';
import { t } from '../../lib/i18n';

/**
 * Los datos de eventos.json que la página de eventos da por buenos.
 *
 * La página no valida nada: si una fecha va en otro formato, si un `type` no
 * existe en el diccionario o si una miniatura apunta a un fichero que no está,
 * el fallo sale en pantalla (celda sin marcar, etiqueta vacía, hueco gris) sin
 * romper el build. Aquí se caza antes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../../../public');
const page = readFileSync(resolve(here, '../../pages/_events.astro'), 'utf-8');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Como en las tarjetas ya publicadas: "24 jul 2026". */
const CARD_DATE = /^\d{1,2} [a-z]{3} \d{4}$/;
/** "1:03:11" o "57:37" si la grabación no llega a la hora. */
const DURATION = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

const agenda = (eventos.agenda ?? []) as AgendaItem[];
const cards = [...eventos.workshops, ...eventos.events, ...eventos.hackathons] as Array<{
  title: Localized;
  desc?: Localized;
  date: string;
  duration: string;
  thumb: string;
  tags: string[];
}>;

const bothLangs = (v: Localized) => {
  for (const lang of ['en', 'es'] as const) expect(loc(v, lang).trim()).not.toBe('');
};

describe('agenda de eventos.json', () => {
  test('no está vacía', () => {
    expect(agenda.length).toBeGreaterThan(0);
  });

  test.each(agenda.map((a) => [typeof a.title === 'string' ? a.title : a.title.es, a] as const))(
    'la entrada "%s" es válida',
    (_name, a) => {
      expect(a.date).toMatch(ISO);
      bothLangs(a.title);
      // El tipo se pinta desde el diccionario: si no existe, sale la clave.
      for (const lang of ['en', 'es'] as const) {
        const key = `nan.events.types.${a.type}`;
        expect(t(key, lang)).not.toBe(key);
      }
      if (a.until !== undefined) {
        expect(a.until).toMatch(ISO);
        // Inclusivo y hacia delante: un `until` anterior al inicio no marcaría
        // ningún día y la entrada desaparecería sin avisar.
        expect(a.until >= a.date).toBe(true);
      }
    },
  );
});

describe('tarjetas de vídeo de eventos.json', () => {
  test.each(cards.map((v) => [typeof v.title === 'string' ? v.title : v.title.es, v] as const))(
    'la tarjeta "%s" es válida',
    (_name, v) => {
      bothLangs(v.title);
      if (v.desc !== undefined) bothLangs(v.desc);
      expect(v.date).toMatch(CARD_DATE);
      expect(v.duration).toMatch(DURATION);
      expect(v.tags.length).toBeGreaterThan(0);
      expect(v.thumb.startsWith('/img/events/')).toBe(true);
      expect(v.thumb.endsWith('.webp')).toBe(true);
      expect(existsSync(resolve(publicDir, v.thumb.slice(1)))).toBe(true);
    },
  );
});

describe('página de eventos', () => {
  test('el calendario usa la lógica de rangos, no una comparación exacta', () => {
    expect(page).toContain("from '../lib/agenda'");
    expect(page).toContain('calendarDays(');
    expect(page).toContain('upcomingIn(');
    expect(page).not.toContain('a.date === iso');
  });

  test('los textos de las tarjetas pasan por el resolutor de idioma', () => {
    expect(page).toContain('{loc(v.title)}');
    expect(page).toContain('{loc(v.desc)}');
    expect(page).not.toContain('{v.title}');
  });
});
