import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';
import { resolveSpec } from './apiDoc';
import { DEFAULT_RATE_LIMITS } from './rateLimits';
import { openapiToText } from './openapiToText';
import { validate, type Schema } from '../tests/helpers/openapiValidate';

/**
 * The Runs and Workspaces surface of the API reference.
 *
 * Shapes come from cloud-api origin/main: internal/runs/api.go (limits,
 * states, error codes), internal/runs/protocol (event kinds and their data),
 * internal/handlers/runs.go + runs_sse.go (routes, bodies, statuses, SSE
 * frames), internal/handlers/workspace.go + internal/workspace/models.go
 * (the workspace view) and the platform-token middleware
 * (internal/middleware/auth.go, handlers.PlatformTokenAPIRoutes).
 *
 * Examples are checked against their schemas with the small validator in
 * src/tests/helpers/openapiValidate.ts.
 */

const s = spec as any;

const RUN_OPS: Array<[string, string, string]> = [
  ['/runs', 'post', 'createRun'],
  ['/runs', 'get', 'listRuns'],
  ['/runs/{id}', 'get', 'getRun'],
  ['/runs/{id}/events', 'get', 'getRunEvents'],
  ['/runs/{id}/cancel', 'post', 'cancelRun'],
];
const WS_OPS: Array<[string, string, string]> = [
  ['/api/workspaces', 'get', 'listWorkspaces'],
  ['/api/workspaces/{id}', 'get', 'getWorkspace'],
];
const op = (path: string, method: string) => s.paths[path][method];

describe('openapi.json: Runs and Workspaces tags', () => {
  it('declares both tags with a link to their guide', () => {
    const tags = Object.fromEntries(s.tags.map((t: any) => [t.name, t.description]));
    expect(tags.Runs).toContain('https://nan.builders/docs/runs');
    expect(tags.Workspaces).toContain('https://nan.builders/docs/workspaces');
  });

  it.each([...RUN_OPS.map((o) => [...o, 'Runs']), ...WS_OPS.map((o) => [...o, 'Workspaces'])])(
    '%s %s (%s) is tagged %s',
    (path, method, id, tag) => {
      expect(op(path, method).operationId).toBe(id);
      expect(op(path, method).tags).toEqual([tag]);
    },
  );
});

describe('openapi.json: credentials', () => {
  const schemes = s.components.securitySchemes;

  it('documents the API key and the platform token as two bearer schemes', () => {
    expect(schemes.apiKey).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(schemes.apiKey.description).toContain('`sk-...`');
    expect(schemes.platformToken).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'nan_pat_...' });
    expect(schemes.platformToken.description).toMatch(/never works for inference/);
    expect(schemes.platformToken.description).toContain('token_scope_denied');
  });

  it('inference operations take the API key only (the global default)', () => {
    expect(s.security).toEqual([{ apiKey: [] }]);
    for (const [path, item] of Object.entries(s.paths) as Array<[string, any]>) {
      if (/^\/(runs|automations|approvals|secrets|notification-channels|contexts|api)(\/|$)/.test(path)) continue;
      for (const method of ['get', 'post']) if (item[method]) expect(item[method].security, path).toBeUndefined();
    }
  });

  it.each(RUN_OPS)('%s %s accepts an API key or a platform token', (path, method) => {
    expect(op(path, method).security).toEqual([{ apiKey: [] }, { platformToken: [] }]);
    expect(op(path, method).description).toContain('a member API key (`sk-...`) or a platform token (`nan_pat_...`) with the `runs` scope');
  });

  it('both Workspaces operations accept an API key or a platform token, never a workspace key (cloud-api #325)', () => {
    for (const [path, method] of WS_OPS) {
      expect(op(path, method).security).toEqual([{ apiKey: [] }, { platformToken: [] }]);
      expect(op(path, method).description).toContain('a member API key (`sk-...`) or a platform token (`nan_pat_...`)');
      expect(op(path, method).description).toMatch(/key that lives inside a workspace is not accepted/);
    }
  });

  it('the overview explains platform tokens', () => {
    expect(s.info.description).toContain('### Platform tokens');
    expect(s.info.description).toMatch(/never works for inference/);
  });
});

