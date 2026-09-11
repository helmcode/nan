import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  env: {
    CLOUD_API_URL: 'https://cloud-api.nan.builders',
  },
}));

import { POST } from '../../pages/api/community-signup';
import { __resetRateLimitForTests } from '../../lib/communitySignup';

let ipCounter = 0;

function nextIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://nan.builders/api/community-signup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': nextIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown, headers: Record<string, string> = {}) {
  const request = jsonRequest(body, headers);
  const response = await (POST as any)({ request });
  const payload = await response.json();
  return { status: response.status, payload };
}

function mockBackend(status: number, payload: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(payload),
  }) as unknown as typeof fetch;
}

describe('POST /api/community-signup', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetRateLimitForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the Stripe Checkout URL on success', async () => {
    globalThis.fetch = mockBackend(200, { url: 'https://checkout.stripe.com/c/pay/abc' });

    const { status, payload } = await callPost({ email: 'alice@acme.co', region: 'EU' });
    expect(status).toBe(200);
    expect(payload).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/abc' });
  });

  it('returns 409 when the backend says already_subscribed', async () => {
    globalThis.fetch = mockBackend(409, { error: 'already_subscribed' });

    const { status, payload } = await callPost({ email: 'alice@acme.co', region: 'EU' });
    expect(status).toBe(409);
    expect(payload).toEqual({ ok: false, error: 'already_subscribed' });
  });

  it('returns invalid_email for malformed addresses', async () => {
    globalThis.fetch = mockBackend(200, { url: 'unused' });

    const { status, payload } = await callPost({ email: 'not-an-email', region: 'EU' });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('returns invalid_region for unknown region', async () => {
    globalThis.fetch = mockBackend(200, { url: 'unused' });

    const { status, payload } = await callPost({ email: 'alice@acme.co', region: 'AF' });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_region' });
  });

  it('rejects non-JSON content-type with 415', async () => {
    const request = new Request('https://nan.builders/api/community-signup', {
      method: 'POST',
      headers: { 'cf-connecting-ip': nextIp() },
      body: 'email=alice@acme.co',
    });
    const response = await (POST as any)({ request });
    expect(response.status).toBe(415);
  });

  it('rejects invalid JSON body with 400', async () => {
    const request = new Request('https://nan.builders/api/community-signup', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': nextIp(),
      },
      body: '{not json',
    });
    const response = await (POST as any)({ request });
    expect(response.status).toBe(400);
  });

  it('traps honeypot submissions without calling backend', async () => {
    const fetchMock = mockBackend(200, { url: 'real-url' });
    globalThis.fetch = fetchMock;

    const { status, payload } = await callPost({
      email: 'bot@acme.co',
      region: 'EU',
      _hp: 'spam',
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    // The honeypot URL is a benign nan.builders URL, not the Stripe one.
    expect(payload.url).toContain('nan.builders');
    // Backend should not have been called.
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('rate-limits repeat attempts from the same IP', async () => {
    globalThis.fetch = mockBackend(200, { url: 'https://checkout.stripe.com/c/x' });

    const sameIp = '99.99.99.99';
    const first = await callPost({ email: 'first@acme.co', region: 'EU' }, { 'cf-connecting-ip': sameIp });
    expect(first.status).toBe(200);

    const second = await callPost({ email: 'second@acme.co', region: 'EU' }, { 'cf-connecting-ip': sameIp });
    expect(second.status).toBe(429);
    expect(second.payload).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('forwards content-type and origin to the backend (no X-API-Key)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/c/x' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await callPost({ email: 'check@acme.co', region: 'EU' });

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://cloud-api.nan.builders/api/community/signup');
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('returns server_error when the backend fails', async () => {
    globalThis.fetch = mockBackend(500, { error: 'internal' });

    const { status, payload } = await callPost({ email: 'fail@acme.co', region: 'EU' });
    expect(status).toBe(500);
    expect(payload).toEqual({ ok: false, error: 'server_error' });
  });
});
