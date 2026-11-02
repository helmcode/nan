import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';

/**
 * The partner payout report (nan-cloud-api docs/PARTNERS.md,
 * internal/handlers/partner_payouts.go). Facts pinned from the code:
 * - GET /api/partners/{partner}/payouts on the platform host
 *   cloud-api.nan.builders (mounted outside the session-auth /api group; the
 *   inference host does not route it).
 * - Bearer partner token, scoped to its own partner; unknown partner = Go's
 *   plain-text 404; bad token = 401 {"error":"unauthorized"}.
 * - Rows carry no member data: the schema must never grow an email, a name or
 *   a Stripe customer/subscription/payment id.
 * - Generic: no partner ID (e.g. the first partner's) appears in the public
 *   reference; examples use a placeholder.
 */
const s = spec as any;
const path = '/api/partners/{partner}/payouts';
const op = s.paths[path].get;

describe('openapi.json: the Partners payout report', () => {
  it('lives on cloud-api.nan.builders with the partner token only', () => {
    expect(s.paths[path].servers).toEqual([expect.objectContaining({ url: 'https://cloud-api.nan.builders' })]);
    expect(Object.keys(s.paths[path]).filter((k) => k !== 'servers')).toEqual(['get']);
    expect(op.security).toEqual([{ partnerToken: [] }]);
    expect(s.components.securitySchemes.partnerToken).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(op.tags).toEqual(['Partners']);
  });

  it('documents month (required) and format, and every status the handler answers', () => {
    const params = Object.fromEntries(op.parameters.map((p: any) => [p.name, p]));
    expect(params.partner.in).toBe('path');
    expect(params.month).toMatchObject({ in: 'query', required: true });
    expect(params.format.schema.enum).toEqual(['json', 'csv']);
    expect(Object.keys(op.responses).sort()).toEqual(['200', '400', '401', '404', '429', '502', '503']);
    expect(op.responses['401'].content['application/json'].example).toEqual({ error: 'unauthorized' });
    expect(op.responses['404'].content['text/plain'].example).toBe('404 page not found\n');
    expect(op.responses['429'].content['application/json'].example).toEqual({ error: 'too many requests' });
  });

  it('the row schema carries no personal data', () => {
    const row = s.components.schemas.PartnerPayoutRow.properties;
    expect(Object.keys(row).sort()).toEqual(
      ['amountEUR', 'commissionEUR', 'invoiceId', 'paidAt', 'status', 'subscriber', 'subscriptionActive'].sort(),
    );
    expect(row.status.enum).toEqual(['counted', 'refunded', 'credited']);
    const examples = JSON.stringify(op.responses['200'].content);
    expect(examples).not.toMatch(/@|cus_|pi_|"email"|"customer"/);
    for (const schema of ['PartnerPayoutRow', 'PartnerPayoutReport']) {
      const props = Object.keys(s.components.schemas[schema].properties);
      expect(props.filter((p) => /email|name|customer|payment/i.test(p))).toEqual([]);
    }
  });

  it('is generic: no real partner ID in the public reference', () => {
    const text = JSON.stringify(s.paths[path]) + JSON.stringify(s.tags.find((t: any) => t.name === 'Partners'));
    expect(text.toLowerCase()).not.toContain('gentle');
    expect(text).toContain('acme');
  });
});
