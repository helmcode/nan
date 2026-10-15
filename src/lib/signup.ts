/**
 * Links to account creation on the NaN platform.
 *
 * Signup itself lives on cloud.nan.builders (profile form, magic link,
 * checkout); the site only points there. `?plan=` preselects a product on the
 * platform's /signup and mirrors its enum (platform/cloud-api/docs/OPEN-SIGNUP.md
 * §2.3). A signed-in account landing on /signup is sent on to /welcome.
 */

export const SIGNUP_BASE_URL = 'https://cloud.nan.builders/signup';
export const LOGIN_URL = 'https://cloud.nan.builders/';

export const PLANS = ['community', 'inference', 'premium', 'workspace', 'space'] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v);
}

/** Platform signup URL, with the plan the person picked (if any). */
export function signupUrl(plan?: Plan): string {
  return plan ? `${SIGNUP_BASE_URL}?plan=${plan}` : SIGNUP_BASE_URL;
}

/**
 * Plan carried in the page URL. `?premium=1` is the old premium pricing card
 * link, still out there in shared links and bookmarks. Anything outside the
 * enum is dropped, so nothing from the query string reaches a link verbatim.
 */
export function planFromSearch(search: string): Plan | undefined {
  const params = new URLSearchParams(search);
  const plan = params.get('plan');
  if (isPlan(plan)) return plan;
  if (params.get('premium') === '1') return 'premium';
  return undefined;
}

/** The hero's Create account link, carrying the landing's ?plan= through. */
export function heroSignupHref(search: string): string {
  return signupUrl(planFromSearch(search));
}
