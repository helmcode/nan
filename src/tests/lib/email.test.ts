import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConfirmationBody,
  sendConfirmationEmail,
} from '../../lib/email';

describe('buildConfirmationBody', () => {
  it('mentions Europa for EU region', () => {
    const body = buildConfirmationBody('EU');
    expect(body).toContain('Europa');
    expect(body).not.toContain('Latinoamérica');
  });

  it('mentions Latinoamérica for LATAM region', () => {
    const body = buildConfirmationBody('LATAM');
    expect(body).toContain('Latinoamérica');
  });

  it('mentions Estados Unidos for USA region', () => {
    const body = buildConfirmationBody('USA');
    expect(body).toContain('Estados Unidos');
  });

  it('is written in Spanish', () => {
    const body = buildConfirmationBody('EU');
    expect(body).toContain('lista de espera');
    expect(body).toContain('Cristian');
    expect(body).toContain('nan.builders');
  });
});

describe('sendConfirmationEmail', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct payload to Resend API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resend_123' }),
    });

    const result = await sendConfirmationEmail({
      to: 'alice@acme.co',
      region: 'EU',
      apiKey: 'test_api_key',
      from: 'Cristian · NaN <cristian@nan.builders>',
    });

    expect(result).toEqual({ ok: true, id: 'resend_123' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.resend.com/emails');

    const options = call[1];
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test_api_key');

    const body = JSON.parse(options.body);
    expect(body.to).toBe('alice@acme.co');
    expect(body.from).toBe('Cristian · NaN <cristian@nan.builders>');
    expect(body.subject).toContain('lista de espera');
    expect(body.text).toContain('Europa');
  });

  it('returns error on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('validation error'),
    });

    const result = await sendConfirmationEmail({
      to: 'fail@acme.co',
      region: 'EU',
      apiKey: 'bad_key',
      from: 'test@nan.builders',
    });

    expect(result).toEqual({
      ok: false,
      error: 'validation error',
      status: 422,
    });
  });

  it('returns error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await sendConfirmationEmail({
      to: 'fail@acme.co',
      region: 'EU',
      apiKey: 'key',
      from: 'test@nan.builders',
    });

    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
