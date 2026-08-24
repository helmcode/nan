import { describe, expect, test } from 'vitest';
import encuesta from '../../data/encuesta.json';
import { loc, type Localized } from '../../lib/agenda';
import { useT } from '../../lib/i18n';
import type { Question, RoadmapItem, Others } from '../../lib/encuesta';

/**
 * El informe de la encuesta es una página pública hecha con respuestas de
 * personas reales, y las dos reglas que la hacen publicable no se ven en
 * pantalla si se rompen:
 *
 *  - **Solo porcentajes.** Un recuento por opción sobre una base de 78 invita a
 *    hacer aritmética sobre personas concretas. Si alguien añade un `n` a una
 *    barra, el gráfico sigue pintándose igual de bien.
 *  - **Citas anónimas.** Sin nombre, sin número de respuesta, sin correos ni
 *    direcciones de proyectos. El permiso que dio la comunidad era para Built
 *    with NaN, no para este informe, y una cita con un dato de más no se puede
 *    despublicar de la cabeza de quien ya la leyó.
 *
 * Lo demás son fallos que saldrían en pantalla sin romper el build: un texto
 * que falta en un idioma sale vacío, y un porcentaje fuera de rango pinta una
 * barra de ancho absurdo.
 */

const questions = encuesta.questions as unknown as Question[];
const roadmap = encuesta.roadmap as unknown as RoadmapItem[];
const others = encuesta.others as unknown as Others;

const LANGS = ['en', 'es'] as const;

const bothLangs = (v: Localized, where: string) => {
  for (const lang of LANGS) expect(loc(v, lang).trim(), `${where} (${lang})`).not.toBe('');
};

const allBars = questions.flatMap((q) => [...q.bars, ...(q.bars2 ?? [])]);

/** Todo el texto del dataset, en los dos idiomas, para los barridos. */
const allText = (() => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(encuesta);
  return out;
})();

describe('estructura de encuesta.json', () => {
  test('hay las 12 preguntas y los 12 puntos de roadmap que pinta la página', () => {
    expect(questions).toHaveLength(12);
    expect(roadmap).toHaveLength(12);
    expect(others.items.length).toBeGreaterThan(0);
  });

  test('cada pregunta trae id, base, enunciado, barras, eje y lectura', () => {
    for (const q of questions) {
      expect(q.id, 'id de pregunta').toMatch(/^P\d{2}(-P\d{2})?$/);
      bothLangs(q.base, `${q.id}.base`);
      bothLangs(q.q, `${q.id}.q`);
      bothLangs(q.axis, `${q.id}.axis`);
      expect(q.bars.length, `${q.id}.bars`).toBeGreaterThan(0);
      expect(q.read.length, `${q.id}.read`).toBeGreaterThan(0);
      q.read.forEach((p, i) => bothLangs(p, `${q.id}.read[${i}]`));
    }
  });

  test('el segundo gráfico siempre viene con su propio eje', () => {
    for (const q of questions) {
      expect(Boolean(q.bars2), `${q.id}.bars2`).toBe(Boolean(q.axis2));
    }
  });

  test('las etiquetas de barra están en los dos idiomas', () => {
    for (const q of questions) {
      [...q.bars, ...(q.bars2 ?? [])].forEach((b, i) => bothLangs(b.label, `${q.id}.bars[${i}]`));
    }
  });

  test('cada tabla cuadra: todas las filas con tantas celdas como columnas', () => {
    for (const q of questions) {
      if (!q.table) continue;
      const cols = q.table.head.length;
      expect(cols, `${q.id}.table.head`).toBeGreaterThan(1);
      q.table.head.forEach((h, i) => bothLangs(h, `${q.id}.table.head[${i}]`));
      for (const row of q.table.rows) {
        bothLangs(row.label, `${q.id}.table.row`);
        // La primera columna es la etiqueta de fila; el resto son celdas.
        expect(row.cells.length, `${q.id}.table.row.cells`).toBe(cols - 1);
        if (row.highlight !== undefined) {
          expect(row.highlight).toBeGreaterThanOrEqual(0);
          expect(row.highlight).toBeLessThan(row.cells.length);
        }
      }
    }
  });

  test('el roadmap trae área y titular, y el cuerpo es opcional pero no vacío', () => {
    for (const item of roadmap) {
      bothLangs(item.area, 'roadmap.area');
      bothLangs(item.title, 'roadmap.title');
      if (item.body !== undefined) bothLangs(item.body, 'roadmap.body');
    }
  });
});

