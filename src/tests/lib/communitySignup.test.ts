import { describe, expect, it } from 'vitest';
import {
  resolveSignupResponse,
  errorMessageFor,
  type CommunityErrorCode,
} from '../../lib/communitySignup';

/**
 * resolveSignupResponse es el clasificador puro de respuestas que la isla
 * CommunitySignupForm usa para convertir el resultado de un fetch en un estado
 * de UI. Antes vivía inline en el componente (imposible de testear sin DOM); se
 * extrajo para que cada camino de error quede fijado aquí.
 *
 * La otra rama del formulario, que el fetch lance, la gestiona quien llama
 * como errorNetwork antes de que esta función llegue a ejecutarse, así que
 * aquí no tiene caso.
 */

const T = {
  errorInvalidEmail: 'Invalid email. Check the format.',
  errorInvalidRegion: 'Select a region.',
  errorRateLimited: 'Too many attempts. Wait a minute.',
  errorServer: 'Something went wrong. Try again in a moment.',
};

describe('resolveSignupResponse', () => {
  it('redirects on 200 with { ok: true, url }', () => {
    const out = resolveSignupResponse(200, { ok: true, url: 'https://checkout.stripe.com/c/pay/abc' });
    expect(out).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/abc' });
  });

  it('reports already on 409', () => {
    const out = resolveSignupResponse(409, { ok: false, error: 'already_subscribed' });
    expect(out).toEqual({ kind: 'already' });
  });

  it('maps rate_limited to an error', () => {
    const out = resolveSignupResponse(429, { ok: false, error: 'rate_limited' });
    expect(out).toEqual({ kind: 'error', code: 'rate_limited' });
  });

  it('maps invalid_email to an error', () => {
    const out = resolveSignupResponse(400, { ok: false, error: 'invalid_email' });
    expect(out).toEqual({ kind: 'error', code: 'invalid_email' });
  });

  it('maps invalid_region to an error', () => {
    const out = resolveSignupResponse(400, { ok: false, error: 'invalid_region' });
    expect(out).toEqual({ kind: 'error', code: 'invalid_region' });
  });

  it('falls back to server_error on an unrecognized error code', () => {
    const out = resolveSignupResponse(500, { ok: false, error: 'something_unexpected' });
    expect(out).toEqual({ kind: 'error', code: 'server_error' });
  });

  it('falls back to server_error when the body is not JSON (null)', () => {
    const out = resolveSignupResponse(502, null);
    expect(out).toEqual({ kind: 'error', code: 'server_error' });
  });

  it('falls back to server_error when 200 lacks ok:true', () => {
    // Un 200 sin la forma esperada no es una redirección: se trata como error de servidor.
    const out = resolveSignupResponse(200, { url: 'https://checkout.stripe.com/c/pay/abc' });
    expect(out).toEqual({ kind: 'error', code: 'server_error' });
  });

  it('falls back to server_error when 200 url is not a string', () => {
    const out = resolveSignupResponse(200, { ok: true, url: 42 });
    expect(out).toEqual({ kind: 'error', code: 'server_error' });
  });

  it('does not treat 409 as a redirect even if ok:true sneaks in', () => {
    const out = resolveSignupResponse(409, { ok: true, url: 'https://x' });
    expect(out).toEqual({ kind: 'already' });
  });
});

describe('errorMessageFor', () => {
  const cases: Array<[CommunityErrorCode, string]> = [
    ['invalid_email', T.errorInvalidEmail],
    ['invalid_region', T.errorInvalidRegion],
    ['rate_limited', T.errorRateLimited],
    ['already_subscribed', T.errorServer], // sin mensaje propio en el formulario -> fallback de servidor
    ['server_error', T.errorServer],
  ];

  it.each(cases)('maps %s to the right localized string', (code, expected) => {
    expect(errorMessageFor(code, T)).toBe(expected);
  });
});
