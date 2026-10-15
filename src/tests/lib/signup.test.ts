import { describe, expect, test } from 'vitest';
import { PLANS, SIGNUP_BASE_URL, planFromSearch, signupUrl } from '../../lib/signup';

/**
 * Account creation happens on cloud.nan.builders; the site only builds links
 * to it. Plans mirror the platform's /signup?plan= enum (OPEN-SIGNUP.md §2.3).
 */

describe('plans', () => {
  test('match the platform enum', () => {
    expect([...PLANS]).toEqual(['community', 'inference', 'premium', 'workspace', 'space']);
  });

  test('planFromSearch reads ?plan= from the enum only', () => {
    expect(planFromSearch('?plan=premium')).toBe('premium');
    expect(planFromSearch('?plan=workspace')).toBe('workspace');
    expect(planFromSearch('?plan=gold')).toBeUndefined();
    expect(planFromSearch('')).toBeUndefined();
  });

  test('legacy ?premium=1 links (old pricing card) still mean premium', () => {
    expect(planFromSearch('?premium=1')).toBe('premium');
    expect(planFromSearch('?premium=0')).toBeUndefined();
  });
});

describe('signupUrl', () => {
  test('points at the platform signup, with the plan when given', () => {
    expect(SIGNUP_BASE_URL).toBe('https://cloud.nan.builders/signup');
    expect(signupUrl()).toBe('https://cloud.nan.builders/signup');
    expect(signupUrl('community')).toBe('https://cloud.nan.builders/signup?plan=community');
  });
});
