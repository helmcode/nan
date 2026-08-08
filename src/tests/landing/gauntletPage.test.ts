import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import eventos from '../../data/eventos.json';
import { tObj } from '../../lib/i18n';

/**
 * La landing del Gauntlet es una PÁGINA DE ANUNCIO: no guarda un solo dato.
 * Esa decisión no se ve en el marcado —una isla o un formulario entran sin
 * romper nada— así que se guarda aquí. Si algún día hay backend y se construye
 * la entrega o la votación, estos tests son los que hay que cambiar a
 * conciencia, no de pasada.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(here, '../../pages');
const page = readFileSync(resolve(pagesDir, '_gauntlet.astro'), 'utf-8');

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('fechas del gauntlet en eventos.json', () => {
  const g = eventos.gauntlet;

  test('están todas y en formato ISO', () => {
    for (const key of ['workshop', 'start', 'close', 'votingEnd'] as const) {
      expect(g[key]).toMatch(ISO);
    }
  });

  test('van en orden', () => {
    expect(g.workshop < g.start).toBe(true);
    expect(g.start < g.close).toBe(true);
    // votingEnd es provisional ("unos días" desde el 28), pero nunca puede caer
    // antes del cierre: la fase `voting` no existiría.
    expect(g.close <= g.votingEnd).toBe(true);
  });

  test('la entrada de la agenda cubre exactamente la ventana de construcción', () => {
    const row = (eventos.agenda ?? []).find((a) => a.href === '/gauntlet');
    expect(row).toBeDefined();
    expect(row!.date).toBe(g.start);
    expect(row!.until).toBe(g.close);
  });
});

describe('la landing no guarda datos', () => {
  test('no monta ninguna isla', () => {
    // Sin isla no hay estado de cliente que persistir.
    expect(page).not.toMatch(/client:(load|idle|visible|only|media)/);
  });

  test('no hay formulario propio: la inscripción es un Google Form externo', () => {
    expect(page).not.toContain('<form');
    expect(page).not.toContain('<input');
  });

  test('no llama a ningún endpoint', () => {
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('/api/');
  });
});

describe('enlaces de la landing', () => {
  test('lo que se abre fuera lleva rel="noopener"', () => {
    // El único salto de dominio es el Google Form.
    const external = page.includes("target: '_blank'") || page.includes('target="_blank"');
    expect(external).toBe(true);
    expect(page).toContain("rel: 'noopener'");
  });

  test('las rutas internas pasan por withLang, para no perder el idioma', () => {
    expect(page).toContain('withLang(');
    // Enlaces a /community o /projects escritos a pelo se quedarían en inglés
    // desde la versión española.
    expect(page).not.toMatch(/href="\/(community|projects|events)"/);
  });
});

describe('copy del gauntlet', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`la URL del formulario en ${lang} es el Google Form publicado`, () => {
      const url = tObj<{ url: string }>('nan.gauntlet.form', lang).url;
      // El CTA principal de la landing. Tiene que ser el enlace público del
      // formulario: `/viewform` a secas, sin el `?usp=publish-editor` que
      // añade el editor de Google al copiarlo —ese parámetro no rompe nada,
      // pero delata de dónde salió y no pinta en una URL que se comparte.
      expect(url.startsWith('https://docs.google.com/forms/')).toBe(true);
      expect(url.endsWith('/viewform')).toBe(true);
    });

    test(`la entrega en ${lang} lista los 8 campos obligatorios`, () => {
      const submit = tObj<{ required: string[] }>('nan.gauntlet.submit', lang);
      expect(submit.required).toHaveLength(8);
    });
  }
});

describe('la numeración de las secciones', () => {
  const numbers = [...page.matchAll(/class="sechead__n">(\d\d)</g)].map((m) => m[1]);

  test('van seguidas desde 01, sin saltos ni repetidos', () => {
    // Los números están escritos a mano en la plantilla, así que meter una
    // sección por el medio obliga a renumerar todas las de abajo. Un 02
    // repetido no rompe nada —la página se pinta igual— y no lo ve nadie
    // hasta que está en producción.
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(numbers.map((_, i) => String(i + 1).padStart(2, '0')));
  });
});

describe('rutas', () => {
  test('existen los dos envoltorios', () => {
    expect(existsSync(resolve(pagesDir, 'gauntlet.astro'))).toBe(true);
    expect(existsSync(resolve(pagesDir, 'es/gauntlet.astro'))).toBe(true);
  });
});
