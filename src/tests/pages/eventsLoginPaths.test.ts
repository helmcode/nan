import { describe, expect, test } from 'vitest';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { tObj } from '../../lib/i18n';
import { HACKATHON_UNLOCK_URL } from '../../lib/eventEntitlement';
import LoginForm, { type LoginStrings } from '../../components/events/LoginForm';

/**
 * Someone who reaches an event without a session is one of two people: a
 * member who is not signed in, or someone who is not in NaN yet. The login
 * form alone only serves the first, and the magic-link endpoint answers 202
 * for an email without an account too, so the second would wait for an email
 * that never comes. Both paths have to be on screen.
 */
describe('events login: both paths for a visitor without a session', () => {
  for (const locale of ['es', 'en'] as const) {
    const t = tObj<LoginStrings>('events.login', locale);
    const html = render(h(LoginForm, { t }));

    test(`${locale}: offers sign-in to members`, () => {
      expect(html).toContain('id="hk-email"');
      expect(html).toContain(t.prompt);
    });

    test(`${locale}: offers joining NaN to everyone else`, () => {
      expect(html).toContain(t.newTitle);
      expect(html).toContain(t.newCta);
      expect(html).toContain(`href="${HACKATHON_UNLOCK_URL}"`);
    });

    test(`${locale}: the copy names NaN membership in both paths`, () => {
      expect(t.prompt).toMatch(/NaN/);
      expect(t.newTitle).toMatch(/NaN/);
      expect(t.noEmail.length).toBeGreaterThan(0);
    });
  }
});
