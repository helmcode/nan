import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../data/openapi.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS } from './rateLimits';
import { openapiToText } from './openapiToText';
import { validate, type Schema } from '../tests/helpers/openapiValidate';

/**
 * The Automations and Approvals surface of the API reference (Agent
 * Automations Phase 2).
 *
 * Shapes come from cloud-api origin/main (8a42a20): handlers/automations.go,
 * automation_triggers.go, approvals.go and runs.go (routes, bodies, statuses),
 * automations/api.go and runs/api.go (limits, outcomes, error codes),
 * middleware/pat_scopes.go (the route -> scope table) and middleware/auth.go
 * (the token_scope_denied and browser_session_required bodies). The edge
 * Worker (devops cloudflare/api-edge-normaliser) answers inference with a
 * platform token with `401 token_not_valid_for_inference`.
 *
 * The fixtures in src/tests/fixtures/phase2 are cloud-api's own golden
 * responses (internal/handlers/testdata/phase2), copied as they are: every one
 * must validate against the schema this reference publishes.
 */

const s = spec as any;
const op = (path: string, method: string) => s.paths[path][method];
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../tests/fixtures/phase2');
const golden = (name: string) => JSON.parse(readFileSync(resolve(fixtures, `${name}.json`), 'utf-8'));

/** Every documented Phase 2 operation, its tag and the platform-token scope it needs (pat_scopes.go). */
const OPS: Array<[string, string, string, string, string]> = [
  ['/automations', 'get', 'listAutomations', 'Automations', 'automations:read'],
  ['/automations/templates', 'get', 'listAutomationTemplates', 'Automations', 'automations:read'],
  ['/automations/{id}', 'get', 'getAutomation', 'Automations', 'automations:read'],
  ['/automations/{id}/triggers', 'get', 'listAutomationTriggers', 'Automations', 'automations:read'],
  ['/automations/{id}/deliveries', 'get', 'listAutomationDeliveries', 'Automations', 'automations:read'],
  ['/automations/{id}/runs', 'post', 'runAutomation', 'Automations', 'automations:run'],
  ['/approvals', 'get', 'listApprovals', 'Approvals', 'runs'],
  ['/runs/{id}/proposal.diff', 'get', 'getRunProposalDiff', 'Approvals', 'runs'],
  ['/runs/{id}/reject', 'post', 'rejectRun', 'Approvals', 'runs'],
];

const ACTION_KINDS = ['git_push', 'github_create_pr', 'github_pr_comment', 'github_pr_review', 'github_issue_comment', 'github_add_labels'];

describe('openapi.json: Automations and Approvals tags', () => {
  it('sit right after Runs, before Workspaces, and link their guides', () => {
    const names = s.tags.map((t: any) => t.name);
    const at = names.indexOf('Runs');
    expect(names.slice(at, at + 6)).toEqual(['Runs', 'Automations', 'Secrets', 'Notifications', 'Approvals', 'Workspaces']);
    const tags = Object.fromEntries(s.tags.map((t: any) => [t.name, t.description]));
    expect(tags.Automations).toContain('https://nan.builders/docs/automations');
    expect(tags.Automations).toContain('https://nan.builders/docs/webhooks');
    expect(tags.Approvals).toContain('https://nan.builders/docs/automations#approve-or-reject-a-proposal');
  });

  it('say who may write (write API) and that approving stays in the portal', () => {
    const tags = Object.fromEntries(s.tags.map((t: any) => [t.name, t.description]));
    expect(tags.Automations).toMatch(/Creating, changing and deleting automations and their triggers needs a CLI session \(`nan auth login`\) or a platform token with `automations:write`/);
    expect(tags.Automations).toContain('`403 browser_session_required`');
    expect(tags.Approvals).toContain('`POST /v1/runs/{id}/approve`');
    expect(tags.Approvals).toContain('`403 browser_session_required`');
  });

  it.each(OPS)('%s %s (%s) is tagged %s and names the %s scope', (path, method, id, tag, scope) => {
    const o = op(path, method);
    expect(o.operationId).toBe(id);
    expect(o.tags).toEqual([tag]);
    expect(o.security).toEqual([{ apiKey: [] }, { platformToken: [] }]);
    expect(o.description).toContain(
      `a member API key (\`sk-...\`) or a platform token (\`nan_pat_...\`) with the \`${scope}\` scope`,
    );
  });

  it.each(OPS)('%s %s: 401 is the shared credentials answer, 403 the scope or workspace key', (path, method, _id, _tag, scope) => {
    const r = op(path, method).responses;
    expect(r['401']).toEqual({ $ref: '#/components/responses/RunsUnauthorized' });
    const ex = r['403'].content['application/json'].examples;
    expect(ex.token_scope_denied.value.error).toEqual({
      message: `This platform token does not have the "${scope}" scope this endpoint requires. Create a token with that scope in the Tokens section of Settings at cloud.nan.builders.`,
      type: 'permission_error',
      param: null,
      code: 'token_scope_denied',
    });
    expect(ex.workspace_key_not_allowed.value.error.code).toBe('workspace_key_not_allowed');
  });

  it('documents no approve route and no portal route (the writes are in openapiWriteApi.test.ts)', () => {
    // Approving stays browser-only; the write API (Phase 3) documents the rest.
    expect(s.paths['/runs/{id}/approve']).toBeUndefined();
    expect(JSON.stringify(s.paths)).not.toContain('/api/account');
    expect(JSON.stringify(s)).not.toMatch(/api\/account\/secrets/);
  });
});

