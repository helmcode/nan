import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Note: this file lives in src/tests/api/ (NOT src/pages/api/) to avoid
// Astro/Rollup bundling it as a route. Vitest picks it up via the
// `src/**/*.test.ts` include in vitest.config.ts.

vi.mock('cloudflare:workers', () => ({
  env: {
    CLOUD_API_URL: 'https://cloud-api.nan.builders',
    CLOUD_API_WAITLIST_KEY: 'test-waitlist-key',
    RESEND_API_KEY: 'test_resend_key',
    RESEND_FROM_EMAIL: 'Cristian · NaN <cristian@nan.builders>',
  },
}));

// Import AFTER vi.mock so the handler sees the mocked env.
import { POST } from '../../pages/api/waitlist';

let ipCounter = 0;

function nextIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request('https://nan.builders/api/waitlist', {
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

/** Creates a mock fetch that simulates the cloud-api backend. */
function mockBackendFetch(overrides: {
  registerStatus?: number;
  registerOk?: boolean;
  registerBody?: any;
  registerText?: string;
} = {}) {
  const {
    registerStatus = 201,
    registerOk = true,
    registerBody,
    registerText,
  } = overrides;

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // Resend email API
    if (url === 'https://api.resend.com/emails') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'resend_mock' }),
      });
    }

    // cloud-api register endpoint
    if (url === 'https://cloud-api.nan.builders/api/waitlist/register') {
      if (registerOk) {
        const body = JSON.parse(init?.body as string);
        const responseBody = registerBody ?? {
          email: body.email,
          region: body.region,
          position: body.region === 'EU' ? 42 : 0,
        };
        return Promise.resolve({
          ok: true,
          status: registerStatus,
          json: () => Promise.resolve(responseBody),
        });
      }
      return Promise.resolve({
        ok: registerStatus < 400 ? true : false,
        status: registerStatus,
        json: () => Promise.resolve(registerBody),
        text: () => Promise.resolve(registerText ?? 'error'),
      });
    }

    // Fallback
    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('not found') });
  });
}

describe('POST /api/waitlist', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockBackendFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts a valid EU signup', async () => {
    const { status, payload } = await callPost({
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      position: 42,
      status: 'registered',
      region: 'EU',
    });
  });

  it('accepts a LATAM signup as interest', async () => {
    const { status, payload } = await callPost({
      email: 'luis@acme.co',
      region: 'LATAM',
    });
    expect(status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      position: 0,
      status: 'interest',
      region: 'LATAM',
    });
  });

  it('returns invalid_email for a malformed address', async () => {
    const { status, payload } = await callPost({
      email: 'not-an-email',
      region: 'EU',
    });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('returns invalid_region when region is missing', async () => {
    const { status, payload } = await callPost({ email: 'alice@acme.co' });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_region' });
  });

  it('returns invalid_region when region is unknown', async () => {
    const { status, payload } = await callPost({
      email: 'alice@acme.co',
      region: 'AF',
    });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_region' });
  });

  it('rejects a request without JSON content-type', async () => {
    const request = new Request('https://nan.builders/api/waitlist', {
      method: 'POST',
      headers: { 'cf-connecting-ip': nextIp() },
      body: 'email=alice@acme.co',
    });
    const response = await (POST as any)({ request });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('rejects an invalid JSON body', async () => {
    const request = new Request('https://nan.builders/api/waitlist', {
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

  it('handles 409 duplicate from backend as success', async () => {
    globalThis.fetch = mockBackendFetch({
      registerStatus: 409,
      registerOk: false,
      registerText: '{"error":"email already registered"}',
    });

    const { status, payload } = await callPost({
      email: 'alice@acme.co',
      region: 'EU',
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('registered');
  });

  it('rate-limits repeat attempts from the same IP', async () => {
    const sameIp = '99.99.99.99';
    const first = await callPost(
      { email: 'first@acme.co', region: 'EU' },
      { 'cf-connecting-ip': sameIp },
    );
    expect(first.status).toBe(200);

    const second = await callPost(
      { email: 'second@acme.co', region: 'EU' },
      { 'cf-connecting-ip': sameIp },
    );
    expect(second.status).toBe(429);
    expect(second.payload).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('traps honeypot submissions without calling backend', async () => {
    const { status, payload } = await callPost({
      email: 'bot@acme.co',
      region: 'EU',
      _hp: 'spam.biz',
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.position).toBe(0);

    // Backend register should not have been called (only Resend could be called)
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const registerCall = fetchMock.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as string).includes('/api/waitlist/register'),
    );
    expect(registerCall).toBeUndefined();
  });

  it('rejects signups from reserved/test email domains', async () => {
    const { status, payload } = await callPost({
      email: 'trash@example.com',
      region: 'EU',
    });
    expect(status).toBe(400);
    expect(payload).toEqual({ ok: false, error: 'invalid_email' });
  });

  it('sends a confirmation email on successful signup', async () => {
    await callPost({ email: 'new@acme.co', region: 'EU' });

    // Allow the email promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const resendCall = fetchMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'https://api.resend.com/emails',
    );
    expect(resendCall).toBeDefined();
    const body = JSON.parse(resendCall![1].body);
    expect(body.to).toBe('new@acme.co');
    expect(body.subject).toContain('lista de espera');
  });

  it('does not send confirmation email for honeypot submissions', async () => {
    await callPost({ email: 'bot@acme.co', region: 'EU', _hp: 'spam' });

    await new Promise((r) => setTimeout(r, 10));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const resendCall = fetchMock.mock.calls.find(
      (call: unknown[]) => call[0] === 'https://api.resend.com/emails',
    );
    expect(resendCall).toBeUndefined();
  });

  it('returns server_error when backend returns 500', async () => {
    globalThis.fetch = mockBackendFetch({
      registerStatus: 500,
      registerOk: false,
      registerText: 'internal error',
    });

    const { status, payload } = await callPost({
      email: 'fail@acme.co',
      region: 'EU',
    });
    expect(status).toBe(500);
    expect(payload).toEqual({ ok: false, error: 'server_error' });
  });

  it('forwards correct API key and content-type to backend', async () => {
    await callPost({ email: 'check@acme.co', region: 'EU' });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const registerCall = fetchMock.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as string).includes('/api/waitlist/register'),
    );
    expect(registerCall).toBeDefined();
    expect(registerCall![1].headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-API-Key': 'test-waitlist-key',
    });
  });
});
