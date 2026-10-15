import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Lives in src/tests/api/ (not src/pages/api/) so Astro does not bundle it as a route.

vi.mock('cloudflare:workers', () => ({
  env: { CLOUD_API_URL: 'https://cloud-api.nan.builders/' },
}));

import { POST } from '../../pages/api/signup';
import { resetSignupRateLimit, SIGNUP_RATE_LIMIT } from '../../lib/signupServer';

const UPSTREAM = 'https://cloud-api.nan.builders/api/auth/signup';

const valid = {
  fullName: 'Ada Lovelace',
  email: 'ada@helmcode.com',
  jobRole: 'ai_engineer',
  jobRoleOther: '',
  xUrl: 'https://x.com/ada',
  linkedinUrl: '',
  plan: 'premium',
  _hp: '',
};

let ipCounter = 0;
const nextIp = () => `10.0.${(++ipCounter >> 8) & 255}.${ipCounter & 255}`;

function request(
  body: unknown,
  opts: { ip?: string; contentType?: string; raw?: string; headers?: Record<string, string> } = {},
) {
  return new Request('https://nan.builders/api/signup', {
    method: 'POST',
    headers: {
      'content-type': opts.contentType ?? 'application/json',
      'cf-connecting-ip': opts.ip ?? nextIp(),
      ...opts.headers,
    },
    body: opts.raw ?? JSON.stringify(body),
  });
}

async function call(body: unknown, opts: Parameters<typeof request>[1] = {}) {
  const res: Response = await (POST as any)({ request: request(body, opts) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers, text };
}

function upstream(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

beforeEach(() => {
  resetSignupRateLimit();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/signup: proxy', () => {
  it('forwards a valid signup to cloud-api /api/auth/signup and answers 202', async () => {
    const fetchMock = upstream(202, { ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const r = await call(valid, { ip: '203.0.113.7', headers: { 'cf-ipcountry': 'ES' } });

    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UPSTREAM);
    expect(init.method).toBe('POST');
    const h = new Headers(init.headers);
    expect(h.get('origin')).toBe('https://nan.builders');
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(h.get('cf-connecting-ip')).toBe('203.0.113.7');
    // the backend derives the billing region from the visitor country
    expect(h.get('cf-ipcountry')).toBe('ES');
    // public endpoint: no API key of any kind
    expect(h.get('x-api-key')).toBeNull();
    expect(h.get('authorization')).toBeNull();
    expect(JSON.parse(init.body)).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@helmcode.com',
      jobRole: 'ai_engineer',
      jobRoleOther: '',
      xUrl: 'https://x.com/ada',
      linkedinUrl: '',
      plan: 'premium',
      _hp: '',
    });
  });

  it('forwards the normalized values, not the raw ones', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    await call({ ...valid, email: ' ADA@Helmcode.com', xUrl: 'x.com/ada', plan: 'gold' });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.email).toBe('ada@helmcode.com');
    expect(sent.xUrl).toBe('https://x.com/ada');
    expect(sent).not.toHaveProperty('plan');
  });

  it('any 2xx upstream is the same 202 (no account enumeration)', async () => {
    vi.stubGlobal('fetch', upstream(200, { created: false, state: 'subscribed' }));
    const r = await call(valid);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true });
  });

  it('upstream 400 becomes a 400 with sanitized field errors', async () => {
    vi.stubGlobal('fetch', upstream(400, { error: 'invalid_input', fields: { email: 'invalid', secret: 'x' } }));
    const r = await call(valid);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ ok: false, error: 'invalid_input', fields: { email: 'invalid' } });
  });

  it('upstream 400 naming a single field is understood too', async () => {
    vi.stubGlobal('fetch', upstream(400, { error: 'invalid_email', field: 'email' }));
    const r = await call(valid);
    expect(r.body).toEqual({ ok: false, error: 'invalid_input', fields: { email: 'invalid' } });
  });

  it('upstream 429 is a 429 rate_limited', async () => {
    vi.stubGlobal('fetch', upstream(429, { error: 'too many' }));
    const r = await call(valid);
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('upstream 5xx / 404 / 410 is an opaque 502', async () => {
    for (const s of [500, 503, 404, 410]) {
      vi.stubGlobal('fetch', upstream(s, { error: 'internal detail' }));
      const r = await call(valid);
      expect(r.status, String(s)).toBe(502);
      expect(r.body).toEqual({ ok: false, error: 'server_error' });
    }
  });

  it('a network failure is an opaque 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET at 10.0.0.1')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call(valid);
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ ok: false, error: 'server_error' });
  });
});