describe('solo porcentajes: el dataset no lleva recuentos de respuestas', () => {
  test('ninguna barra trae otro campo que etiqueta, porcentaje y tipo', () => {
    for (const bar of allBars) {
      expect(Object.keys(bar).sort()).toEqual(
        'kind' in bar ? ['kind', 'label', 'pct'] : ['label', 'pct'],
      );
    }
  });

  test('los porcentajes son enteros de 0 a 100', () => {
    for (const bar of allBars) {
      expect(Number.isInteger(bar.pct)).toBe(true);
      expect(bar.pct).toBeGreaterThanOrEqual(0);
      expect(bar.pct).toBeLessThanOrEqual(100);
    }
  });

  test('el `kind` de una barra es uno de los dos que sabe pintar el componente', () => {
    for (const bar of allBars) {
      if (bar.kind === undefined) continue;
      expect(['hi', 'neg']).toContain(bar.kind);
    }
  });

  test('las celdas de las tablas son porcentajes, sin el recuento delante', () => {
    for (const q of questions) {
      for (const row of q.table?.rows ?? []) {
        for (const cell of row.cells) {
          expect(cell, `${q.id}: celda`).toMatch(/^\d{1,3}%$/);
        }
      }
    }
  });
});

describe('las citas son publicables', () => {
  const quotes = questions.flatMap((q) => (q.quotes ?? []).map((quote) => ({ q, quote })));

  test('hay citas y todas están en los dos idiomas', () => {
    expect(quotes.length).toBeGreaterThan(10);
    for (const { q, quote } of quotes) {
      bothLangs(quote.text, `${q.id}: cita`);
      if (quote.cite) bothLangs(quote.cite, `${q.id}: atribución`);
    }
  });

  test('ninguna cita lleva número de respuesta', () => {
    for (const { q, quote } of quotes) {
      for (const lang of LANGS) {
        expect(loc(quote.text, lang), `${q.id}: cita`).not.toMatch(/respuesta\s*\d|answer\s*\d/i);
      }
    }
  });

  test('la atribución, cuando la hay, es un huso horario o el idioma original', () => {
    const allowed = [
      'horario LATAM',
      'horario España',
      'LATAM time zone',
      'Spain time zone',
      'respuesta escrita en inglés',
      'answered in English',
    ];
    for (const { quote } of quotes) {
      if (!quote.cite) continue;
      for (const lang of LANGS) expect(allowed).toContain(loc(quote.cite, lang));
    }
  });
});

describe('nada de datos personales en toda la página', () => {
  test('no hay correos', () => {
    for (const text of allText) {
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });

  test('no hay direcciones de proyectos de miembros', () => {
    // El permiso era para Built with NaN. Se permiten las de NaN y Helmcode,
    // que son nuestras.
    const urls = allText.flatMap((t) => [...t.matchAll(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|es|dev|app|io|net|org|video|pages\.dev|uy|ai)\b/g)].map((m) => m[0]));
    const ours = /(^|\.)(nan\.builders|helmcode\.com)$/;
    expect(urls.filter((u) => !ours.test(u))).toEqual([]);
  });

  test('no se cuela un em dash (regla de estilo de la casa)', () => {
    for (const text of allText) expect(text).not.toContain('—');
  });
});

describe('el chrome de la página está en el diccionario', () => {
  test('las dos pestañas, la cabecera y el método existen en los dos idiomas', () => {
    for (const lang of LANGS) {
      const s = useT(lang).survey;
      for (const key of [
        'metaTitle',
        'metaDesc',
        'kicker',
        'titleA',
        'titleB',
        'lead',
        'tabData',
        'tabRoadmap',
        'tabsLabel',
        'dataHead',
        'dataLead',
        'readLabel',
        'roadmapHead',
        'roadmapLead',
        'closing',
      ] as const) {
        expect(String(s[key]).trim(), `nan.survey.${key} (${lang})`).not.toBe('');
      }
      expect(s.method.length, `nan.survey.method (${lang})`).toBeGreaterThan(0);
      expect(s.stats.length, `nan.survey.stats (${lang})`).toBeGreaterThan(0);
      for (const stat of s.stats) {
        expect(stat.n.trim()).not.toBe('');
        expect(stat.k.trim()).not.toBe('');
      }
    }
  });

  test('las cifras de la cabecera son porcentajes o la base de la muestra', () => {
    for (const lang of LANGS) {
      for (const stat of useT(lang).survey.stats) {
        expect(stat.n).toMatch(/^(78|\d{1,3}%)$/);
      }
    }
  });
});
