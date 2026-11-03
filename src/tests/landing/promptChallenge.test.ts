import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';
import {
  PROMPT_CHALLENGE_ERROR_CODES,
  errorMessage,
  outcomeFromStored,
  tokenize,
  validateAnswer,
} from '../../scripts/promptChallenge';

/**
 * /prompt es un formulario público, sin login, que escribe en el backend de
 * eventos. Lo que no se ve en pantalla si se rompe:
 *
 *  - **El texto llega entero.** `tokenize` parte el texto para fingir que un
 *    modelo lo escribe; si se come un espacio, la respuesta sale pegada.
 *  - **La validación va antes de la petición.** Sin ella, un prompt vacío de
 *    cinco caracteres gasta una request y el presupuesto del rate limit por IP
 *    para acabar en un error genérico.
 *  - **Los códigos de error son un contrato con el backend.** Una clave que
 *    falte en un idioma sale vacía y nadie se entera hasta producción.
 *  - **El visitante nunca ve un código crudo.** El backend puede contestar con
 *    algo fuera del contrato (`internal`, un código nuevo): si se cae el
 *    filtro, el usuario lee "internal" en pantalla.
 *
 * El estado del DOM (los tres pasos, localStorage) vive en un script vainilla
 * y el entorno de test es `node`, sin jsdom: se prueba la lógica pura y el
 * marcado, igual que en las suites de /survey y /gauntlet.
 */

const LANGS = ['en', 'es'] as const;

/** Una respuesta con saltos de línea, acentos y una palabra larga de verdad. */
const SAMPLE =
  '¿Qué te encantaría ver en el canal de Helmcode?\n\n' +
  'Un día de SRE sin incidentes y con café.\n' +
  'Y una masterclass de internacionalización de prompts.';