describe('POST /api/signup: validation (mirrors the backend)', () => {
  it('rejects invalid input with 400 and never calls upstream', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const r = await call({ ...valid, fullName: '', email: 'nope', jobRole: 'other', jobRoleOther: '', linkedinUrl: 'https://evil.com/in/a' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      ok: false,
      error: 'invalid_input',
      fields: { fullName: 'required', email: 'invalid', jobRoleOther: 'required', linkedinUrl: 'invalid' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward a malformed cf-ipcountry', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    await call(valid, { headers: { 'cf-ipcountry': 'ES\r\nx-evil: 1' } }).catch(() => null);
    await call(valid, { headers: { 'cf-ipcountry': 'spain' } });
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get('cf-ipcountry')).toBeNull();
    }
  });

  it('accepts application/json with parameters, matched exactly on the media type', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    expect((await call(valid, { contentType: 'Application/JSON; charset=utf-8' })).status).toBe(202);
    for (const ct of ['application/jsonx', 'text/plain; x=application/json', 'application/json-patch+json']) {
      expect((await call(valid, { contentType: ct })).status, ct).toBe(415);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('no-JS form post (urlencoded or multipart)', () => {
    const body = 'fullName=Ada+Secret&email=ada.secret%40helmcode.com&_hp=';

    async function post(ct: string, headers: Record<string, string> = {}) {
      const res: Response = await (POST as any)({ request: request(null, { contentType: ct, raw: body, headers }) });
      return { res, html: await res.text() };
    }

    it('answers a 415 HTML page, no JS, linking to the platform signup, without reading or echoing the body', async () => {
      const fetchMock = upstream(202);
      vi.stubGlobal('fetch', fetchMock);
      for (const ct of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
        const { res, html } = await post(ct);
        expect(res.status, ct).toBe(415);
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('location')).toBeNull();
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toContain('href="https://cloud.nan.builders/signup"');
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toMatch(/secret|helmcode/i);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('locks the page down with its own CSP (no scripts, inline styles only)', async () => {
      const { html } = await post('application/x-www-form-urlencoded');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain("style-src 'unsafe-inline'");
    });

    it('is dark, like the site', async () => {
      const { html } = await post('application/x-www-form-urlencoded');
      expect(html).toContain('#0B0B0C');
    });

    it('speaks Spanish when the form was posted from /es', async () => {
      const { html } = await post('application/x-www-form-urlencoded', { referer: 'https://nan.builders/es?plan=premium' });
      expect(html).toContain('<html lang="es">');
      expect(html).toMatch(/JavaScript/);
      expect(html).toMatch(/Crea tu cuenta/);
    });

    it('speaks English when the form was posted from the English home, whatever Accept-Language says', async () => {
      const { html } = await post('application/x-www-form-urlencoded', {
        referer: 'https://nan.builders/', 'accept-language': 'es-ES,es;q=0.9',
      });
      expect(html).toContain('<html lang="en">');
      expect(html).toMatch(/Create your account/);
    });

    it('falls back to Accept-Language without a usable Referer', async () => {
      const es = await post('application/x-www-form-urlencoded', { 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' });
      expect(es.html).toContain('<html lang="es">');
      const en = await post('application/x-www-form-urlencoded', { 'accept-language': 'en-GB,en;q=0.9,es;q=0.5' });
      expect(en.html).toContain('<html lang="en">');
      const none = await post('application/x-www-form-urlencoded');
      expect(none.html).toContain('<html lang="en">');
      const foreign = await post('application/x-www-form-urlencoded', { referer: 'https://evil.example/es', 'accept-language': 'en' });
      expect(foreign.html).toContain('<html lang="en">');
    });
  });

  it('rejects a non-JSON content type with 415', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const r = await call(valid, { contentType: 'text/plain' });
    expect(r.status).toBe(415);
    expect(r.body).toEqual({ ok: false, error: 'unsupported_media_type' });
    expect(r.text).not.toContain('ada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const r = await call(null, { raw: '{"fullName":' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_input');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized body with 413 without parsing it', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const r = await call(null, { raw: JSON.stringify({ ...valid, fullName: 'a'.repeat(20_000) }) });
    expect(r.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/signup: honeypot', () => {
  it('a filled _hp answers the same 202 and never reaches cloud-api', async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const r = await call({ ...valid, _hp: 'http://spam' });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/signup: per-IP rate limit', () => {
  it(`allows ${SIGNUP_RATE_LIMIT.limit} signups per window per IP, then 429 without calling upstream`, async () => {
    const fetchMock = upstream(202);
    vi.stubGlobal('fetch', fetchMock);
    const ip = '198.51.100.1';
    for (let i = 0; i < SIGNUP_RATE_LIMIT.limit; i++) {
      expect((await call(valid, { ip })).status).toBe(202);
    }
    const blocked = await call(valid, { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ ok: false, error: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(SIGNUP_RATE_LIMIT.limit);

    // another IP is unaffected
    expect((await call(valid, { ip: '198.51.100.2' })).status).toBe(202);
  });

  it('the window expires', async () => {
    vi.stubGlobal('fetch', upstream(202));
    vi.useFakeTimers();
    try {
      const ip = '198.51.100.3';
      for (let i = 0; i < SIGNUP_RATE_LIMIT.limit; i++) await call(valid, { ip });
      expect((await call(valid, { ip })).status).toBe(429);
      vi.advanceTimersByTime(SIGNUP_RATE_LIMIT.windowMs + 1);
      expect((await call(valid, { ip })).status).toBe(202);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalid submissions do not burn the quota (a person fixing typos is not throttled)', async () => {
    vi.stubGlobal('fetch', upstream(202));
    const ip = '198.51.100.4';
    for (let i = 0; i < SIGNUP_RATE_LIMIT.limit + 3; i++) {
      expect((await call({ ...valid, email: 'typo' }, { ip })).status).toBe(400);
    }
    expect((await call(valid, { ip })).status).toBe(202);
  });
});

describe('POST /api/signup: misconfiguration', () => {
  it('a missing CLOUD_API_URL is an opaque 502, not a crash', async () => {
    const { forwardSignup } = await import('../../lib/signupServer');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await forwardSignup('', {
      fullName: 'Ada', email: 'ada@helmcode.com', jobRole: 'founder', jobRoleOther: '', xUrl: '', linkedinUrl: '',
    }, { ip: '', country: '' });
    expect(out).toEqual({ kind: 'error' });
  });
});
