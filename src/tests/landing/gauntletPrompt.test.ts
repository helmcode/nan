import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GAUNTLET_PROMPT, promptText, type PromptInk } from '../../data/gauntletPrompt';
import { tObj } from '../../lib/i18n';

/**
 * Lo que se copia tiene que ser el prompt original, palabra por palabra. Es un
 * documento, no copy de la web: si alguien "mejora" una frase al retocar los
 * subrayados, lo que se lleva la gente deja de ser el original. Por eso el
 * texto entero está aquí escrito a mano, y no derivado de la fuente.
 */
const ORIGINAL = `I want you to build a first-person shooter at the level of the most recent Call of Duty games. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from textures to physics to anything you could think of.

Fan out sub-agents and have sub-agents tackle each one individually so that the game is utterly perfect. You should /loop on each item and have a separate sub-agent check it visually to ensure it looks triple A. That separate sub-agent should be a really harsh critic, and if it doesn't look triple A, it should keep going.

Don't stop until each sub-agent is utterly wowed with the quality when compared with the actual Call of Duty game. It should literally compare them side by side blind and say which one looks better. Do this in ThreeJS. /loop until it's utterly perfect. Fan out sub-agents and ultracode.`;

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, '../../pages/_gauntlet.astro'), 'utf-8');

describe('el prompt que se copia', () => {
  test('es el original, sin una coma de más', () => {
    expect(promptText()).toBe(ORIGINAL);
  });

  test('los párrafos van separados por una línea en blanco', () => {
    // Pegado en un chat, el prompt tiene que conservar sus tres bloques.
    expect(promptText().split('\n\n')).toHaveLength(3);
    expect(promptText()).not.toContain('\n\n\n');
  });

  test('ningún trozo se queda pegado al siguiente', () => {
    // El texto se parte para poder subrayar frases sueltas; un espacio perdido
    // en una costura sale directo en el portapapeles.
    expect(promptText()).not.toMatch(/ {2}/);
    for (const paragraph of GAUNTLET_PROMPT) {
      for (const piece of paragraph) expect(piece.t).not.toBe('');
    }
  });
});

describe('las anotaciones al margen', () => {
  const inks = GAUNTLET_PROMPT.flat()
    .map((p) => p.ink)
    .filter((ink): ink is PromptInk => Boolean(ink));

  test('cada color de tinta se usa una sola vez', () => {
    // Dos subrayados del mismo color mandarían al lector a la misma nota desde
    // dos sitios distintos.
    expect(new Set(inks).size).toBe(inks.length);
  });

  for (const lang of ['en', 'es'] as const) {
    test(`en ${lang} cada nota tiene su subrayado en el texto`, () => {
      const notes = tObj<{ notes: Record<string, string> }>('nan.gauntlet.prompt', lang).notes;
      // `stack` (ThreeJS) va subrayado pero sin nota: es un dato, no una
      // decisión que explicar. El resto tiene que existir en los dos sitios.
      const annotated = inks.filter((ink) => ink !== 'stack');
      expect(Object.keys(notes).sort()).toEqual([...annotated].sort());
    });
  }
});

describe('el botón de copiar no habla con nadie', () => {
  test('copia del portapapeles y punto', () => {
    expect(page).toContain('navigator.clipboard.writeText');
    // Ya lo cubre gauntletPage.test.ts para la página entera, pero esta es la
    // única pieza con JavaScript propio: si algún día alguien la usa para
    // contar copias, el fallo tiene que salir aquí.
    expect(page).not.toContain('navigator.sendBeacon');
    expect(page).not.toContain('XMLHttpRequest');
  });

  test('el texto copiado sale de la misma fuente que el texto pintado', () => {
    // Un literal escrito a mano en el `data-prompt` es exactamente la forma de
    // que lo que se lee y lo que se copia acaben diciendo cosas distintas.
    expect(page).toContain('data-prompt={promptText()}');
  });
});
