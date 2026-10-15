/**
 * Open signup: validation, normalization and response parsing shared by the
 * hero form (scripts/signup.ts, in the browser) and the Worker route
 * (pages/api/signup.ts, at the edge).
 *
 * One implementation on purpose: the client and the server must accept
 * exactly the same input, or a person sees an error they cannot understand.
 * The rules mirror cloud-api's POST /api/auth/signup (see
 * platform/cloud-api/docs/OPEN-SIGNUP.md §2.3), which stays the authority.
 *
 * No i18n and no DOM here, so it is cheap to ship to the browser and easy to
 * test.
 */

export const SIGNUP_BASE_URL = 'https://cloud.nan.builders/signup';

export const JOB_ROLES = [
  'software_engineer',
  'ai_engineer',
  'data_scientist',
  'devops_sre',
  'founder',
  'product',
  'designer',
  'researcher',
  'student',
  'other',
] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const PLANS = ['community', 'inference', 'premium', 'workspace', 'space'] as const;
export type Plan = (typeof PLANS)[number];

export const SIGNUP_FIELDS = ['fullName', 'email', 'jobRole', 'jobRoleOther', 'xUrl', 'linkedinUrl'] as const;
export type SignupField = (typeof SIGNUP_FIELDS)[number];
export type FieldError = 'required' | 'invalid' | 'too_long';
export type FieldErrors = Partial<Record<SignupField, FieldError>>;

const FULL_NAME_MAX = 120;
const JOB_ROLE_OTHER_MAX = 80;
const EMAIL_MAX = 254;
const URL_MAX = 200;

// Simple on purpose, no nested quantifiers (no catastrophic backtracking).
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// RFC 2606 reserved names plus throwaway domains seen on the old form.
// Keep in sync with cloud-api's signup blocklist.
export const BLOCKED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
]);
export const BLOCKED_EMAIL_TLDS: ReadonlySet<string> = new Set(['test', 'invalid', 'localhost', 'example']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface SignupInput {
  fullName: string;
  email: string;
  jobRole: JobRole;
  jobRoleOther: string;
  xUrl: string;
  linkedinUrl: string;
  plan?: Plan;
}

export type SignupValidation =
  | { ok: true; input: SignupInput; honeypot: boolean }
  | { ok: false; fields: FieldErrors };

export function isJobRole(v: unknown): v is JobRole {
  return typeof v === 'string' && (JOB_ROLES as readonly string[]).includes(v);
}

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v);
}

export function isSignupField(v: unknown): v is SignupField {
  return typeof v === 'string' && (SIGNUP_FIELDS as readonly string[]).includes(v);
}

/** Platform signup URL, with the plan the person picked (if any). */
export function signupUrl(plan?: Plan): string {
  return plan ? `${SIGNUP_BASE_URL}?plan=${plan}` : SIGNUP_BASE_URL;
}

/**
 * Plan carried in the page URL. `?premium=1` is the old premium pricing card
 * link, still out there in shared links and bookmarks.
 */
export function planFromSearch(search: string): Plan | undefined {
  const params = new URLSearchParams(search);
  const plan = params.get('plan');
  if (isPlan(plan)) return plan;
  if (params.get('premium') === '1') return 'premium';
  return undefined;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const chars = (s: string): number => Array.from(s).length;

function isBlockedEmailDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true;
  return BLOCKED_EMAIL_TLDS.has(domain.slice(domain.lastIndexOf('.') + 1));
}

/** Trim, upgrade http to https and add the scheme people usually leave out. */
export function normalizeSocialUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/^http:\/\//i.test(v)) return `https://${v.slice(7)}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return `https://${v}`;
  return v;
}

function parseHttps(value: string): URL | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return u;
  } catch {
    return null;
  }
}

type UrlCheck = { ok: true; value: string } | { ok: false; error: FieldError };

/**
 * X profile. The backend accepts `https://x.com/...` and
 * `https://twitter.com/...` only, so `www.` is folded away here instead of
 * bouncing a perfectly good link.
 */
function checkXUrl(raw: string): UrlCheck {
  const u = parseHttps(raw);
  if (!u) return { ok: false, error: 'invalid' };
  const host = u.hostname.toLowerCase().replace(/^(www|mobile)\./, '');
  if (host !== 'x.com' && host !== 'twitter.com') return { ok: false, error: 'invalid' };
  if (!/^\/[^/]+/.test(u.pathname)) return { ok: false, error: 'invalid' };
  return { ok: true, value: `https://${host}${u.pathname}${u.search}` };
}

/**
 * LinkedIn profile: `https://(www.)linkedin.com/in/...`. Country subdomains
 * (`es.linkedin.com`) are what LinkedIn itself hands out, so they become `www`.
 */