describe('openapi.json: the Automations contract (cloud-api)', () => {
  const sc = s.components.schemas;

  it('the Automation object has the fields the handler renders, in its order', () => {
    expect(Object.keys(sc.Automation.properties)).toEqual([
      'id', 'object', 'name', 'description', 'template', 'workspace', 'agent', 'model', 'instructions', 'cwd',
      'git_isolation', 'timeout_seconds', 'approval_kinds', 'approval_ttl_seconds', 'inference', 'github_repo',
      'secrets', 'max_runs_per_hour', 'concurrency_policy', 'max_trigger_depth', 'enabled', 'disabled_reason',
      'created_at', 'updated_at',
      // Migration 110 (PR gatekeeper), same order as automationJSON.
      'checkout', 'sticky_pr_comment', 'checkout_untrusted_heads',
      // Phase 3 write API (migration 114).
      'updated_by',
      // Agent contexts (automationJSON, B4b #407), last as in the handler.
      'contexts',
    ]);
    expect(sc.Automation.properties.template.enum).toEqual(['custom', 'pr_review', 'issue_triage', 'ci_failure', 'generic_webhook']);
    expect(sc.Automation.properties.approval_kinds.items.enum).toEqual(ACTION_KINDS);
    expect(sc.Automation.properties.max_runs_per_hour).toMatchObject({ minimum: 1, maximum: 120 });
    expect(sc.Automation.properties.max_trigger_depth).toMatchObject({ minimum: 0, maximum: 5 });
    expect(sc.Automation.properties.approval_ttl_seconds).toMatchObject({ minimum: 3600, maximum: 604800 });
    expect(sc.Automation.properties.secrets.items.properties.exposure.enum).toEqual(['agent', 'actions']);
    expect(sc.Automation.description).toMatch(/Never carries a secret value/);
  });

  it('the PR gatekeeper settings (cloud-api PR #343): checkout, sticky comment, untrusted heads, supersede', () => {
    const p = sc.Automation.properties;
    expect(p.checkout).toMatchObject({ type: 'string', enum: ['workspace', 'fresh', 'none'], default: 'workspace' });
    expect(p.checkout.description).toMatch(/clones `github_repo` for each run/);
    expect(p.checkout.description).toMatch(/deletes it when the run ends, whatever the outcome/);
    expect(p.checkout.description).toMatch(/`git_push` is refused/);
    expect(p.checkout.description).toMatch(/`git_isolation` must be `null` or `false`/);
    expect(op('/automations/{id}/runs', 'post').description).toContain('or cancelled by `supersede`');
    expect(p.sticky_pr_comment).toMatchObject({ type: 'boolean', default: false });
    expect(p.sticky_pr_comment.description).toMatch(/only edits a comment it posted itself/);
    expect(p.checkout_untrusted_heads).toMatchObject({ type: 'boolean', default: false });
    expect(p.checkout_untrusted_heads.description).toMatch(/Only with `checkout: "fresh"`/);
    expect(p.checkout_untrusted_heads.description).toMatch(/forks/);
    expect(p.checkout_untrusted_heads.description).toContain('`ignored`');
    expect(p.concurrency_policy.enum).toEqual(['queue', 'skip_if_active', 'supersede']);
    expect(p.concurrency_policy.description).toMatch(/`supersede`[^.]*cancels the active runs/);
    expect(p.concurrency_policy.description).toContain('`superseded_by`');
    expect(p.concurrency_policy.description).toMatch(/behave as `queue`/);
  });

  it('Trigger, template and delivery objects match the handlers', () => {
    expect(Object.keys(sc.Trigger.properties)).toEqual([
      'id', 'object', 'automation_id', 'kind', 'enabled', 'token_prefix', 'signature_scheme', 'event_filter',
      'actor_filter', 'prev_secret_until', 'cron', 'timezone', 'next_fire_at', 'last_fired_at', 'last_outcome',
      'created_at', 'updated_at', 'updated_by',
    ]);
    expect(sc.Trigger.properties.signature_scheme.enum).toEqual(['github', 'stripe', 'nan', null]);
    // automations/api.go ScheduleOutcomes, in CHECK order.
    expect(sc.Trigger.properties.last_outcome.enum).toEqual([
      'run_created', 'skipped_active', 'not_accepted', 'missed', 'rate_limited', 'queue_full', 'automation_disabled', 'workspace_deleted', 'error', null,
    ]);
    expect(Object.keys(sc.EventFilter.properties)).toEqual(['events', 'actions', 'exclude_drafts', 'conclusions']);
    expect(Object.keys(sc.AutomationTemplate.properties)).toEqual([
      'id', 'name', 'description', 'instructions', 'approval_kinds', 'trigger_kind', 'signature_scheme', 'event_filter',
      'secret_slots', 'requires_github_repo', 'suggested_concurrency',
    ]);
    expect(Object.keys(sc.WebhookDelivery.properties)).toEqual(['trigger_id', 'delivery_id', 'received_at', 'outcome', 'run_id']);
    // automations/api.go PersistedOutcomes: only these are ever listed.
    expect(sc.WebhookDelivery.properties.outcome.enum).toEqual(['run_created', 'ignored', 'loop_suppressed', 'skipped_active', 'not_accepted', 'too_large']);
  });

  it('the trigger list never returns the webhook URL or the signing secret', () => {
    const props = Object.keys(sc.Trigger.properties);
    for (const secret of ['webhook_url', 'signing_secret', 'token', 'token_hash']) expect(props).not.toContain(secret);
    expect(op('/automations/{id}/triggers', 'get').description).toMatch(/shown once, when they are created or rotated/);
  });

  it('deliveries: limit 1 to 100, default 50, 30 days, and what is never stored', () => {
    const o = op('/automations/{id}/deliveries', 'get');
    const limit = o.parameters.find((p: any) => p.name === 'limit');
    expect(limit.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 });
    expect(o.description).toMatch(/last 30 days/);
    expect(o.description).toMatch(/never stored/);
  });

  it('run an automation: body, Idempotency-Key, statuses and every error code', () => {
    const o = op('/automations/{id}/runs', 'post');
    expect(sc.RunAutomationRequest.additionalProperties).toBe(false);
    expect(Object.keys(sc.RunAutomationRequest.properties)).toEqual(['input']);
    expect(sc.RunAutomationRequest.properties.input.description).toMatch(/48 KiB, nested at most 8 levels/);
    const idem = o.parameters.find((p: any) => p.name === 'Idempotency-Key');
    expect(idem).toMatchObject({ in: 'header', required: false });
    expect(idem.schema.pattern).toBe('^[A-Za-z0-9._:-]{1,128}$');
    expect(idem.description).toMatch(/`sch:` or `whk:` are reserved/);
    expect(Object.keys(o.responses).sort()).toEqual(['200', '201', '400', '401', '403', '404', '409', '429']);
    const text = JSON.stringify(o.responses);
    for (const code of [
      'tier_restricted', 'token_scope_denied', 'workspace_key_not_allowed', 'automation_disabled', 'workspace_not_running',
      'agent_not_installed', 'no_inference_key', 'idempotency_conflict', 'automation_rate_limited', 'run_queue_full', 'rate_limited',
    ]) {
      expect(text, code).toContain(code);
    }
    expect(o.description).toMatch(/never skipped by `skip_if_active`/);
    expect(o.responses['201'].content['application/json'].example.phase).toBe('propose');
  });
});