describe('tokenize', () => {
  test('los tokens reconstruyen el texto exacto, sin perder un espacio', () => {
    expect(tokenize(SAMPLE).join('')).toBe(SAMPLE);
  });

  test('cada salto de línea es un token de su cuenta', () => {
    const tokens = tokenize(SAMPLE);
    // Ningún token puede llevar un \n dentro: el stream pausa por token, y un
    // salto pegado a una palabra se colaría sin pausa.
    for (const token of tokens) {
      if (token.includes('\n')) expect(token).toBe('\n');
    }
    expect(tokens.filter((t) => t === '\n')).toHaveLength(
      SAMPLE.split('').filter((c) => c === '\n').length,
    );
  });

  test('ningún token de palabra pasa de 6 caracteres, sin contar el espacio de delante', () => {
    for (const token of tokenize(SAMPLE)) {
      if (token === '\n') continue;
      const word = token.replace(/^\s+/, '');
      expect(word.length, `token ${JSON.stringify(token)}`).toBeGreaterThan(0);
      expect(word.length, `token ${JSON.stringify(token)}`).toBeLessThanOrEqual(6);
    }
  });

  test('una palabra larga se parte en varios tokens', () => {
    const tokens = tokenize('internacionalización');
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join('')).toBe('internacionalización');
  });

  test('un texto vacío no produce tokens', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('lo que se recuerda de la última visita', () => {
  test('se guarda el resultado, no un simple "ya está"', () => {
    // Guardar '1' para los dos finales hacía que quien recibió un 409 volviera
    // y viera el chiste y la firma como si su respuesta se hubiera aceptado.
    expect(outcomeFromStored('answered')).toBe('answered');
    expect(outcomeFromStored('already_submitted')).toBe('already_submitted');
  });

  test('el 1 de las versiones anteriores se lee como respuesta aceptada', () => {
    // Antes solo había un valor y era posterior a un 201.
    expect(outcomeFromStored('1')).toBe('answered');
  });

  test('un valor ajeno devuelve a la persona al formulario', () => {
    for (const value of [null, '', '0', 'true', '{"sent":true}', 'answered ']) {
      expect(outcomeFromStored(value)).toBeNull();
    }
  });
});

describe('validateAnswer', () => {
  test('acepta un prompt de 10 y de 2000 code points', () => {
    expect(validateAnswer('a'.repeat(10), '')).toBeNull();
    expect(validateAnswer('😀'.repeat(2000), '')).toBeNull();
  });

  test('rechaza 9 y 2001 code points, contando code points y no unidades UTF-16', () => {
    // Nueve emoji son 18 unidades UTF-16: con `.length` el prompt pasaría por
    // bueno y el backend lo rechazaría después de gastar la petición.
    expect(validateAnswer('😀'.repeat(9), '')).toBe('prompt_too_short');
    expect(validateAnswer('😀'.repeat(2001), '')).toBe('prompt_too_long');
  });

  test('mide el prompt sin los espacios de los extremos', () => {
    expect(validateAnswer(`   ${'a'.repeat(10)}   `, '')).toBeNull();
    expect(validateAnswer(`   ${'a'.repeat(9)}   `, '')).toBe('prompt_too_short');
  });

  test('el handle es opcional y acepta @usuario y usuario_1', () => {
    const prompt = 'a'.repeat(20);
    expect(validateAnswer(prompt, '')).toBeNull();
    expect(validateAnswer(prompt, '@user')).toBeNull();
    expect(validateAnswer(prompt, 'user_1')).toBeNull();
    expect(validateAnswer(prompt, `@${'a'.repeat(15)}`)).toBeNull();
  });

  test('rechaza un handle de 16 caracteres o con guiones', () => {
    const prompt = 'a'.repeat(20);
    expect(validateAnswer(prompt, 'a'.repeat(16))).toBe('invalid_twitter');
    expect(validateAnswer(prompt, 'bad-handle')).toBe('invalid_twitter');
  });

  test('devuelve el error del prompt antes que el del handle', () => {
    // Son dos campos: el primero que falla es el que se marca y enfoca.
    expect(validateAnswer('corto', 'bad-handle')).toBe('prompt_too_short');
  });
});

describe('códigos de error del backend', () => {
  test('el contrato es la lista que documenta el endpoint', () => {
    expect([...PROMPT_CHALLENGE_ERROR_CODES]).toEqual([
      'prompt_too_short',
      'prompt_too_long',
      'invalid_twitter',
      'body_too_large',
      'already_submitted',
      'rate_limited',
      'challenge_full',
    ]);
  });

  for (const [lang, dict] of [
    ['en', en],
    ['es', es],
  ] as const) {
    test(`los errores de ${lang} son el contrato más el mensaje genérico`, () => {
      // Una clave que el backend manda y el diccionario no tiene sale como el
      // mensaje genérico, nunca como el código crudo.
      const keys = Object.keys(dict.nan.prompt.errors);
      expect([...keys].sort()).toEqual([...PROMPT_CHALLENGE_ERROR_CODES, 'generic'].sort());
    });
  }

  test('el aviso de respuesta repetida no dice que la persona haya respondido', () => {
    // La regla es por IP: una oficina, una casa o una CGNAT la comparten.
    expect(es.nan.prompt.errors.already_submitted).toBe(
      'Ya recibimos una respuesta desde esta red. Solo se admite una por conexión.',
    );
    expect(en.nan.prompt.errors.already_submitted).toBe(
      'We already got an answer from this network. Only one is accepted per connection.',
    );
  });

  test('la etiqueta de envío en curso ya no existe: nunca llegaba a verse', () => {
    for (const lang of LANGS) {
      const question = (lang === 'en' ? en : es).nan.prompt.question as Record<string, unknown>;
      expect(question).not.toHaveProperty('sending');
    }
  });
});

describe('el mensaje que se enseña por un código de error', () => {
  // Diccionario mínimo, en inglés: la función es pura y el idioma es cosa del
  // diccionario, así que aquí solo importa qué mensaje elige.
  const DICT = {
    prompt_too_long: 'Too long.',
    already_submitted: 'One answer per network.',
    generic: 'Try again.',
  };

  test('un código del contrato con mensaje devuelve ese mensaje', () => {
    expect(errorMessage('prompt_too_long', DICT)).toBe('Too long.');
    expect(errorMessage('already_submitted', DICT)).toBe('One answer per network.');
  });

  test('un código del contrato sin mensaje en el diccionario cae al genérico', () => {
    // rate_limited está en el contrato pero no en este diccionario.
    expect(errorMessage('rate_limited', DICT)).toBe('Try again.');
  });

  test('un código fuera del contrato nunca se enseña crudo', () => {
    // El backend puede contestar cualquier cosa; el filtro es lo que impide que
    // el visitante lea "internal" en pantalla. El diccionario lleva una entrada
    // para ese código a propósito: aunque exista, un código fuera del contrato
    // no la usa.
    const hostile = { internal: 'RAW internal', nope: 'RAW nope', generic: 'Try again.' };
    for (const code of ['internal', 'nope', '', '__proto__', 'toString', 'constructor']) {
      expect(errorMessage(code, hostile), `código ${JSON.stringify(code)}`).toBe('Try again.');
    }
  });

  test('los códigos de siempre siguen enseñando su mensaje del diccionario', () => {
    // Comportamiento previo al extraer la función: `messages[code] ?? messages.generic`.
    // Si el filtro empezara a rechazar códigos del contrato, esto se rompe.
    for (const code of PROMPT_CHALLENGE_ERROR_CODES) {
      expect(errorMessage(code, es.nan.prompt.errors), `código ${code}`).toBe(
        (es.nan.prompt.errors as Record<string, string>)[code],
      );
    }
  });

  test('un código del contrato sin diccionario devuelve una frase estable', () => {
    // Sin `data-messages` no hay nada que enseñar: nunca `undefined` ni el
    // código crudo, y siempre la misma frase.
    const fallback = errorMessage('body_too_large', {});
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback).not.toBe('body_too_large');
    expect(fallback).not.toBe('generic');
    expect(fallback).not.toBe('undefined');
    for (const code of ['generic', 'internal', '', '__proto__']) {
      expect(errorMessage(code, {}), `código ${JSON.stringify(code)}`).toBe(fallback);
    }
  });
});

describe('el marcado de la página', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(resolve(here, '../../pages/_prompt.astro'), 'utf-8');

  test('se reparte por enlace, así que va con noindex y nofollow', () => {
    expect(page).toMatch(/<NanBase[^>]*\bnoindex\b/);
    expect(page).toMatch(/<NanBase[^>]*\bnofollow\b/);
  });

  test('los mensajes de error salen del diccionario, no escritos a mano', () => {
    expect(page).toContain('data-messages={JSON.stringify(tt.errors)}');
  });

  test('el honeypot se llama website', () => {
    // Es el campo que el backend mira para descartar bots: si se renombra aquí
    // y no allí, el honeypot deja de existir sin que falle nada.
    expect(page).toContain('name="website"');
  });

  test('la pregunta del paso 2 describe el campo y el error también', () => {
    expect(page).toContain('id="pc-question"');
    expect(page).toContain('aria-describedby="pc-question pc-prompt-hint pc-error"');
    expect(page).toContain('aria-describedby="pc-error"');
    expect(page).toContain('id="pc-error"');
  });
});
