import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import spec from '../data/openapi.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS } from './rateLimits';
import { openapiToText } from './openapiToText';
import { validate, type Schema } from '../tests/helpers/openapiValidate';

/**
 * The write API in the API reference: secrets and automations managed from
 * the API and the CLI (devops AGENT-AUTOMATIONS-PHASE3-WRITE-API.md, cloud-api
 * PR #348, 0.8.261).
 *
 * Shapes come from cloud-api origin/main 95414e4: handlers/account_secrets.go
 * (MountV1SecretsRoutes, secretView, the request types, fail/failStatus),
 * secrets/api.go (codes, limits), handlers/automations.go and
 * automation_triggers.go (bodies, statuses, writer), middleware/
 * write_credential.go (credential_not_allowed), middleware/pat_scopes.go (the
 * route -> scope table) and middleware/auth.go (browser_session_required).
 * The fixtures in src/tests/fixtures/phase2 are cloud-api's golden files.
 */

const s = spec as any;
const op = (path: string, method: string) => s.paths[path][method];
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const here = dirname(fileURLToPath(import.meta.url));
const golden = (name: string) =>
  JSON.parse(readFileSync(resolve(here, '../tests/fixtures/phase2', `${name}.json`), 'utf-8'));

/** Every write-API operation, its tag, the token scope it needs (pat_scopes.go) and whether it is a write (rate limited). */
const OPS: Array<[string, string, string, string, string, boolean]> = [
  ['/secrets', 'get', 'listSecrets', 'Secrets', 'secrets:read', false],
  ['/secrets', 'post', 'createSecret', 'Secrets', 'secrets:write', true],
  ['/secrets/{id}', 'get', 'getSecret', 'Secrets', 'secrets:read', false],
  ['/secrets/{id}', 'patch', 'updateSecret', 'Secrets', 'secrets:write', true],
  ['/secrets/{id}', 'delete', 'deleteSecret', 'Secrets', 'secrets:write', true],
  ['/secrets/{id}/value', 'put', 'replaceSecretValue', 'Secrets', 'secrets:write', true],
  ['/automations', 'post', 'createAutomation', 'Automations', 'automations:write', true],
  ['/automations/{id}', 'patch', 'updateAutomation', 'Automations', 'automations:write', true],
  ['/automations/{id}', 'delete', 'deleteAutomation', 'Automations', 'automations:write', true],
  ['/automations/{id}/triggers', 'post', 'createAutomationTrigger', 'Automations', 'automations:write', true],
  ['/automations/{id}/triggers/{trigger_id}', 'patch', 'updateAutomationTrigger', 'Automations', 'automations:write', true],
  ['/automations/{id}/triggers/{trigger_id}', 'delete', 'deleteAutomationTrigger', 'Automations', 'automations:write', true],
  ['/automations/{id}/triggers/{trigger_id}/rotate', 'post', 'rotateAutomationTrigger', 'Automations', 'automations:write', true],
];

const UPDATED_BY = ['browser_session', 'cli_session', 'platform_token'];

/** middleware/write_credential.go credentialNotAllowedMessage. */
const credentialNotAllowed = (scope: string) =>
  `This endpoint needs a browser session, a CLI session (nan auth login) or a platform token with the "${scope}" scope. API keys (sk-), workspace keys and sessions from older clients are not accepted here: sign in again with the CLI or at cloud.nan.builders.`;

