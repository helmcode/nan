import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import eventos from '../../data/eventos.json';
import { tObj } from '../../lib/i18n';

/**
 * La landing del #2 Hackathon: Fact Check es, como la del Gauntlet, una PÁGINA
 * DE ANUNCIO: no guarda datos. Se construye sección a sección; por ahora solo
 * tiene el hero con el bucle afirmación → procesamiento → veredicto.
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
    const row = (eventos.agenda ?? []).find((a) => a.href === '/factcheck');
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

type Hero = { hash: string; brand: string; title: string; kicker: string; sub: string; dates: string; cta: string };
type Loop = { steps: string[]; verdicts: Record<'true' | 'false', string>; claims: { text: string; verdict: string }[] };

describe('hero', () => {
  const sub = { es: 'Todos sabemos lo que pasa el 29 de noviembre en España.', en: 'We all know what happens on November 29 in Spain.' };

  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} se titula #2 NaN Hackathon, con Fact Check y la frase del 29`, () => {
      const h = tObj<Hero>('nan.factcheck.hero', lang);
      expect(`${h.hash}${h.brand} ${h.title}`).toBe('#2NaN Hackathon');
      expect(h.kicker).toBe('Fact Check');
      expect(h.sub).toBe(sub[lang]);
    });

    test(`en ${lang} la fecha cubre el 13, 14 y 15`, () => {
      const h = tObj<Hero>('nan.factcheck.hero', lang);
      for (const d of ['13', '14', '15']) expect(h.dates).toContain(d);
    });

    test(`en ${lang} el bucle alterna verdaderas y falsas`, () => {
      const l = tObj<Loop>('nan.factcheck.loop', lang);
      expect(l.claims.length).toBeGreaterThanOrEqual(2);
      for (const c of l.claims) expect(['true', 'false']).toContain(c.verdict);
      const vs = new Set(l.claims.map((c) => c.verdict));
      expect(vs.size).toBe(2);
      expect(l.steps.length).toBeGreaterThan(0);
    });
  }

  test('las afirmaciones son las mismas en los dos idiomas, con el mismo veredicto', () => {
    const es = tObj<Loop>('nan.factcheck.loop', 'es').claims.map((c) => c.verdict);
    const en = tObj<Loop>('nan.factcheck.loop', 'en').claims.map((c) => c.verdict);
    expect(en).toEqual(es);
  });

  test('sin JS la primera afirmación ya sale resuelta', () => {
    expect(page).toContain('data-phase="verdict"');
    expect(page).toContain('{first.text}');
  });
});

type QA = {
  when: { q: string; weekdays: string[]; a: string; start: string };
  where: { q: string; big: string; a: string };
  goal: { q: string; a: string; t: string; f: string; sub: string };
  prize: { q: string; amount: string; a: string };
};

describe('preguntas bajo el hero', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} cuenta cuándo, dónde, el objetivo y el premio`, () => {
      const qa = tObj<QA>('nan.factcheck.qa', lang);
      expect(qa.when.weekdays).toHaveLength(7);
      for (const d of ['13', '14', '15']) expect(qa.when.a).toContain(d);
      expect(qa.when.start).toContain('17:00');
      expect(qa.where.big).toBe('Discord');
      expect(qa.goal.sub).toContain('Clef');
      expect(qa.goal.sub).toContain('NaN');
      expect(qa.prize.amount).toContain('200');
      expect(qa.prize.amount).toContain('€');
    });
  }

  test('el calendario sale de las fechas de eventos.json, no de un literal', () => {
    expect(page).toContain("dates.start.split('-')");
    expect(page).toContain("dates.end.split('-')");
  });

  test('el «dónde» enlaza a la comunidad con withLang', () => {
    expect(page).toContain('href={communityHref}');
  });
});
