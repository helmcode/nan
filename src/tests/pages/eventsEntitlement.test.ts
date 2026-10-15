import { describe, expect, test } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tObj } from '../../lib/i18n';
import {
  HACKATHON_UNLOCK_URL,
  isEntitlementRequired,
  type MembershipStrings,
} from '../../lib/eventEntitlement';
import MembershipRequired from '../../components/events/MembershipRequired';
import { registerErrorKey } from '../../components/events/RegisterForm';
import { voteOutcome } from '../../components/events/VoteButton';

/**
 * Hackathons are unlocked by Community, Inference or Premium. For an account
 * without a plan cloud-api answers register / submission PUT / reassign / vote
 * with 403 {"error":"entitlement_required","capability":"hackathons",...}.
 * Every events form must say so and link to the community plan, instead of
 * "not eligible" or a generic error. `not_eligible` keeps its own message.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf-8');

const entitlementBody = {
  error: 'entitlement_required',
  capability: 'hackathons',
  unlockedBy: ['community', 'inference', 'premium'],
};

describe('entitlement_required detection', () => {
  test('matches the backend error code', () => {
    expect(isEntitlementRequired(entitlementBody.error)).toBe(true);
  });

  test('does not swallow the other codes', () => {
    for (const code of ['not_eligible', 'tier_restricted', 'registration_full', '', undefined, null]) {
      expect(isEntitlementRequired(code as string), String(code)).toBe(false);
    }
  });

  test('the CTA goes to the community plan (logged-in accounts land on /welcome?plan=community)', () => {
    expect(HACKATHON_UNLOCK_URL).toBe('https://cloud.nan.builders/signup?plan=community');
  });
});

describe('copy', () => {
  test.each(['en', 'es'] as const)('events.membership exists in %s', (locale) => {
    const m = tObj<MembershipStrings>('events.membership', locale);
    expect(m.message.trim().length).toBeGreaterThan(0);
    expect(m.cta.trim().length).toBeGreaterThan(0);
  });

  test('says who hackathons are for and the starting price', () => {
    const en = tObj<MembershipStrings>('events.membership', 'en');
    const es = tObj<MembershipStrings>('events.membership', 'es');
    expect(en.message).toBe('Hackathons are for NaN members. Join the community (from €14.99/month) to take part.');
    expect(es.message).toBe('Los hackathons son para miembros de NaN. Únete a la comunidad (desde 14,99 €/mes) para participar.');
  });
});

describe('MembershipRequired notice', () => {
  const t: MembershipStrings = { message: 'Hackathons are for NaN members.', cta: 'Join the community' };

  test('is an alert with the message and a link to the community plan', () => {
    const html = render(h(MembershipRequired, { t }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Hackathons are for NaN members.');
    expect(html).toContain(`href="${HACKATHON_UNLOCK_URL}"`);
    expect(html).toContain('Join the community');
  });

  test('has a compact variant for the vote button', () => {
    const html = render(h(MembershipRequired, { t, compact: true }));
    expect(html).toContain(`href="${HACKATHON_UNLOCK_URL}"`);
  });
});

describe('RegisterForm maps the backend answer', () => {
  test('entitlement_required is the membership notice, not "not eligible"', () => {
    expect(registerErrorKey(403, 'entitlement_required')).toBe('membership');
  });

  test('the other codes keep their messages', () => {
    expect(registerErrorKey(403, 'not_eligible')).toBe('errorEligible');
    expect(registerErrorKey(403, '')).toBe('errorEligible');
    expect(registerErrorKey(409, 'registration_full')).toBe('errorFull');
    expect(registerErrorKey(409, 'registration_closed')).toBe('errorClosed');
    expect(registerErrorKey(429, '')).toBe('errorRate');
    expect(registerErrorKey(400, 'discord_required')).toBe('errorDiscord');
    expect(registerErrorKey(500, '')).toBe('errorServer');
  });
});

describe('VoteButton maps the backend answer', () => {
  test('entitlement_required is the membership state', () => {
    expect(voteOutcome(403, 'entitlement_required')).toBe('membership');
  });

  test('the other codes keep their states', () => {
    expect(voteOutcome(401, '')).toBe('login');
    expect(voteOutcome(400, 'self_vote')).toBe('self');
    expect(voteOutcome(403, 'not_eligible')).toBe('not_eligible');
    expect(voteOutcome(409, 'voting_closed')).toBe('closed');
    expect(voteOutcome(500, '')).toBe('error');
  });
});

describe('every events form handles it', () => {
  const forms = {
    RegisterForm: 'components/events/RegisterForm.tsx',
    VoteButton: 'components/events/VoteButton.tsx',
    SubmissionForm: 'components/events/SubmissionForm.tsx',
    ReassignForm: 'components/events/ReassignForm.tsx',
  };

  test.each(Object.entries(forms))('%s detects entitlement_required and renders the notice', (_name, file) => {
    const source = read(file);
    expect(source).toContain('isEntitlementRequired(');
    expect(source).toContain('<MembershipRequired');
  });

  test('SubmissionForm checks it before falling back to not_eligible / generic', () => {
    const source = read(forms.SubmissionForm);
    const putHandler = source.slice(source.indexOf("method: 'PUT'"), source.indexOf('async function onWithdraw'));
    const check = putHandler.indexOf('isEntitlementRequired(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(putHandler.indexOf("'not_eligible'"));
  });

  test('ReassignForm checks it before the generic error', () => {
    const source = read(forms.ReassignForm);
    const notOk = source.slice(source.indexOf('if (!resp.ok)'));
    expect(notOk.indexOf('isEntitlementRequired(')).toBeGreaterThan(-1);
    expect(notOk.indexOf('isEntitlementRequired(')).toBeLessThan(notOk.indexOf("setState('error')"));
  });

  const pages = {
    '_index.astro': 'RegisterForm',
    '_projects.astro': 'VoteButton',
    '_submission.astro': 'SubmissionForm',
    '_me.astro': 'ReassignForm',
  };

  test.each(Object.entries(pages))('%s passes the membership strings to %s', (page, component) => {
    const source = read(`pages/events/[slug]/${page}`);
    expect(source).toContain("tObj<MembershipStrings>('events.membership', locale)");
    const tag = source.slice(source.indexOf(`<${component}`), source.indexOf('/>', source.indexOf(`<${component}`)));
    expect(tag).toContain('membership={membership}');
  });
});
