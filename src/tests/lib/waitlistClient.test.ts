import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  isWaitlistRegion,
  parseWaitlistResponse,
  waitlistErrorText,
  waitlistSuccessText,
} from '../../lib/waitlistClient';
import { useT } from '../../lib/i18n';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Hello@Example.COM ')).toBe('hello@example.com');
  });
});

describe('isValidEmail', () => {
  it.each([
    'user@acme.co',
    'user.name+tag@acme.co.uk',
    '  user@acme.co  ',
  ])('accepts %s', (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'not-an-email',
    '@missing-user.com',
    'missing-at.com',
    'spaces in@acme.co',
  ])('rejects %s', (value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  it('rejects emails longer than 254 chars', () => {
    const long = `${'a'.repeat(250)}@b.co`;
    expect(long.length).toBeGreaterThan(254);
    expect(isValidEmail(long)).toBe(false);
  });

  it.each([
    'alice@example.com',
    'bob@example.net',
    'carol@example.org',
    'dave@test.com',
    'eve@mail.com',
    'foo@bar.test',
    'foo@svc.localhost',
    'foo@bar.invalid',
    'foo@doc.example',
    '  Alice@Example.COM ',
  ])('rejects reserved/test domain %s', (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});

describe('isWaitlistRegion', () => {
  it.each(['EU', 'LATAM', 'USA'])('accepts %s', (value) => {
    expect(isWaitlistRegion(value)).toBe(true);
  });

  it.each(['', 'eu', 'latam', 'AF', 'asia', '  EU  '])('rejects %s', (value) => {
    expect(isWaitlistRegion(value)).toBe(false);
  });
});

describe('parseWaitlistResponse', () => {
  it.each(['EU', 'LATAM', 'USA'])('parses a %s registration the same way', (region) => {
    const result = parseWaitlistResponse(200, { ok: true, status: 'registered', region });
    expect(result).toEqual({ ok: true, region });
  });

  it("drops legacy position, total and status: 'interest' from the parsed result", () => {
    const result = parseWaitlistResponse(200, {
      ok: true,
      position: 19,
      total: 19,
      status: 'interest',
      region: 'USA',
    });
    expect(result).toEqual({ ok: true, region: 'USA' });
  });

  it('defaults an unknown region on the wire to EU', () => {
    const result = parseWaitlistResponse(200, {
      ok: true,
      status: 'registered',
      region: 'MARS',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.region).toBe('EU');
  });

  it('maps known error codes', () => {
    expect(parseWaitlistResponse(400, { ok: false, error: 'invalid_email' })).toEqual({
      ok: false,
      error: 'invalid_email',
    });
    expect(parseWaitlistResponse(400, { ok: false, error: 'invalid_region' })).toEqual({
      ok: false,
      error: 'invalid_region',
    });
    expect(parseWaitlistResponse(429, { ok: false, error: 'rate_limited' })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    expect(parseWaitlistResponse(500, { ok: false, error: 'server_error' })).toEqual({
      ok: false,
      error: 'server_error',
    });
  });

  it('falls back to server_error for unknown shapes', () => {
    expect(parseWaitlistResponse(500, null)).toEqual({
      ok: false,
      error: 'server_error',
    });
    expect(parseWaitlistResponse(500, {})).toEqual({
      ok: false,
      error: 'server_error',
    });
    expect(parseWaitlistResponse(400, { ok: false, error: 'unknown_code' })).toEqual({
      ok: false,
      error: 'server_error',
    });
    expect(parseWaitlistResponse(200, { ok: false })).toEqual({
      ok: false,
      error: 'server_error',
    });
  });
});

describe('waitlistErrorText', () => {
  const m = {
    okRegistered: 'ok', okText: 'texto',
    errEmail: 'email mal', errRegion: 'elige region', errRateLimited: 'espera un minuto',
    errNetwork: 'sin conexion', errGeneric: 'algo se rompio',
  };

  it('distingue el rate limit del error genérico', () => {
    // Mostrar "algo se ha roto" para un rate limit es mentira y no dice qué hacer.
    expect(waitlistErrorText('rate_limited', m).text).toBe('espera un minuto');
    expect(waitlistErrorText('server_error', m).text).toBe('algo se rompio');
    expect(waitlistErrorText('rate_limited', m).text).not.toBe(waitlistErrorText('server_error', m).text);
  });

  it('distingue el fallo de red del fallo del servidor', () => {
    expect(waitlistErrorText('network_error', m).text).toBe('sin conexion');
  });

  it('solo devuelve el foco al campo cuando el problema es el email', () => {
    expect(waitlistErrorText('invalid_email', m)).toEqual({ text: 'email mal', focusEmail: true });
    for (const e of ['invalid_region', 'rate_limited', 'network_error', 'server_error'] as const) {
      expect(waitlistErrorText(e, m).focusEmail).toBe(false);
    }
  });

  it('cada código tiene un texto, ninguno cae en blanco', () => {
    for (const e of ['invalid_email', 'invalid_region', 'rate_limited', 'network_error', 'server_error'] as const) {
      expect(waitlistErrorText(e, m).text.length).toBeGreaterThan(0);
    }
  });
});

describe('waitlistSuccessText', () => {
  // Copia real del diccionario: si alguien vuelve a meter la posición o el
  // texto de "región sin abrir" en el i18n o en el mensaje, esto lo ve.
  const msgs = { en: useT('en').hero, es: useT('es').hero };
  const expected = {
    en: `You're on the waitlist. ${msgs.en.okText}`,
    es: `Ya estás en la waitlist. ${msgs.es.okText}`,
  };

  // El texto no depende de la respuesta (región, posición o 409): el parseo que
  // descarta position/total/status antiguos se prueba en parseWaitlistResponse.
  it.each(['en', 'es'] as const)('%s: siempre la copia de alta exacta, sin posición', (lang) => {
    const text = waitlistSuccessText(msgs[lang]);
    expect(text).toBe(expected[lang]);
    expect(text).not.toMatch(/#|\d{3}|position|posición|\//i);
    expect(text).not.toMatch(/not open|no estamos abiertos/i);
  });

  it('el diccionario ya no tiene claves de posición ni de "región sin abrir"', () => {
    for (const lang of ['en', 'es'] as const) {
      expect(msgs[lang]).not.toHaveProperty('okPosition');
      expect(msgs[lang]).not.toHaveProperty('okInterest');
    }
  });
});