describe('openapi.json: the write API operations', () => {
  it('the Secrets tag sits between Automations and Notifications, then Approvals, and explains who may use it', () => {
    const names = s.tags.map((t: any) => t.name);
    const at = names.indexOf('Runs');
    expect(names.slice(at, at + 6)).toEqual(['Runs', 'Automations', 'Secrets', 'Notifications', 'Approvals', 'Workspaces']);
    const tags = Object.fromEntries(s.tags.map((t: any) => [t.name, t.description]));
    expect(tags.Secrets).toContain('https://nan.builders/docs/secrets');
    expect(tags.Secrets).toMatch(/never returns a value/i);
    expect(tags.Secrets).toContain('`secrets:read`');
    expect(tags.Secrets).toContain('`secrets:write`');
    expect(tags.Secrets).toContain('`404`');
    expect(tags.Automations).toContain('`automations:write`');
    expect(tags.Automations).toMatch(/Approving stays in the portal/);
  });

  it.each(OPS)('%s %s (%s) is tagged %s and names the %s scope', (path, method, id, tag, scope) => {
    const o = op(path, method);
    expect(o.operationId).toBe(id);
    expect(o.tags).toEqual([tag]);
    expect(o.security).toEqual([{ cliSession: [] }, { platformToken: [] }]);
    expect(o.description).toContain(
      `a CLI session (\`nan auth login\`) or a platform token (\`nan_pat_...\`) with the \`${scope}\` scope`,
    );
    expect(o.description).toMatch(/API key \(`sk-\.\.\.`\)/);
  });

  it.each(OPS)('%s %s: 401, and 403 for a missing scope, an API key and a workspace key', (path, method, _id, _tag, scope) => {
    const r = op(path, method).responses;
    expect(r['401']).toEqual({ $ref: '#/components/responses/RunsUnauthorized' });
    const ex = r['403'].content['application/json'].examples;
    expect(ex.token_scope_denied.value.error).toEqual({
      message: `This platform token does not have the "${scope}" scope this endpoint requires. Create a token with that scope in the Tokens section of Settings at cloud.nan.builders.`,
      type: 'permission_error',
      param: null,
      code: 'token_scope_denied',
    });
    expect(ex.credential_not_allowed.value.error).toEqual({
      message: credentialNotAllowed(scope),
      type: 'permission_error',
      param: null,
      code: 'credential_not_allowed',
    });
    expect(ex.workspace_key_not_allowed.value.error.code).toBe('workspace_key_not_allowed');
  });

  it.each(OPS)('%s %s: 429 rate_limited on every write, never on a read', (path, method, _id, _tag, _scope, write) => {
    const r = op(path, method).responses;
    if (!write) {
      expect(r['429']).toBeUndefined();
      return;
    }
    const err = r['429'].content['application/json'].example.error;
    expect(err).toMatchObject({ type: 'rate_limit_exceeded', param: null, code: 'rate_limited' });
    expect(r['429'].description).toMatch(path.startsWith('/secrets') ? /30 at once, then 120 per hour/ : /30 at once, then 300 per hour/);
  });

  it('approving is still not part of the API, nor the portal secrets route', () => {
    expect(s.paths['/runs/{id}/approve']).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/api\/account\/secrets/);
  });
});

