import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  isWaitlistRegion,
  parseWaitlistResponse,
  successMessage,
  errorMessage,
  getTranslations,
} from './waitlistForm.helpers';

const esT = getTranslations('es');

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
  it('parses a successful EU registration', () => {
    const result = parseWaitlistResponse(200, {
      ok: true,
      position: 3,
      total: 3,
      status: 'registered',
      region: 'EU',
    });
    expect(result).toEqual({
      ok: true,
      position: 3,
      total: 3,
      status: 'registered',
      region: 'EU',
    });
  });

  it('parses a non-EU interest registration', () => {
    const result = parseWaitlistResponse(200, {
      ok: true,
      position: 0,
      total: 4,
      status: 'interest',
      region: 'LATAM',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('interest');
      expect(result.region).toBe('LATAM');
      expect(result.position).toBe(0);
    }
  });

  it('defaults an unknown region on the wire to EU', () => {
    const result = parseWaitlistResponse(200, {
      ok: true,
      position: 1,
      total: 1,
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

describe('successMessage', () => {
  it('uses the registered message for EU signups', () => {
    const msg = successMessage({
      ok: true,
      position: 7,
      total: 7,
      status: 'registered',
      region: 'EU',
    }, esT);
    expect(msg).toContain('orden de llegada');
  });

  it('uses an interest message mentioning the region', () => {
    const msg = successMessage({
      ok: true,
      position: 0,
      total: 0,
      status: 'interest',
      region: 'LATAM',
    }, esT);
    expect(msg).toContain('LATAM');
  });
});

describe('errorMessage', () => {
  it('returns a distinct message per error', () => {
    const messages = new Set<string>();
    for (const err of [
      'invalid_email',
      'invalid_region',
      'rate_limited',
      'network_error',
      'server_error',
    ] as const) {
      messages.add(errorMessage({ ok: false, error: err }, esT));
    }
    expect(messages.size).toBe(5);
  });
});