describe('openapi.json: the Runs contract (cloud-api)', () => {
  const body = s.components.schemas.CreateRunRequest;

  it('POST /runs body: fields, limits and defaults', () => {
    expect(body.required).toEqual(['workspace', 'agent', 'prompt']);
    expect(body.additionalProperties).toBe(false);
    expect(Object.keys(body.properties)).toEqual([
      'workspace', 'agent', 'prompt', 'cwd', 'git_isolation', 'timeout_seconds', 'model', 'trigger', 'inference',
      // Agent contexts (cloud-api handlers/runs.go createRunBody, B4a #406).
      'contexts',
    ]);
    expect(body.properties.agent.enum).toEqual(['pi', 'pi_gentle', 'hermes']);
    expect(body.properties.prompt.description).toContain('32768 bytes');
    expect(body.properties.cwd.default).toBe('/home/nan');
    expect(body.properties.git_isolation.type).toEqual(['boolean', 'null']);
    expect(body.properties.timeout_seconds).toMatchObject({ minimum: 60, maximum: 7200, default: 1800 });
    expect(body.properties.trigger).toMatchObject({ enum: ['api', 'cli', 'ui'], default: 'api' });
    expect(body.properties.model.pattern).toBe('^[A-Za-z0-9._:/-]{1,128}$');
  });

  it('POST /runs: Idempotency-Key, 201/200 and every documented error code', () => {
    const create = op('/runs', 'post');
    const idem = create.parameters.find((p: any) => p.name === 'Idempotency-Key');
    expect(idem).toMatchObject({ in: 'header', required: false });
    expect(idem.schema.pattern).toBe('^[A-Za-z0-9._:-]{1,128}$');
    expect(Object.keys(create.responses).sort()).toEqual(['200', '201', '400', '401', '403', '404', '409', '429']);
    const text = JSON.stringify(create.responses);
    for (const code of [
      'tier_restricted', 'workspace_key_not_allowed', 'workspace_not_running', 'agent_not_installed',
      'no_inference_key', 'idempotency_conflict', 'run_queue_full', 'rate_limited',
    ]) {
      expect(text, code).toContain(code);
    }
    expect(create.description).toMatch(/20 queued runs per workspace and 50 in total/);
    expect(create.description).toMatch(/60 new runs per rolling hour/);
  });

  it('only GET /runs/{id} returns the full prompt (the handler renders it nowhere else)', () => {
    for (const [path, method] of RUN_OPS) {
      for (const [status, r] of Object.entries(op(path, method).responses) as Array<[string, any]>) {
        const ex = r.content?.['application/json']?.example;
        if (!ex || typeof ex !== 'object') continue;
        const runs = Array.isArray(ex.data) ? ex.data : [ex];
        for (const run of runs) {
          if (run?.object !== 'run') continue;
          expect('prompt' in run, `${method} ${path} ${status}`).toBe(path === '/runs/{id}' && method === 'get');
        }
      }
    }
  });

  it('GET /runs: an unknown workspace filter is an empty page, not a 404', () => {
    expect(op('/runs', 'get').responses['404']).toBeUndefined();
    const ws = op('/runs', 'get').parameters.find((p: any) => p.name === 'workspace');
    expect(ws.description).toMatch(/empty page/);
  });

  it('runs 401s describe both credentials', () => {
    for (const [path, method] of RUN_OPS) {
      expect(op(path, method).responses['401']).toEqual({ $ref: '#/components/responses/RunsUnauthorized' });
    }
    expect(s.components.responses.RunsUnauthorized.description).toMatch(/API key or platform token/);
  });

  it('GET /runs: filters and the list object', () => {
    const params = Object.fromEntries(op('/runs', 'get').parameters.map((p: any) => [p.name, p]));
    expect(Object.keys(params)).toEqual(['workspace', 'automation', 'state', 'limit', 'cursor']);
    expect(params.limit.schema).toMatchObject({ minimum: 1, maximum: 100, default: 20 });
    // internal/runs/api.go States, Phase 2 adds awaiting_approval.
    expect(params.state.schema.enum).toEqual([
      'queued', 'starting', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled', 'timed_out',
    ]);
    expect(params.automation.schema.format).toBe('uuid');
    expect(Object.keys(s.components.schemas.RunList.properties)).toEqual(['object', 'data', 'next_cursor']);
  });

  it('the Run object has the fields the handler renders, in its order', () => {
    expect(Object.keys(s.components.schemas.Run.properties)).toEqual([
      'id', 'object', 'workspace', 'agent', 'model', 'trigger', 'state', 'queue_position', 'prompt_preview',
      'prompt', 'cwd', 'git_isolation', 'timeout_seconds', 'cancel_requested', 'exit_code', 'error_code',
      'result', 'usage', 'last_seq', 'created_at', 'started_at', 'finished_at',
      // Phase 2 (handlers/runs.go runJSON), same order.
      'phase', 'inference', 'automation_id', 'parent_run_id', 'apply_run_ids', 'approval', 'instructions', 'input',
      'approval_kinds', 'github_repo', 'trigger_depth', 'secrets', 'agent_finished_at', 'error',
      // Migration 110 (PR gatekeeper), same order.
      'checkout', 'superseded_by', 'sticky_pr_comment',
      // Agent contexts (runJSON, B4a #406), last as in the handler.
      'contexts',
    ]);
    expect(Object.keys(s.components.schemas.RunCheckout.properties)).toEqual(['mode', 'sha', 'pr_number', 'base_ref', 'label']);
    expect(s.components.schemas.RunCheckout.properties.mode.enum).toEqual(['fresh']);
    expect(s.components.schemas.Run.properties.checkout.oneOf).toEqual([{ $ref: '#/components/schemas/RunCheckout' }, { type: 'null' }]);
    expect(s.components.schemas.Run.properties.superseded_by.description).toContain('`concurrency_policy: "supersede"`');
    expect(Object.keys(s.components.schemas.RunEventDataStarted.properties)).toEqual(['agent', 'agent_version', 'model', 'cwd', 'worktree', 'branch', 'unit', 'checkout']);
    expect(s.components.schemas.RunEventDataStarted.properties.checkout.properties.mode.enum).toEqual(['fresh']);
    expect(s.components.schemas.RunEventDataStarted.properties.checkout.properties.sha.pattern).toBe('^[0-9a-f]{40}$');
    expect(s.components.schemas.RunCheckout.properties.sha.pattern).toBe('^[0-9a-f]{40}$');
    expect(Object.keys(s.components.schemas.RunResult.properties)).toEqual([
      'status', 'summary', 'branch', 'commit', 'changed_files', 'artifacts', 'actions_applied',
    ]);
    expect(s.components.schemas.Run.properties.trigger.enum).toEqual([
      'api', 'cli', 'ui', 'webhook', 'schedule', 'approval', 'automation',
    ]);
    expect(s.components.schemas.Run.properties.phase.enum).toEqual(['run', 'propose', 'apply']);
    for (const code of ['secrets_unavailable', 'secret_missing', 'proposal_invalid', 'approval_rejected', 'approval_expired', 'action_failed', 'automation_deleted']) {
      expect(s.components.schemas.Run.properties.error_code.enum, code).toContain(code);
      expect(s.components.schemas.RunEventDataFinished.properties.error_code.enum, code).toContain(code);
    }
  });

  it('events: the twelve event kinds, the message chunks and the page shape', () => {
    const event = s.components.schemas.RunEvent;
    expect(Object.keys(event.properties)).toEqual(['seq', 'ts', 'type', 'data']);
    expect(event.properties.type.enum).toEqual([
      'started', 'log', 'message', 'tool_call', 'tool_result', 'usage', 'artifact', 'error', 'truncated', 'finished',
      'approval_required', 'action',
    ]);
    expect(event.properties.data.oneOf).toHaveLength(12);
    expect(s.components.schemas.RunEventDataMessage.description).toMatch(/incrementally.*`final: true`/s);
    expect(Object.keys(s.components.schemas.RunEventPage.properties)).toEqual(['data', 'next_after', 'done']);
  });

  it('events: SSE frames, heartbeat, resume, lifetime and stream cap', () => {
    const events = op('/runs/{id}/events', 'get');
    for (const needle of ['event: run_event', 'event: state', 'event: end', '`: hb`', '15 seconds', 'Last-Event-ID', '30 minutes', '10 open streams']) {
      expect(events.description, needle).toContain(needle);
    }
    expect(Object.keys(events.responses['200'].content)).toEqual(['text/event-stream', 'application/json']);
    const params = Object.fromEntries(events.parameters.map((p: any) => [p.name, p]));
    expect(params.limit.schema).toMatchObject({ minimum: 1, maximum: 1000, default: 500 });
    expect(params['Last-Event-ID'].in).toBe('header');
    expect(JSON.stringify(events.responses['429'])).toContain('too_many_streams');
    const sse = events.responses['200'].content['text/event-stream'].example as string;
    expect(sse).toMatch(/^id: 1\nevent: run_event\ndata: \{/);
    expect(sse).toContain(': hb\n\n');
  });

  it('cancel: 202 accepted, 200 when the run had already ended', () => {
    expect(Object.keys(op('/runs/{id}/cancel', 'post').responses).sort()).toEqual(['200', '202', '401', '403', '404']);
  });
});

describe('openapi.json: the Workspaces contract (cloud-api)', () => {
  it('both routes live on api.nan.builders, outside /v1, and nothing else under /api', () => {
    const apiPaths = Object.keys(s.paths).filter((p) => p.startsWith('/api/'));
    expect(apiPaths).toEqual(['/api/workspaces', '/api/workspaces/{id}']);
    for (const p of apiPaths) {
      expect(s.paths[p].servers).toEqual([expect.objectContaining({ url: 'https://api.nan.builders' })]);
      expect(Object.keys(s.paths[p]).filter((k) => k !== 'servers')).toEqual(['get']);
    }
    expect(JSON.stringify(s)).not.toContain('cloud-api.nan.builders');
  });

  it('GET /api/workspaces/{id}: a foreign workspace is the same 404 as an unknown one, never 403 (cloud-api #324)', () => {
    const r = op('/api/workspaces/{id}', 'get').responses;
    expect(Object.keys(r).sort()).toEqual(['200', '401', '404']);
    expect(r['404'].content['application/json'].examples.workspace_not_found.value).toEqual({ error: 'workspace not found' });
    expect(r['404'].description).toMatch(/belongs to another member \(the answer is identical\)/);
    // A non-UUID id never reaches the API on api.nan.builders: the edge answers 404 in the OpenAI shape.
    expect(r['404'].content['application/json'].examples.malformed_id.value).toEqual({
      error: { message: 'Not found.', type: 'invalid_request_error', code: '404' },
    });
    expect(JSON.stringify(s.paths['/api/workspaces/{id}'])).not.toMatch(/forbidden|token_scope_denied/);
  });

  /**
   * The 401 bodies of cloud-api's /api Auth (internal/middleware/auth.go),
   * byte for byte: no credential, a credential that resolves to nobody, and a
   * key the route refuses (the workspace key).
   */
  it.each(WS_OPS)('%s %s: the 401 examples are the real bodies', (path, method) => {
    const ex = op(path, method).responses['401'].content['application/json'].examples;
    expect(Object.keys(ex)).toEqual(['unauthorized', 'invalid_session', 'session_required']);
    expect(ex.unauthorized.value).toEqual({ error: 'unauthorized' });
    expect(ex.invalid_session.value).toEqual({ error: 'invalid session' });
    expect(ex.session_required.value).toEqual({
      error: 'session_required',
      // internal/middleware/auth.go sessionRequiredBody (cloud-api #326).
      message:
        'This endpoint requires a signed-in session. API keys (sk-) only work for inference (https://api.nan.builders/v1), the runs API (/v1/runs) and the read-only endpoints GET /api/workspaces, GET /api/workspaces/{uuid} and GET /api/usage/quota.',
    });
  });

  it.each(WS_OPS)('%s %s: says api.nan.builders is bearer-only with no browser CORS', (path, method) => {
    const d = op(path, method).description;
    expect(d).toMatch(/bearer credential only: cookies are ignored/);
    expect(d).toMatch(/no browser CORS support \(`OPTIONS` answers `404`\)/);
  });

  it('only the caller\'s own workspaces, and never a secret', () => {
    expect(op('/api/workspaces', 'get').description).toMatch(/Your own workspaces, and only yours/);
    expect(op('/api/workspaces/{id}', 'get').description).toMatch(/Only your own workspaces are returned: another member's workspace answers `404`/);
    const props = Object.keys(s.components.schemas.Workspace.properties);
    for (const secret of ['agent_configs', 'hermes_env', 'member_uuid', 'api_key', 'token']) {
      expect(props).not.toContain(secret);
    }
    expect(s.components.schemas.WorkspaceDetail.allOf[1].properties.env_var_keys.description).toMatch(/Never the values/);
  });
});

describe('openapi.json: every Runs and Workspaces example matches its schema', () => {
  const cases: Array<[string, unknown, Schema]> = [];
  for (const [path, method] of [...RUN_OPS, ...WS_OPS]) {
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
  cases.push(['RunEvent example', s.components.schemas.RunEvent.example, s.components.schemas.RunEvent]);

  it('finds the examples to check', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases)('%s', (_name, example, schema) => {
    expect(validate(example, schema)).toEqual([]);
  });

  it('the SSE example frames carry valid events', () => {
    const sse = op('/runs/{id}/events', 'get').responses['200'].content['text/event-stream'].example as string;
    const frames = sse.split('\n\n').filter((f) => f.includes('event: run_event'));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      const data = JSON.parse(/^data: (.*)$/m.exec(frame)![1]);
      expect(validate(data, { $ref: '#/components/schemas/RunEvent' })).toEqual([]);
      expect(frame).toContain(`id: ${data.seq}\n`);
    }
  });

  it('the validator itself rejects a wrong example', () => {
    expect(validate({ workspace: 'w', agent: 'codex', prompt: 'x' }, s.components.schemas.CreateRunRequest)).not.toEqual([]);
    expect(validate({ workspace: 'w', agent: 'pi', prompt: 'x', extra: 1 }, s.components.schemas.CreateRunRequest)).not.toEqual([]);
    expect(validate({ timeout_seconds: 30 }, s.components.schemas.CreateRunRequest)).not.toEqual([]);
  });
});

describe('the text the docs API serves for the reference', () => {
  it('includes the Runs and Workspaces operations', () => {
    const text = openapiToText(resolveSpec(DEFAULT_RATE_LIMITS));
    for (const heading of [
      '### POST /runs: Create a run',
      '### GET /runs/{id}/events: Follow a run',
      '### POST /runs/{id}/cancel: Cancel a run',
      '### GET /api/workspaces: List workspaces',
      '### GET /api/workspaces/{id}: Retrieve a workspace',
    ]) {
      expect(text, heading).toContain(heading);
    }
  });

  it('no em-dashes in what this PR adds', () => {
    const added = JSON.stringify([
      s.tags.filter((t: any) => ['Runs', 'Workspaces'].includes(t.name)),
      ...[...RUN_OPS, ...WS_OPS].map(([p, m]) => op(p, m)),
      s.components.securitySchemes,
      Object.entries(s.components.schemas).filter(([k]) => /^(Run|Workspace|CreateRun|PlatformError)/.test(k)),
    ]);
    expect(added).not.toContain('—');
  });
});

/**
 * The run agents (cloud-api #345): `pi`, `pi_gentle` (Pi + Gentle Shell) and
 * `hermes`, in the display order of software.RunAgentIDs. Every agent enum of
 * the reference mirrors protocol.Agents; the workspace object carries
 * `run_agents`; an agent the workspace lacks is `409 agent_not_installed`
 * with `param: "agent"` and a message naming the agent (runs.AgentName).
 */
describe('openapi.json: run agents (Pi, Pi + Gentle Shell, Hermes)', () => {
  const AGENTS = ['pi', 'pi_gentle', 'hermes'];
  const sc = s.components.schemas;

  it.each([
    ['CreateRunRequest', sc.CreateRunRequest.properties.agent],
    ['Run', sc.Run.properties.agent],
    ['RunEventDataStarted', sc.RunEventDataStarted.properties.agent],
    ['Automation', sc.Automation.properties.agent],
  ])('%s.agent is exactly pi, pi_gentle, hermes', (_name, prop) => {
    expect(prop.enum).toEqual(AGENTS);
  });

  it('no schema anywhere still lists only pi and hermes', () => {
    const stale: string[] = [];
    const walk = (node: any, path: string) => {
      if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}/${i}`));
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.enum) && node.enum.includes('hermes') && !node.enum.includes('pi_gentle')) stale.push(path);
      for (const [k, v] of Object.entries(node)) walk(v, `${path}/${k}`);
    };
    walk(s, '');
    expect(stale).toEqual([]);
  });

  it('describes each agent value by its portal label', () => {
    for (const prop of [sc.CreateRunRequest.properties.agent, sc.Run.properties.agent, sc.Automation.properties.agent]) {
      expect(prop.description).toContain('`pi` (Pi)');
      expect(prop.description).toContain('`pi_gentle` (Pi + Gentle Shell');
      expect(prop.description).toContain('`hermes` (Hermes)');
    }
    expect(sc.CreateRunRequest.properties.agent.description).toMatch(/`409 agent_not_installed` with `param: "agent"`/);
    expect(s.tags.find((t: any) => t.name === 'Runs').description).toContain('(Pi, Pi + Gentle Shell or Hermes)');
  });

  it('the workspace carries run_agents, right after agent_selection, with the same enum', () => {
    const keys = Object.keys(sc.Workspace.properties);
    expect(keys.indexOf('run_agents')).toBe(keys.indexOf('agent_selection') + 1);
    const ra = sc.Workspace.properties.run_agents;
    expect(ra.type).toBe('array');
    expect(ra.items.enum).toEqual(AGENTS);
    expect(ra.description).toMatch(/display order/);
    expect(ra.description).toContain('`pi_gentle` needs Pi and gentle-shell');
    expect(ra.description).toContain('409 agent_not_installed');
  });

  it('both workspace examples show run_agents in display order', () => {
    const list = op('/api/workspaces', 'get').responses['200'].content['application/json'].example;
    const one = op('/api/workspaces/{id}', 'get').responses['200'].content['application/json'].example;
    for (const ws of [list[0], one]) {
      expect(ws.run_agents).toEqual(AGENTS.filter((a) => ws.run_agents.includes(a)));
      expect(ws.run_agents).toContain('pi_gentle');
    }
  });

  it.each([
    ['/runs', 'Pi + Gentle Shell'],
    ['/automations/{id}/runs', 'Hermes'],
  ])('POST %s: the 409 agent_not_installed example names the agent and the agent field', (path, label) => {
    const r = op(path, 'post').responses['409'];
    const ex = r.content['application/json'].examples.agent_not_installed.value;
    expect(ex).toEqual({
      error: { message: `${label} is not installed in this workspace`, type: 'invalid_request_error', param: 'agent', code: 'agent_not_installed' },
    });
    expect(validate(ex, r.content['application/json'].schema)).toEqual([]);
    expect(r.description).toContain('`agent_not_installed`');
    expect(r.description).toContain('`param: "agent"`');
  });

  it('POST /runs keeps the workspace_not_running example next to the new one', () => {
    const ex = op('/runs', 'post').responses['409'].content['application/json'].examples;
    expect(Object.keys(ex)).toEqual(['workspace_not_running', 'agent_not_installed']);
    expect(ex.workspace_not_running.value.error.code).toBe('workspace_not_running');
  });

  it('the validator accepts every agent and rejects near misses', () => {
    for (const agent of AGENTS) {
      expect(validate({ workspace: 'w', agent, prompt: 'x' }, sc.CreateRunRequest), agent).toEqual([]);
    }
    for (const agent of ['pi-gentle', 'gentle_shell', 'gentle-shell', 'Pi', 'pi_gentle ']) {
      expect(validate({ workspace: 'w', agent, prompt: 'x' }, sc.CreateRunRequest), agent).not.toEqual([]);
    }
  });
});