describe('openapi.json: the secrets contract', () => {
  const sc = s.components.schemas;

  it('the Secret object: the fields secretView renders, in order, and never a value', () => {
    expect(Object.keys(sc.Secret.properties)).toEqual([
      'id', 'object', 'name', 'kind', 'provider', 'base_url', 'hint', 'value_bytes', 'description', 'used_by',
      'created_at', 'updated_at', 'last_used_at', 'updated_by',
    ]);
    expect(sc.Secret.additionalProperties).toBe(false);
    expect(sc.Secret.properties.kind.enum).toEqual(['generic', 'provider_key']);
    expect(sc.Secret.properties.provider.enum).toEqual(['openai_compatible', 'anthropic', 'openai', 'gemini', null]);
    expect(sc.Secret.properties.updated_by.enum).toEqual(UPDATED_BY);
    expect(sc.Secret.properties.name.pattern).toBe('^[A-Z][A-Z0-9_]{0,63}$');
    expect(Object.keys(sc.Secret.properties.used_by.items.properties)).toEqual(['id', 'name']);
    for (const f of ['value', 'ciphertext', 'secret']) expect(Object.keys(sc.Secret.properties)).not.toContain(f);
  });

  it('the requests: create, PATCH and the new value, with known fields only', () => {
    expect(sc.CreateSecretRequest.additionalProperties).toBe(false);
    expect(Object.keys(sc.CreateSecretRequest.properties)).toEqual(['name', 'value', 'kind', 'provider', 'base_url', 'description']);
    expect(sc.CreateSecretRequest.required).toEqual(['name', 'value']);
    expect(sc.CreateSecretRequest.properties.value.description).toMatch(/1 to 16384 bytes/);
    expect(sc.CreateSecretRequest.properties.value.description).toMatch(/not start or end with a line break/);
    expect(sc.CreateSecretRequest.properties.value.description).toMatch(/8 to 4096/);
    expect(sc.UpdateSecretRequest.additionalProperties).toBe(false);
    expect(Object.keys(sc.UpdateSecretRequest.properties)).toEqual(['description', 'base_url']);
    expect(sc.UpdateSecretRequest.minProperties).toBe(1);
    expect(sc.ReplaceSecretValueRequest.additionalProperties).toBe(false);
    expect(sc.ReplaceSecretValueRequest.required).toEqual(['value']);
    const ok = { name: 'GITHUB_TOKEN', value: 'ghp_x' };
    expect(validate(ok, ref('CreateSecretRequest'))).toEqual([]);
    expect(validate({ ...ok, secret_value: 'x' }, ref('CreateSecretRequest')).length).toBeGreaterThan(0);
    expect(validate({ name: 'lower', value: 'v' }, ref('CreateSecretRequest')).length).toBeGreaterThan(0);
  });

  it('create: Idempotency-Key, 201, 200 on a replay, and every 409', () => {
    const o = op('/secrets', 'post');
    const idem = o.parameters.find((p: any) => p.name === 'Idempotency-Key');
    expect(idem).toMatchObject({ in: 'header', required: false });
    expect(idem.schema.pattern).toBe('^[A-Za-z0-9._:-]{1,128}$');
    expect(idem.description).toMatch(/value of the retry is ignored/);
    expect(Object.keys(o.responses).sort()).toEqual(['200', '201', '400', '401', '403', '404', '409', '429', '503']);
    const conflicts = o.responses['409'].content['application/json'].examples;
    expect(Object.keys(conflicts).sort()).toEqual(['idempotency_key_reused', 'name_taken', 'too_many_secrets']);
    expect(conflicts.too_many_secrets.value.error.message).toBe('you have reached the maximum of 100 secrets');
    expect(JSON.stringify(o.responses['403'])).toContain('platform_access_required');
    expect(JSON.stringify(o.responses['503'])).toContain('secrets_unavailable');
  });

  it('delete: 204, and 409 secret_in_use names the automations that use it', () => {
    const o = op('/secrets/{id}', 'delete');
    expect(o.responses['204']).toBeDefined();
    const err = o.responses['409'].content['application/json'].example.error;
    expect(err.code).toBe('secret_in_use');
    expect(Object.keys(err.automations[0])).toEqual(['id', 'name']);
    expect(validate(o.responses['409'].content['application/json'].example, o.responses['409'].content['application/json'].schema)).toEqual([]);
  });

  it('replace the value: 409 secrets_too_large names the automations', () => {
    const o = op('/secrets/{id}/value', 'put');
    expect(JSON.stringify(o.responses['409'])).toContain('secrets_too_large');
    expect(o.description).toMatch(/every run that starts from then on/);
  });

  it('every secret answer is no-store', () => {
    for (const [path, method] of OPS.filter(([p]) => p.startsWith('/secrets'))) {
      const r = op(path, method).responses;
      const ok = r['200'] ?? r['201'];
      if (ok) expect(ok.headers?.['Cache-Control']?.schema?.const, `${method} ${path}`).toBe('no-store');
    }
  });
});

