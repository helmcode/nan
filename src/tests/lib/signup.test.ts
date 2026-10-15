import { describe, expect, test } from 'vitest';
import {
  JOB_ROLES,
  PLANS,
  SIGNUP_BASE_URL,
  normalizeSocialUrl,
  parseSignupResponse,
  planFromSearch,
  signupErrorText,
  signupUrl,
  validateSignup,
  type SignupMessages,
} from '../../lib/signup';

/**
 * Spec: platform/cloud-api/docs/OPEN-SIGNUP.md §2.3 (POST /api/auth/signup).
 * The site mirrors the backend rules so a person sees the error next to the
 * field instead of after a round-trip. The backend stays the authority.
 */

const valid = {
  fullName: 'Ada Lovelace',
  email: 'ada@helmcode.com',
  jobRole: 'ai_engineer',
  jobRoleOther: '',
  xUrl: '',
  linkedinUrl: '',
};

function fieldsOf(raw: unknown) {
  const r = validateSignup(raw);
  return r.ok ? {} : r.fields;
}

describe('enums match the spec', () => {
  test('job roles', () => {
    expect([...JOB_ROLES]).toEqual([
      'software_engineer', 'ai_engineer', 'data_scientist', 'devops_sre',
      'founder', 'product', 'designer', 'researcher', 'student', 'other',
    ]);
  });

  test('plans', () => {
    expect([...PLANS]).toEqual(['community', 'inference', 'premium', 'workspace', 'space']);
  });
});

describe('validateSignup: required fields', () => {
  test('a complete minimal payload is valid and normalized', () => {
    const r = validateSignup({ ...valid, fullName: '  Ada Lovelace ', email: ' Ada@Helmcode.com ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@helmcode.com',
      jobRole: 'ai_engineer',
      jobRoleOther: '',
      xUrl: '',
      linkedinUrl: '',
    });
    expect(r.honeypot).toBe(false);
  });

  test('non-object bodies fail on every required field', () => {
    for (const raw of [null, 'x', 42, [], undefined]) {
      expect(fieldsOf(raw)).toMatchObject({ fullName: 'required', email: 'required', jobRole: 'required' });
    }
  });

  test('fullName: required, 1-120 chars, no control chars', () => {
    expect(fieldsOf({ ...valid, fullName: '' }).fullName).toBe('required');
    expect(fieldsOf({ ...valid, fullName: '   ' }).fullName).toBe('required');
    expect(fieldsOf({ ...valid, fullName: 'a'.repeat(120) }).fullName).toBeUndefined();
    expect(fieldsOf({ ...valid, fullName: 'a'.repeat(121) }).fullName).toBe('too_long');
    expect(fieldsOf({ ...valid, fullName: 'Ada\nLovelace' }).fullName).toBe('invalid');
    expect(fieldsOf({ ...valid, fullName: 42 }).fullName).toBe('required');
    // counted in characters, not UTF-16 units
    expect(fieldsOf({ ...valid, fullName: 'ñ'.repeat(120) }).fullName).toBeUndefined();
    expect(fieldsOf({ ...valid, fullName: '😀'.repeat(120) }).fullName).toBeUndefined();
  });

  test('mail.com is a real provider and is accepted', () => {
    expect(fieldsOf({ ...valid, email: 'ada@mail.com' }).email).toBeUndefined();
  });

  test('email: required, valid format, length, blocked domains', () => {
    expect(fieldsOf({ ...valid, email: '' }).email).toBe('required');
    expect(fieldsOf({ ...valid, email: 'not-an-email' }).email).toBe('invalid');
    expect(fieldsOf({ ...valid, email: 'a'.repeat(250) + '@helmcode.com' }).email).toBe('invalid');
    for (const d of ['example.com', 'example.net', 'example.org', 'test.com', 'x.test', 'x.invalid', 'x.localhost', 'x.example']) {
      expect(fieldsOf({ ...valid, email: `someone@${d}` }).email, d).toBe('invalid');
    }
  });

  test('jobRole: required enum', () => {
    expect(fieldsOf({ ...valid, jobRole: '' }).jobRole).toBe('required');
    expect(fieldsOf({ ...valid, jobRole: 'ceo' }).jobRole).toBe('invalid');
    for (const role of JOB_ROLES.filter((r) => r !== 'other')) {
      expect(validateSignup({ ...valid, jobRole: role }).ok, role).toBe(true);
    }
  });

  test('jobRoleOther: required (1-80) iff jobRole is other', () => {
    expect(fieldsOf({ ...valid, jobRole: 'other', jobRoleOther: '' }).jobRoleOther).toBe('required');
    expect(fieldsOf({ ...valid, jobRole: 'other', jobRoleOther: '  ' }).jobRoleOther).toBe('required');
    expect(fieldsOf({ ...valid, jobRole: 'other', jobRoleOther: 'b'.repeat(81) }).jobRoleOther).toBe('too_long');
    const ok = validateSignup({ ...valid, jobRole: 'other', jobRoleOther: ' Sound engineer ' });
    expect(ok.ok && ok.input.jobRoleOther).toBe('Sound engineer');
  });

  test('jobRoleOther is dropped when the role is not other', () => {
    const r = validateSignup({ ...valid, jobRole: 'founder', jobRoleOther: 'leftover text' });
    expect(r.ok && r.input.jobRoleOther).toBe('');
  });

  test('reports every invalid field at once', () => {
    expect(Object.keys(fieldsOf({ fullName: '', email: 'x', jobRole: 'nope', xUrl: 'https://evil.com/a' })).sort())
      .toEqual(['email', 'fullName', 'jobRole', 'xUrl']);
  });
});

