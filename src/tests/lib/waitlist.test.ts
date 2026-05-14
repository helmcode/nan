import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  registerViaBackend,
  validateWaitlistInput,
} from '../../lib/waitlist';

describe('validateWaitlistInput', () => {
  it('accepts a valid minimal payload', () => {
    const result = validateWaitlistInput({ email: 'alice@acme.co', region: 'EU' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.email).toBe('alice@acme.co');
      expect(result.input.region).toBe('EU');
      expect(result.input.honeypot).toBe(false);
    }
  });

  it('lowercases and trims email', () => {
    const result = validateWaitlistInput({
      email: '  Alice@Acme.CO  ',
      region: 'EU',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.email).toBe('alice@acme.co');
  });

  it.each<[unknown, string]>([
    [{ region: 'EU' }, 'missing email'],
    [{ email: '', region: 'EU' }, 'empty email'],
    [{ email: 'not-an-email', region: 'EU' }, 'malformed email'],
    [{ email: 'no@domain', region: 'EU' }, 'no TLD'],
    [null, 'null payload'],
    ['alice@acme.co', 'string payload'],
    [['alice@acme.co'], 'array payload'],
    [{ email: 42, region: 'EU' }, 'non-string email'],
  ])('rejects invalid payload (%s)', (input) => {
    const result = validateWaitlistInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_email');
  });

  it('rejects overlong email', () => {
    const long = 'a'.repeat(260) + '@x.co';
    const result = validateWaitlistInput({ email: long, region: 'EU' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_email');
  });

  it.each<[string, string]>([
    ['alice@example.com', 'RFC 2606 example.com'],
    ['bob@example.net', 'RFC 2606 example.net'],
    ['carol@example.org', 'RFC 2606 example.org'],
    ['dave@test.com', 'common test.com throwaway'],
    ['eve@mail.com', 'mail.com placeholder'],
    ['foo@something.test', 'RFC 2606 .test TLD'],
    ['foo@bar.invalid', 'RFC 2606 .invalid TLD'],
    ['foo@svc.localhost', 'RFC 2606 .localhost TLD'],
    ['foo@doc.example', 'RFC 2606 .example TLD'],
    ['MIXED@Example.COM', 'case-insensitive blocklist'],
  ])('rejects reserved/test email (%s)', (email) => {
    const result = validateWaitlistInput({ email, region: 'EU' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_email');
  });

  it.each(['EU', 'LATAM', 'USA'])('accepts region %s', (region) => {
    const result = validateWaitlistInput({ email: 'a@b.co', region });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.region).toBe(region);
  });

  it.each<[unknown, string]>([
    [undefined, 'missing region'],
    ['', 'empty region'],
    ['eu', 'wrong case'],
    ['AF', 'unknown region'],
    [123, 'non-string region'],
  ])('rejects invalid region (%s)', (region) => {
    const result = validateWaitlistInput({ email: 'a@b.co', region });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_region');
  });

  it('detects the _hp honeypot when filled', () => {
    const result = validateWaitlistInput({
      email: 'a@b.co',
      region: 'EU',
      _hp: 'spam.biz',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.honeypot).toBe(true);
  });

  it('treats an empty honeypot as not triggered', () => {
    const result = validateWaitlistInput({
      email: 'a@b.co',
      region: 'EU',
      _hp: '   ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.honeypot).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('allows the first request from an IP', () => {
    expect(checkRateLimit('10.0.0.1')).toBe(true);
  });

  it('rejects a second request from the same IP within the window', () => {
    checkRateLimit('10.0.0.2');
    expect(checkRateLimit('10.0.0.2')).toBe(false);
  });

  it('treats different IPs independently', () => {
    checkRateLimit('10.0.0.3');
    expect(checkRateLimit('10.0.0.4')).toBe(true);
  });

  it('fails open when the IP is empty', () => {
    expect(checkRateLimit('')).toBe(true);
    expect(checkRateLimit('')).toBe(true);
  });
});

describe('registerViaBackend', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends correct request and parses EU response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ email: 'alice@acme.co', region: 'EU', position: 42 }),
    });

    const result = await registerViaBackend(
      'https://cloud-api.nan.builders',
      'test-key',
      { email: 'alice@acme.co', region: 'EU' },
    );

    expect(result).toMatchObject({
      ok: true,
      position: 42,
      status: 'registered',
      region: 'EU',
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloud-api.nan.builders/api/waitlist/register',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
          'Origin': 'https://nan.builders',
        },
      }),
    );
  });

  it('returns interest status for non-EU region', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ email: 'bob@acme.co', region: 'LATAM', position: 0 }),
    });

    const result = await registerViaBackend(
      'https://cloud-api.nan.builders',
      'test-key',
      { email: 'bob@acme.co', region: 'LATAM' },
    );

    expect(result.status).toBe('interest');
    expect(result.position).toBe(0);
  });

  it('handles 409 duplicate as success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve('{"error":"email already registered"}'),
    });

    const result = await registerViaBackend(
      'https://cloud-api.nan.builders',
      'test-key',
      { email: 'alice@acme.co', region: 'EU' },
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('registered');
  });

  it('throws on server error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('internal error'),
    });

    await expect(
      registerViaBackend('https://cloud-api.nan.builders', 'test-key', {
        email: 'alice@acme.co',
        region: 'EU',
      }),
    ).rejects.toThrow('cloud-api register failed: 500');
  });
});