describe('openapi.json: the automation writes', () => {
  const sc = s.components.schemas;

  it('updated_by on the automation and trigger objects', () => {
    // updated_by closes the Phase 3 fields; the agent contexts (B4b) follow it.
    expect(Object.keys(sc.Automation.properties).slice(-2)).toEqual(['updated_by', 'contexts']);
    expect(sc.Automation.properties.updated_by.enum).toEqual(UPDATED_BY);
    expect(Object.keys(sc.Trigger.properties).at(-1)).toBe('updated_by');
    expect(sc.Trigger.properties.updated_by.enum).toEqual(UPDATED_BY);
  });

  it('create and PATCH bodies have the handler fields', () => {
    expect(sc.CreateAutomationRequest.additionalProperties).toBe(false);
    expect(Object.keys(sc.CreateAutomationRequest.properties)).toEqual([
      'name', 'description', 'template', 'workspace', 'agent', 'model', 'instructions', 'cwd', 'git_isolation',
      'timeout_seconds', 'approval_kinds', 'approval_ttl_seconds', 'inference', 'github_repo', 'secrets',
      'max_runs_per_hour', 'concurrency_policy', 'max_trigger_depth', 'enabled', 'checkout', 'sticky_pr_comment',
      'checkout_untrusted_heads', 'contexts',
    ]);
    expect(sc.CreateAutomationRequest.required).toEqual(['name', 'workspace', 'agent']);
    expect(sc.UpdateAutomationRequest.additionalProperties).toBe(false);
    expect(Object.keys(sc.UpdateAutomationRequest.properties)).toEqual([
      'name', 'description', 'workspace', 'agent', 'model', 'instructions', 'cwd', 'git_isolation', 'timeout_seconds',
      'approval_kinds', 'approval_ttl_seconds', 'inference', 'github_repo', 'secrets', 'max_runs_per_hour',
      'concurrency_policy', 'max_trigger_depth', 'enabled', 'checkout', 'sticky_pr_comment', 'checkout_untrusted_heads',
      'contexts',
    ]);
    expect(sc.UpdateAutomationRequest.properties.secrets.description).toMatch(/Replaces every assignment/);
    expect(sc.UpdateAutomationRequest.properties.approval_kinds.description).toMatch(/`\[\]`/);
  });

  it('trigger bodies: create, PATCH, rotate', () => {
    expect(Object.keys(sc.CreateTriggerRequest.properties)).toEqual([
      'kind', 'signature_scheme', 'signing_secret', 'event_filter', 'actor_filter', 'cron', 'timezone', 'enabled',
    ]);
    expect(sc.CreateTriggerRequest.required).toEqual(['kind']);
    expect(Object.keys(sc.UpdateTriggerRequest.properties)).toEqual(['event_filter', 'actor_filter', 'cron', 'timezone', 'enabled']);
    expect(Object.keys(sc.RotateTriggerRequest.properties)).toEqual(['rotate', 'grace', 'signing_secret']);
    expect(sc.RotateTriggerRequest.properties.rotate.items.enum).toEqual(['url', 'secret']);
    expect(sc.RotateTriggerRequest.properties.grace.default).toBe(true);
    for (const n of ['CreateTriggerRequest', 'UpdateTriggerRequest', 'RotateTriggerRequest']) expect(sc[n].additionalProperties).toBe(false);
  });

  it('the webhook URL and signing secret come once, no-store', () => {
    const create = op('/automations/{id}/triggers', 'post').responses['201'];
    expect(create.content['application/json'].schema).toEqual(ref('TriggerCreated'));
    expect(create.headers['Cache-Control'].schema.const).toBe('no-store');
    expect(create.description).toMatch(/only time/);
    const rotate = op('/automations/{id}/triggers/{trigger_id}/rotate', 'post').responses['200'];
    expect(rotate.content['application/json'].schema).toEqual(ref('TriggerRotated'));
    expect(rotate.headers['Cache-Control'].schema.const).toBe('no-store');
    expect(Object.keys(sc.TriggerCreated.properties)).toEqual(['trigger', 'webhook_url', 'signing_secret']);
    expect(Object.keys(sc.TriggerRotated.properties)).toEqual(['webhook_url', 'signing_secret']);
    expect(op('/automations/{id}/triggers', 'post').description).toMatch(/not idempotent/);
    expect(op('/automations/{id}/triggers', 'get').description).toMatch(/shown once/);
    expect(op('/automations/{id}/triggers', 'get').description).not.toMatch(/in the portal, when/);
  });

  it('examples look like the real answers (service.go SigningSecretPrefix, getTrigger, ListMemberSecrets)', () => {
    const created = op('/automations/{id}/triggers', 'post').responses['201'].content['application/json'].example;
    expect(created.signing_secret).toMatch(/^nan_whsec_/);
    expect(created.webhook_url).toMatch(/^https:\/\/api\.nan\.builders\/hooks\/nan_whk_/);
    const rotated = op('/automations/{id}/triggers/{trigger_id}/rotate', 'post').responses['200'].content['application/json'].example;
    expect(rotated.signing_secret).toMatch(/^nan_whsec_/);
    for (const [path, method] of [
      ['/automations/{id}/triggers/{trigger_id}', 'patch'],
      ['/automations/{id}/triggers/{trigger_id}', 'delete'],
      ['/automations/{id}/triggers/{trigger_id}/rotate', 'post'],
    ]) {
      expect(op(path, method).responses['404'].content['application/json'].example.error.message, `${method} ${path}`).toBe('automation not found');
    }
    expect(op('/secrets', 'get').responses['200'].description).toMatch(/newest first/);
    const stripe = op('/automations/{id}/triggers/{trigger_id}/rotate', 'post').requestBody.content['application/json'].examples.stripe.value;
    expect(stripe.signing_secret).toMatch(/^whsec_/);
  });

  it('automation writes document browser_session_required for accounts without the write API', () => {
    for (const [path, method, , tag] of OPS) {
      if (tag !== 'Automations') continue;
      const ex = op(path, method).responses['403'].content['application/json'].examples;
      expect(ex.browser_session_required.value.error.code, `${method} ${path}`).toBe('browser_session_required');
    }
  });

  it('create automation: 201, 409 name_taken, and the defaults', () => {
    const o = op('/automations', 'post');
    expect(Object.keys(o.responses).sort()).toEqual(['201', '400', '401', '403', '404', '409', '429']);
    const text = JSON.stringify(o.responses['409']);
    for (const code of ['name_taken', 'too_many_automations', 'agent_not_installed']) expect(text, code).toContain(code);
    expect(o.description).toMatch(/approval_kinds.*every kind/);
  });

  it('delete: 204 for an automation and a trigger', () => {
    expect(op('/automations/{id}', 'delete').responses['204']).toBeDefined();
    expect(op('/automations/{id}/triggers/{trigger_id}', 'delete').responses['204']).toBeDefined();
  });
});

