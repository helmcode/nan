import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRateLimitForTests,
  checkRateLimit,
  isCommunityRegion,
  signupViaBackend,
  validateCommunityInput,
} from './communitySignup';

beforeEach(() => {
  __resetRateLimitForTests();
});

describe('validateCommunityInput', () => {
  it('accepts a valid EU input', () => {
    const result = validateCommunityInput({ email: 'alice@acme.co', region: 'EU' });
    expect(result).toEqual({
      ok: true,
      input: { email: 'alice@acme.co', region: 'EU', honeypot: false },
    });
  });

  it('accepts USA + LATAM regions and lowercases the email', () => {
    expect(validateCommunityInput({ email: 'BOB@Acme.Co', region: 'USA' })).toEqual({
      ok: true,
      input: { email: 'bob@acme.co', region: 'USA', honeypot: false },
    });
    expect(validateCommunityInput({ email: 'luis@acme.co', region: 'LATAM' })).toEqual({
      ok: true,
      input: { email: 'luis@acme.co', region: 'LATAM', honeypot: false },
    });
  });

  it.each([
    [{}, 'invalid_email'],
    [null, 'invalid_email'],
    [[], 'invalid_email'],
    [{ email: 'not-an-email', region: 'EU' }, 'invalid_email'],
    [{ email: '', region: 'EU' }, 'invalid_email'],
    [{ email: 'alice@example.com', region: 'EU' }, 'invalid_email'],
    [{ email: 'alice@svc.localhost', region: 'EU' }, 'invalid_email'],
    [{ email: 'alice@acme.co', region: 'AF' }, 'invalid_region'],
    [{ email: 'alice@acme.co' }, 'invalid_region'],
    [{ email: 'alice@acme.co', region: 'eu' }, 'invalid_region'],
  ])('rejects %j with %s', (input, expected) => {
    const result = validateCommunityInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(expected);
    }
  });

  it('flags the honeypot when filled but still validates the rest', () => {
    const result = validateCommunityInput({
      email: 'bot@acme.co',
      region: 'EU',
      _hp: 'spam',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.honeypot).toBe(true);
  });
});

describe('isCommunityRegion', () => {
  it.each(['EU', 'LATAM', 'USA'])('accepts %s', (value) => {
    expect(isCommunityRegion(value)).toBe(true);
  });

  it.each(['', 'eu', 'AF', '  EU  '])('rejects %s', (value) => {
    expect(isCommunityRegion(value)).toBe(false);
  });
});

describe('signupViaBackend', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the Stripe URL on 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
  });

  it('does NOT send X-API-Key (community signup is public)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/c/x' }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await signupViaBackend('https://api.test', { email: 'alice@acme.co', region: 'EU' });

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.test/api/community/signup');
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('maps backend 409 to already_subscribed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 409,
      json: () => Promise.resolve({ error: 'already_subscribed' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'already_subscribed' });
  });

  it('maps backend 429 to rate_limited', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      json: () => Promise.resolve({ error: 'rate limit exceeded' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('maps a 400 with email message to invalid_email', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      json: () => Promise.resolve({ error: 'valid email is required' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('maps a 400 with region message to invalid_region', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      json: () => Promise.resolve({ error: 'region must be EU, USA, or LATAM' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_region' });
  });

  it('maps a 500 to server_error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 500,
      json: () => Promise.resolve({ error: 'failed to create checkout session' }),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'server_error' });
  });

  it('maps a network failure to server_error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'server_error' });
  });

  it('maps a 200 without url to server_error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const result = await signupViaBackend('https://api.test', {
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(result).toEqual({ ok: false, error: 'server_error' });
  });
});

describe('checkRateLimit', () => {
  it('allows the first request and blocks the second from the same IP', () => {
    expect(checkRateLimit('1.2.3.4')).toBe(true);
    expect(checkRateLimit('1.2.3.4')).toBe(false);
  });

  it('does not block different IPs', () => {
    expect(checkRateLimit('5.5.5.5')).toBe(true);
    expect(checkRateLimit('6.6.6.6')).toBe(true);
  });

  it('fails open when no IP is provided', () => {
    expect(checkRateLimit('')).toBe(true);
    expect(checkRateLimit('')).toBe(true);
  });
});