describe('blocked email domains (kept in sync with cloud-api)', () => {
  test('the list is exactly this', async () => {
    const { BLOCKED_EMAIL_DOMAINS, BLOCKED_EMAIL_TLDS } = await import('../../lib/signup');
    expect([...BLOCKED_EMAIL_DOMAINS].sort()).toEqual(['example.com', 'example.net', 'example.org', 'test.com']);
    expect([...BLOCKED_EMAIL_TLDS].sort()).toEqual(['example', 'invalid', 'localhost', 'test']);
  });
});

describe('validateSignup: optional social URLs', () => {
  test('empty is fine', () => {
    expect(validateSignup({ ...valid, xUrl: '   ', linkedinUrl: '' }).ok).toBe(true);
  });

  test('x.com and twitter.com profiles are accepted', () => {
    for (const u of ['https://x.com/ada', 'https://twitter.com/ada', 'https://x.com/ada?s=21']) {
      expect(fieldsOf({ ...valid, xUrl: u }).xUrl, u).toBeUndefined();
    }
  });

  test('X: anything else is invalid', () => {
    for (const u of [
      'https://evil.com/ada', 'https://x.com', 'https://x.com/', 'https://x.com.evil.com/ada',
      'javascript:alert(1)', 'https://user:pass@x.com/ada', 'https://x.com:8443/ada', 'ftp://x.com/ada',
    ]) {
      expect(fieldsOf({ ...valid, xUrl: u }).xUrl, u).toBe('invalid');
    }
  });

  test('LinkedIn: only /in/ profiles on linkedin.com', () => {
    for (const u of ['https://linkedin.com/in/ada', 'https://www.linkedin.com/in/ada/']) {
      expect(fieldsOf({ ...valid, linkedinUrl: u }).linkedinUrl, u).toBeUndefined();
    }
    for (const u of [
      'https://linkedin.com/company/nan', 'https://linkedin.com/in/', 'https://evil.com/in/ada',
      'https://linkedin.com.evil.com/in/ada', 'data:text/html,hi',
    ]) {
      expect(fieldsOf({ ...valid, linkedinUrl: u }).linkedinUrl, u).toBe('invalid');
    }
  });

  test('URLs are normalized to the exact shape the backend accepts', () => {
    const r = validateSignup({
      ...valid,
      xUrl: 'www.twitter.com/ada',
      linkedinUrl: 'http://es.linkedin.com/in/ada',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.xUrl).toBe('https://twitter.com/ada');
    expect(r.input.linkedinUrl).toBe('https://www.linkedin.com/in/ada');
  });

  test('overlong URLs are rejected', () => {
    expect(fieldsOf({ ...valid, xUrl: 'https://x.com/' + 'a'.repeat(300) }).xUrl).toBe('too_long');
  });
});

describe('normalizeSocialUrl', () => {
  test('adds https, upgrades http, trims', () => {
    expect(normalizeSocialUrl(' x.com/ada ')).toBe('https://x.com/ada');
    expect(normalizeSocialUrl('http://x.com/ada')).toBe('https://x.com/ada');
    expect(normalizeSocialUrl('')).toBe('');
  });
});

describe('honeypot', () => {
  test('a filled _hp is flagged, not rejected (bots get no signal)', () => {
    const r = validateSignup({ ...valid, _hp: 'I am a bot' });
    expect(r.ok && r.honeypot).toBe(true);
  });
});

describe('plan', () => {
  test('planFromSearch reads ?plan= from the enum only', () => {
    expect(planFromSearch('?plan=premium')).toBe('premium');
    expect(planFromSearch('?plan=workspace')).toBe('workspace');
    expect(planFromSearch('?plan=gold')).toBeUndefined();
    expect(planFromSearch('')).toBeUndefined();
  });

  test('legacy ?premium=1 links (old pricing card) still mean premium', () => {
    expect(planFromSearch('?premium=1')).toBe('premium');
  });

  test('validateSignup keeps a valid plan and silently drops an invalid one', () => {
    const a = validateSignup({ ...valid, plan: 'community' });
    expect(a.ok && a.input.plan).toBe('community');
    const b = validateSignup({ ...valid, plan: 'gold' });
    expect(b.ok).toBe(true);
    expect(b.ok && 'plan' in b.input).toBe(false);
  });

  test('signupUrl points at the platform signup', () => {
    expect(SIGNUP_BASE_URL).toBe('https://cloud.nan.builders/signup');
    expect(signupUrl()).toBe('https://cloud.nan.builders/signup');
    expect(signupUrl('premium')).toBe('https://cloud.nan.builders/signup?plan=premium');
  });
});

describe('parseSignupResponse', () => {
  test('202 is success', () => {
    expect(parseSignupResponse(202, { ok: true })).toEqual({ ok: true });
  });

  test('400 carries field errors, sanitized', () => {
    expect(parseSignupResponse(400, { ok: false, error: 'invalid_input', fields: { email: 'invalid', evil: 'x', xUrl: 'weird' } }))
      .toEqual({ ok: false, error: 'invalid_input', fields: { email: 'invalid', xUrl: 'invalid' } });
    expect(parseSignupResponse(400, null)).toEqual({ ok: false, error: 'invalid_input', fields: {} });
  });

  test('429 is rate limited', () => {
    expect(parseSignupResponse(429, { ok: false, error: 'rate_limited' })).toEqual({ ok: false, error: 'rate_limited' });
  });

  test('anything else is a server error', () => {
    expect(parseSignupResponse(500, {})).toEqual({ ok: false, error: 'server_error' });
    expect(parseSignupResponse(502, null)).toEqual({ ok: false, error: 'server_error' });
    expect(parseSignupResponse(200, 'nope')).toEqual({ ok: false, error: 'server_error' });
  });
});

describe('signupErrorText', () => {
  const m: SignupMessages = {
    errFullName: 'name', errEmail: 'email', errJobRole: 'role', errJobRoleOther: 'other',
    errXUrl: 'x', errLinkedinUrl: 'li', errFields: 'fields', errRateLimited: 'rate',
    errNetwork: 'net', errGeneric: 'generic',
  };

  test('maps each failure to its message', () => {
    expect(signupErrorText({ ok: false, error: 'rate_limited' }, m)).toBe('rate');
    expect(signupErrorText({ ok: false, error: 'server_error' }, m)).toBe('generic');
    expect(signupErrorText({ ok: false, error: 'network_error' }, m)).toBe('net');
    expect(signupErrorText({ ok: false, error: 'invalid_input', fields: {} }, m)).toBe('fields');
    expect(signupErrorText({ ok: false, error: 'invalid_input', fields: { email: 'invalid' } }, m)).toBe('fields');
  });
});

describe('fieldErrorText', () => {
  test('each field has its own message', async () => {
    const { fieldErrorText, SIGNUP_FIELDS } = await import('../../lib/signup');
    const m = {
      errFullName: 'a', errEmail: 'b', errJobRole: 'c', errJobRoleOther: 'd', errXUrl: 'e',
      errLinkedinUrl: 'f', errFields: 'g', errRateLimited: 'h', errNetwork: 'i', errGeneric: 'j',
    };
    expect(SIGNUP_FIELDS.map((f) => fieldErrorText(f, m))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