describe('openapi.json: the Approvals contract (cloud-api)', () => {
  const sc = s.components.schemas;

  it('the approval object (§7.6) and the list item', () => {
    expect(Object.keys(sc.Approval.properties)).toEqual([
      'run_id', 'state', 'approval_from', 'expires_at', 'proposal', 'proposal_sha256', 'diffstat', 'has_diff', 'diff_masked',
      'decided_at', 'prefix_apply_run_id', 'apply_run_id',
    ]);
    expect(sc.Approval.properties.state.enum).toEqual(['auto', 'pending', 'approved', 'rejected', 'expired', 'cancelled']);
    expect(Object.keys(sc.ApprovalListItem.allOf[1].properties)).toEqual(['run_state', 'workspace_id', 'automation_id']);
    expect(sc.ProposalAction.properties.kind.enum).toEqual(ACTION_KINDS);
    expect(sc.ProposalAction.properties.event.enum).toEqual(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']);
    expect(sc.ProposalAction.description).toMatch(/`\[masked\]`/);
  });

  it('list: state, limit (1 to 100, default 20) and cursor', () => {
    const params = Object.fromEntries(op('/approvals', 'get').parameters.map((p: any) => [p.name, p]));
    expect(Object.keys(params)).toEqual(['state', 'limit', 'cursor']);
    expect(params.limit.schema).toMatchObject({ minimum: 1, maximum: 100, default: 20 });
    expect(params.state.schema.enum).toEqual(sc.Approval.properties.state.enum);
  });

  it('the diff is a text/plain attachment, only when the approval covers a push', () => {
    const o = op('/runs/{id}/proposal.diff', 'get');
    expect(Object.keys(o.responses['200'].content)).toEqual(['text/plain']);
    expect(o.description).toMatch(/`has_diff: true`/);
    expect(o.description).toContain('`[masked]`');
  });

  it('reject: optional reason, 200 run cancelled with approval_rejected, 409 when not waiting', () => {
    const o = op('/runs/{id}/reject', 'post');
    expect(o.requestBody.required).toBe(false);
    expect(Object.keys(o.requestBody.content['application/json'].schema.properties)).toEqual(['reason']);
    expect(Object.keys(o.responses).sort()).toEqual(['200', '400', '401', '403', '404', '409']);
    const run = o.responses['200'].content['application/json'].example;
    expect(run).toMatchObject({ state: 'cancelled', error_code: 'approval_rejected' });
    expect(run.approval.state).toBe('rejected');
    expect(JSON.stringify(o.responses['409'])).toContain('not_awaiting_approval');
    expect(o.description).toMatch(/Approving is not available here/);
  });

  it('events: the stream also ends when the run waits for approval', () => {
    expect(op('/runs/{id}/events', 'get').description).toContain('waiting for your approval (`awaiting_approval`)');
    expect(sc.RunEventDataApprovalRequired.required).toEqual(['proposal_sha256', 'kinds']);
    expect(sc.RunEventDataAction.properties.status.enum).toEqual(['started', 'ok', 'failed']);
  });
});

describe('openapi.json: credentials for the platform API', () => {
  const desc = s.info.description as string;

  it('the overview explains scopes and the three refusals with their real bodies', () => {
    for (const scope of ['`runs`', '`workspaces:read`', '`automations:read`', '`automations:run`']) expect(desc).toContain(scope);
    expect(desc).toContain('### Browser sign-in');
    const blocks = [...desc.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
    const byCode = Object.fromEntries(blocks.filter((b) => b.error?.code).map((b) => [b.error.code, b.error]));
    // devops edge Worker TOKEN_NOT_VALID_FOR_INFERENCE (origin/main, cloudflare/api-edge-normaliser/src/index.js, /v1/contexts added by D3), byte for byte.
    expect(byCode.token_not_valid_for_inference).toEqual({
      message:
        'Platform tokens (nan_pat_) cannot be used for inference. Use an inference API key (sk-) instead. Platform tokens only work on the platform API (/v1/runs, /v1/automations, /v1/approvals, /v1/secrets, /v1/notification-channels, /v1/contexts and GET /api/workspaces).',
      type: 'invalid_request_error',
      param: null,
      code: 'token_not_valid_for_inference',
    });
    // cloud-api middleware/auth.go browserSessionRequiredMessage, OpenAI envelope under /v1.
    expect(byCode.browser_session_required).toEqual({
      message:
        'This action needs a browser session: sign in at cloud.nan.builders in your browser and try again from there. CLI sessions, API keys and platform tokens cannot approve runs or create tokens with automations or secrets scopes.',
      type: 'permission_error',
      param: null,
      code: 'browser_session_required',
    });
    expect(byCode.token_scope_denied.type).toBe('permission_error');
  });

  it('the errors table lists the new codes', () => {
    expect(desc).toMatch(/\| `401` \|[^\n]*`token_not_valid_for_inference` \|/);
    expect(desc).toMatch(/\| `403` \|[^\n]*`token_scope_denied` · `credential_not_allowed` · `browser_session_required` \|/);
  });

  it('the platform token scheme names its scopes and the inference refusal', () => {
    const d = s.components.securitySchemes.platformToken.description;
    expect(d).toContain('`401 token_not_valid_for_inference`');
    expect(d).toContain('`403 token_scope_denied`');
    expect(d).toMatch(/can never approve a run, and it changes automations, secrets or notification channels only with `automations:write`, `secrets:write` or `notifications:write`/);
  });
});

describe('cloud-api golden responses validate against the published schemas', () => {
  it('copies every golden file the reference covers', () => {
    expect(readdirSync(fixtures).sort()).toEqual([
      'approvals_list.json', 'automation_deliveries.json', 'automation_get.json', 'automation_templates.json',
      'automation_triggers.json', 'automations_list.json', 'run_get_adhoc.json', 'run_get_propose.json',
      'run_list_propose.json', 'trigger_create.json', 'trigger_rotate.json',
      // cloud-api PR #343: a fresh-checkout, sticky, supersede automation and a superseded run.
      'automation_get_gatekeeper.json', 'run_get_gatekeeper.json',
    ].sort());
  });

  const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
  const cases: Array<[string, unknown, Schema]> = [
    ['automations_list', golden('automations_list'), ref('AutomationList')],
    ['automation_get', golden('automation_get'), ref('Automation')],
    ['automation_get_gatekeeper', golden('automation_get_gatekeeper'), ref('Automation')],
    ['run_get_gatekeeper', golden('run_get_gatekeeper'), ref('Run')],
    ['automation_templates', golden('automation_templates'), op('/automations/templates', 'get').responses['200'].content['application/json'].schema],
    ['automation_triggers', golden('automation_triggers'), ref('TriggerList')],
    ['trigger_create .trigger', golden('trigger_create').trigger, ref('Trigger')],
    ['automation_deliveries', golden('automation_deliveries'), ref('WebhookDeliveryList')],
    ['approvals_list', golden('approvals_list'), ref('ApprovalList')],
    ['run_get_propose', golden('run_get_propose'), ref('Run')],
    ['run_get_adhoc', golden('run_get_adhoc'), ref('Run')],
    ['run_list_propose', golden('run_list_propose'), ref('RunList')],
  ];

  it.each(cases)('%s', (_name, value, schema) => {
    expect(validate(value, schema)).toEqual([]);
  });

  it('the gatekeeper goldens carry the new settings and the run checkout', () => {
    expect(golden('automation_get_gatekeeper')).toMatchObject({ checkout: 'fresh', sticky_pr_comment: true, concurrency_policy: 'supersede', checkout_untrusted_heads: false });
    expect(golden('run_get_gatekeeper')).toMatchObject({ state: 'cancelled', error_code: 'cancelled', sticky_pr_comment: true });
    expect(golden('run_get_gatekeeper').superseded_by).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(golden('run_get_gatekeeper').checkout).sort()).toEqual(Object.keys(s.components.schemas.RunCheckout.properties).sort());
    for (const g of ['automation_get', 'automations_list']) expect(JSON.stringify(golden(g))).toContain('"checkout":"workspace"');
    for (const g of ['run_get_propose', 'run_get_adhoc']) expect(golden(g)).toMatchObject({ checkout: null, superseded_by: null, sticky_pr_comment: false });
  });

  it('the validator rejects a checkout mode or a sha the schema does not allow', () => {
    expect(validate({ ...golden('automation_get_gatekeeper'), checkout: 'worktree' }, ref('Automation'))).not.toEqual([]);
    expect(validate({ ...golden('automation_get_gatekeeper'), concurrency_policy: 'cancel' }, ref('Automation'))).not.toEqual([]);
    const run = golden('run_get_gatekeeper');
    expect(validate({ ...run, checkout: { ...run.checkout, sha: 'main' } }, ref('Run'))).not.toEqual([]);
  });

  it('the validator still rejects a field the schema does not declare', () => {
    expect(validate({ ...golden('automation_get'), secret_value: 'x' }, ref('Automation'))).not.toEqual([]);
  });
});

describe('openapi.json: every Automations and Approvals example matches its schema', () => {
  const cases: Array<[string, unknown, Schema]> = [];
  for (const [path, method] of OPS) {
    const o = op(path, method);
    const req = o.requestBody?.content?.['application/json'];
    if (req?.example) cases.push([`${method} ${path} request`, req.example, req.schema]);
    for (const [status, r] of Object.entries(o.responses) as Array<[string, any]>) {
      const json = r.content?.['application/json'];
      if (!json) continue;
      if (json.example !== undefined) cases.push([`${method} ${path} ${status}`, json.example, json.schema]);
      for (const [name, ex] of Object.entries(json.examples ?? {}) as Array<[string, any]>) {
        cases.push([`${method} ${path} ${status} ${name}`, ex.value, json.schema]);
      }
    }
  }

  it('finds the examples to check', () => {
    expect(cases.length).toBeGreaterThan(30);
  });

  it.each(cases)('%s', (_name, example, schema) => {
    expect(validate(example, schema)).toEqual([]);
  });
});

describe('the text the docs API serves for the reference', () => {
  it('includes the Automations and Approvals operations', () => {
    const text = openapiToText(resolveSpec(DEFAULT_RATE_LIMITS));
    for (const heading of [
      '## Automations',
      '## Approvals',
      '### GET /automations: List automations',
      '### POST /automations/{id}/runs: Run an automation',
      '### GET /automations/{id}/deliveries: List webhook deliveries',
      '### GET /approvals: List approvals',
      '### POST /runs/{id}/reject: Reject a proposal',
    ]) {
      expect(text, heading).toContain(heading);
    }
  });

  it('no em-dashes in what Phase 2 adds', () => {
    const added = JSON.stringify([
      s.tags.filter((t: any) => ['Runs', 'Automations', 'Approvals'].includes(t.name)),
      ...OPS.map(([p, m]) => op(p, m)),
      s.components.securitySchemes,
      s.info.description,
      Object.entries(s.components.schemas).filter(([k]) =>
        /^(Run|Automation|Approval|Proposal|Diffstat|EventFilter|Trigger|WebhookDelivery)/.test(k),
      ),
    ]);
    expect(added).not.toContain('—');
  });
});
