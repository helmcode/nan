import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import eventos from '../../data/eventos.json';
import modelos from '../../data/modelos.json';
import { tObj } from '../../lib/i18n';

/**
 * La landing del #2 NaN Hackathon (decidir con Clef) es, como la del Gauntlet,
 * una PÁGINA DE ANUNCIO: no guarda datos. Hero con el bucle caso → Clef evalúa
 * → decisión, anuncio de Clef en NaN y preguntas con selector de categorías.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, '../../pages');
const page = readFileSync(resolve(pagesDir, '_factcheck.astro'), 'utf-8');
const script = readFileSync(resolve(here, '../../scripts/factcheck.ts'), 'utf-8');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('fechas del hackathon en eventos.json', () => {
  const f = eventos.factcheck;

  test('son el 13–15 de noviembre de 2026, en ISO', () => {
    expect(f.start).toMatch(ISO);
    expect(f.end).toMatch(ISO);
    expect(f.start).toBe('2026-11-13');
    expect(f.end).toBe('2026-11-15');
  });

  test('arranque y cierre son instantes válidos y en orden', () => {
    const k = Date.parse(f.kickoff);
    const d = Date.parse(f.deadline);
    expect(Number.isNaN(k)).toBe(false);
    expect(Number.isNaN(d)).toBe(false);
    expect(k).toBeLessThan(d);
    expect(f.kickoff.startsWith(f.start)).toBe(true);
    // arranca el viernes a las 17:00, hora peninsular
    expect(f.kickoff).toBe(`${f.start}T17:00:00+01:00`);
    expect(f.deadline.startsWith(f.end)).toBe(true);
  });

  test('la entrada de la agenda cubre exactamente el fin de semana', () => {
    const row = (eventos.agenda ?? []).find((a) => a.href === '/2hackaton');
    expect(row).toBeDefined();
    expect(row!.date).toBe(f.start);
    expect(row!.until).toBe(f.end);
  });
});

describe('la landing no guarda datos', () => {
  test('no monta islas ni formularios', () => {
    expect(page).not.toMatch(/client:(load|idle|visible|only|media)/);
    expect(page).not.toContain('<form');
    expect(page).not.toContain('<input');
  });

  test('ni la página ni su script llaman a ningún endpoint', () => {
    for (const src of [page, script]) {
      expect(src).not.toContain('fetch(');
      expect(src).not.toContain('/api/');
    }
  });
});

describe('enlaces', () => {
  test('las rutas internas pasan por withLang', () => {
    expect(page).toContain('withLang(');
    expect(page).not.toMatch(/href="\/(community|projects|events)/);
  });

  test('lo que se abre fuera lleva rel="noopener"', () => {
    const blanks = page.match(/target="_blank"/g) ?? [];
    const safe = page.match(/target="_blank" rel="noopener"/g) ?? [];
    expect(safe.length).toBe(blanks.length);
  });

  test('sin slug de evento, el CTA no apunta a una página inexistente', () => {
    expect(page).toContain("dates.eventSlug ? withLang(`/events/${dates.eventSlug}`, lang) : communityHref");
  });
});

type Hero = { hash: string; brand: string; title: string; kicker: string; dates: string; cta: string };
type Loop = { steps: string[]; cases: { text: string; tone: string; answer: string }[] };

describe('hero', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} se titula #2 NaN Hackathon y va de decidir con Clef`, () => {
      const h = tObj<Hero>('nan.factcheck.hero', lang);
      expect(`${h.hash}${h.brand} ${h.title}`).toBe('#2NaN Hackathon');
      expect(h.kicker).toContain('Clef');
      expect(h).not.toHaveProperty('sub');
    });

    test(`en ${lang} la fecha cubre el 13, 14 y 15`, () => {
      const h = tObj<Hero>('nan.factcheck.hero', lang);
      for (const d of ['13', '14', '15']) expect(h.dates).toContain(d);
    });

    test(`en ${lang} el bucle mezcla sí, no y elegir una opción`, () => {
      const l = tObj<Loop>('nan.factcheck.loop', lang);
      expect(l.cases.length).toBeGreaterThanOrEqual(3);
      for (const c of l.cases) {
        expect(['yes', 'no', 'pick']).toContain(c.tone);
        expect(c.answer.length).toBeGreaterThan(0);
      }
      expect(new Set(l.cases.map((c) => c.tone)).size).toBe(3);
      expect(l.steps.length).toBeGreaterThan(0);
    });
  }

  test('los casos son los mismos en los dos idiomas, con la misma decisión', () => {
    const es = tObj<Loop>('nan.factcheck.loop', 'es').cases.map((c) => c.tone);
    const en = tObj<Loop>('nan.factcheck.loop', 'en').cases.map((c) => c.tone);
    expect(en).toEqual(es);
  });

  test('los modelos que elige el bucle son modelos reales de NaN', () => {
    const ids = new Set(modelos.categorias.flatMap((c) => c.modelos.map((m) => m.id)));
    for (const lang of ['es', 'en'] as const) {
      const picks = tObj<Loop>('nan.factcheck.loop', lang).cases.filter((c) => /model/i.test(c.text));
      expect(picks.length).toBeGreaterThan(0);
      for (const c of picks) expect(ids).toContain(c.answer);
    }
  });

  test('sin JS el primer caso ya sale resuelto', () => {
    expect(page).toContain('data-phase="verdict"');
    expect(page).toContain('{first.text}');
    expect(page).toContain('{first.answer}');
  });
});

type Clef = { label: string; title: string; lead: string; kinds: { name: string; desc: string }[]; facts: string[]; source: string };

describe('anuncio de Clef en NaN', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} anuncia Clef en NaN con los tres tipos de pregunta`, () => {
      const c = tObj<Clef>('nan.factcheck.clef', lang);
      expect(c.title).toContain('Clef');
      expect(c.title).toContain('NaN');
      expect(c.kinds).toHaveLength(3);
      expect(c.facts.length).toBeGreaterThan(0);
      expect(c.source).toContain('Cloudflare');
    });
  }

  test('la sección está en la página', () => {
    expect(page).toContain('tt.clef.title');
    expect(page).toContain('aria-labelledby="clef-title"');
  });
});

describe('preguntas bajo el hero', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} cuenta cuándo, dónde, el objetivo y el premio`, () => {
      const qa = tObj<QA>('nan.factcheck.qa', lang);
      expect(qa.when.weekdays).toHaveLength(7);
      for (const d of ['13', '14', '15']) expect(qa.when.a).toContain(d);
      expect(qa.when.start).toContain('17:00');
      expect(qa.where.big).toBe('Discord');
      expect(qa.goal.a).toContain('Clef');
      expect(qa.goal).not.toHaveProperty('sub');
      expect(qa.prize.amount).toContain('200');
      expect(qa.prize.amount).toContain('€');
    });
  }

  test('el objetivo ofrece cuatro categorías: enrutador, guardarraíles, Fact Check y tema libre (Fact Check no va primero)', () => {
    const es = tObj<QA>('nan.factcheck.qa', 'es').goal.tracks.map((t) => t.name);
    const en = tObj<QA>('nan.factcheck.qa', 'en').goal.tracks.map((t) => t.name);
    expect(es).toEqual(['Enrutador de modelos', 'Guardarraíles para agentes', 'Fact Check', 'Tema libre']);
    expect(en).toEqual(['Model router', 'Agent guardrails', 'Fact Check', 'Open theme']);
  });

  test('el selector son botones, no un formulario, y sin JS se ven todas', () => {
    expect(page).toContain('role="tablist"');
    expect(page).toContain('type="button"');
    // las pestañas llegan ocultas y el script las muestra
    expect(page).toMatch(/role="tablist"[^>]*hidden/);
    expect(script).toContain('list.hidden = false');
  });

  test('el calendario sale de las fechas de eventos.json, no de un literal', () => {
    expect(page).toContain("dates.start.split('-')");
    expect(page).toContain("dates.end.split('-')");
  });

  test('el «dónde» enlaza a la comunidad con withLang', () => {
    expect(page).toContain('href={communityHref}');
  });
});