function checkLinkedinUrl(raw: string): UrlCheck {
  const u = parseHttps(raw);
  if (!u) return { ok: false, error: 'invalid' };
  const host = u.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !/^[a-z]{2,3}\.linkedin\.com$/.test(host)) return { ok: false, error: 'invalid' };
  if (!/^\/in\/[^/]+/.test(u.pathname)) return { ok: false, error: 'invalid' };
  const path = u.pathname.replace(/\/$/, '');
  return { ok: true, value: `https://www.linkedin.com${path}${u.search}` };
}

function checkOptionalUrl(value: unknown, check: (raw: string) => UrlCheck): UrlCheck {
  const v = normalizeSocialUrl(typeof value === 'string' ? value : '');
  if (!v) return { ok: true, value: '' };
  if (chars(v) > URL_MAX) return { ok: false, error: 'too_long' };
  return check(v);
}

export function validateSignup(raw: unknown): SignupValidation {
  const obj: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: FieldErrors = {};

  const fullName = str(obj.fullName);
  if (!fullName) fields.fullName = 'required';
  else if (chars(fullName) > FULL_NAME_MAX) fields.fullName = 'too_long';
  else if (CONTROL_CHARS.test(fullName)) fields.fullName = 'invalid';

  const email = str(obj.email).toLowerCase();
  if (!email) fields.email = 'required';
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email) || isBlockedEmailDomain(email)) fields.email = 'invalid';

  const jobRoleRaw = str(obj.jobRole);
  let jobRoleOther = '';
  if (!jobRoleRaw) fields.jobRole = 'required';
  else if (!isJobRole(jobRoleRaw)) fields.jobRole = 'invalid';
  else if (jobRoleRaw === 'other') {
    jobRoleOther = str(obj.jobRoleOther);
    if (!jobRoleOther) fields.jobRoleOther = 'required';
    else if (chars(jobRoleOther) > JOB_ROLE_OTHER_MAX) fields.jobRoleOther = 'too_long';
    else if (CONTROL_CHARS.test(jobRoleOther)) fields.jobRoleOther = 'invalid';
  }

  const x = checkOptionalUrl(obj.xUrl, checkXUrl);
  if (!x.ok) fields.xUrl = x.error;
  const li = checkOptionalUrl(obj.linkedinUrl, checkLinkedinUrl);
  if (!li.ok) fields.linkedinUrl = li.error;

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const input: SignupInput = {
    fullName,
    email,
    jobRole: jobRoleRaw as JobRole,
    jobRoleOther,
    xUrl: x.ok ? x.value : '',
    linkedinUrl: li.ok ? li.value : '',
  };
  // A plan comes from the URL, not from the person: an unknown one is dropped,
  // never an error they cannot fix.
  if (isPlan(obj.plan)) input.plan = obj.plan;

  // Honeypot: flagged, not rejected, so a bot gets the same answer as a person.
  const honeypot = str(obj._hp).length > 0;
  return { ok: true, input, honeypot };
}

/** Keeps only known fields and known error codes from an untrusted body. */
export function sanitizeFieldErrors(value: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!isSignupField(k)) continue;
    out[k] = v === 'required' || v === 'too_long' ? v : 'invalid';
  }
  return out;
}

export type SignupResult =
  | { ok: true }
  | { ok: false; error: 'invalid_input'; fields: FieldErrors }
  | { ok: false; error: 'rate_limited' | 'server_error' | 'network_error' };

/** Response of the same-origin /api/signup route, as the form sees it. */
export function parseSignupResponse(status: number, body: unknown): SignupResult {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (status === 400) return { ok: false, error: 'invalid_input', fields: sanitizeFieldErrors(data?.fields) };
  if (status === 429) return { ok: false, error: 'rate_limited' };
  if ((status === 202 || status === 200) && data?.ok === true) return { ok: true };
  return { ok: false, error: 'server_error' };
}

/** The strings the hero serializes into data-msgs. */
export interface SignupMessages {
  errFullName: string;
  errEmail: string;
  errJobRole: string;
  errJobRoleOther: string;
  errXUrl: string;
  errLinkedinUrl: string;
  errFields: string;
  errRateLimited: string;
  errNetwork: string;
  errGeneric: string;
}

const FIELD_MESSAGE: Record<SignupField, keyof SignupMessages> = {
  fullName: 'errFullName',
  email: 'errEmail',
  jobRole: 'errJobRole',
  jobRoleOther: 'errJobRoleOther',
  xUrl: 'errXUrl',
  linkedinUrl: 'errLinkedinUrl',
};

/** Message shown under one field. */
export function fieldErrorText(field: SignupField, m: SignupMessages): string {
  return m[FIELD_MESSAGE[field]];
}

/** Message for the form status line after a failed submit. */
export function signupErrorText(result: Exclude<SignupResult, { ok: true }>, m: SignupMessages): string {
  switch (result.error) {
    case 'invalid_input':
      return m.errFields;
    case 'rate_limited':
      return m.errRateLimited;
    case 'network_error':
      return m.errNetwork;
    default:
      return m.errGeneric;
  }
}