describe('openapi.json: credentials and scopes', () => {
  const desc = s.info.description as string;

  it('the overview lists the new scopes and the CLI session', () => {
    for (const scope of ['`automations:write`', '`secrets:read`', '`secrets:write`']) expect(desc).toContain(scope);
    expect(desc).toContain('### CLI session');
    expect(desc).toMatch(/can change your secrets or automations/);
  });

  it('the CLI session scheme and the platform token scheme name the write scopes', () => {
    const cli = s.components.securitySchemes.cliSession;
    expect(cli).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(cli.description).toContain('nan auth login');
    expect(cli.description).toMatch(/inside a workspace/);
    const pat = s.components.securitySchemes.platformToken.description;
    for (const scope of ['`automations:write`', '`secrets:read`', '`secrets:write`']) expect(pat).toContain(scope);
    expect(pat).toMatch(/can never approve a run/);
  });

  it('the overview says API keys never reach secrets or automation changes', () => {
    expect(desc).toContain('never on Secrets, Notifications or changes to automations');
    expect(desc).not.toContain('An API key works on both inference and these endpoints.');
  });

  it('the overview carries the real credential_not_allowed body', () => {
    const blocks = [...desc.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
    const byCode = Object.fromEntries(blocks.filter((b) => b.error?.code).map((b) => [b.error.code, b.error]));
    expect(byCode.credential_not_allowed).toEqual({
      message: credentialNotAllowed('secrets:write'),
      type: 'permission_error',
      param: null,
      code: 'credential_not_allowed',
    });
  });
});

describe('cloud-api golden responses for the writes', () => {
  it.each([
    ['trigger_create', golden('trigger_create'), ref('TriggerCreated')],
    ['trigger_rotate', golden('trigger_rotate'), ref('TriggerRotated')],
    ['automation_get', golden('automation_get'), ref('Automation')],
    ['automation_triggers', golden('automation_triggers'), ref('TriggerList')],
  ] as Array<[string, unknown, Schema]>)('%s', (_n, value, schema) => {
    expect(validate(value, schema)).toEqual([]);
  });

  it('the goldens carry updated_by', () => {
    expect(golden('automation_get').updated_by).toBe('browser_session');
    expect(golden('trigger_create').trigger.updated_by).toBe('browser_session');
  });
});

describe('openapi.json: every write-API example matches its schema', () => {
  const cases: Array<[string, unknown, Schema]> = [];
  for (const [path, method] of OPS) {
    const o = op(path, method);
    const req = o.requestBody?.content?.['application/json'];
    if (req?.example) cases.push([`${method} ${path} request`, req.example, req.schema]);
    for (const [name, ex] of Object.entries(req?.examples ?? {}) as Array<[string, any]>) {
      cases.push([`${method} ${path} request ${name}`, ex.value, req.schema]);
    }
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
    expect(cases.length).toBeGreaterThan(60);
  });

  it.each(cases)('%s', (_name, example, schema) => {
    expect(validate(example, schema)).toEqual([]);
  });
});

describe('the text the docs API serves for the reference', () => {
  it('includes the write operations', () => {
    const text = openapiToText(resolveSpec(DEFAULT_RATE_LIMITS));
    for (const heading of [
      '## Secrets',
      '### POST /secrets: Create a secret',
      '### PUT /secrets/{id}/value: Replace a secret value',
      '### POST /automations: Create an automation',
      '### POST /automations/{id}/triggers/{trigger_id}/rotate: Rotate a webhook URL or signing secret',
    ]) {
      expect(text, heading).toContain(heading);
    }
  });

  it('no em-dashes in what the write API adds', () => {
    const added = JSON.stringify([
      s.tags,
      ...OPS.map(([p, m]) => op(p, m)),
      s.components.securitySchemes,
      s.info.description,
      Object.entries(s.components.schemas).filter(([k]) => /Secret|Trigger|Automation/.test(k)),
    ]);
    expect(added).not.toContain('—');
  });
});
