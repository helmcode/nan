import { describe, expect, it } from 'vitest';
import spec from '../data/openapi.json';
import { openapiToText } from './openapiToText';
import { validate, type Schema } from '../tests/helpers/openapiValidate';

/**
 * Agent contexts in the API reference (devops AGENT-CONTEXT.md §2, cloud-api
 * B1b #395, B4a #406, B4b #407; edge Worker D3).
 *
 * Shapes come from cloud-api origin/main 715580da:
 * handlers/contexts.go and contexts_crud.go (routes, credentials, the blob
 * and upload views), middleware/pat_scopes.go (route -> scope),
 * contexts/service.go (Context, VersionInfo, File, publish order and
 * messages), contexts/errors.go, contexts/upload.go (16 MiB parts, 1000 shas),
 * contexts/scan.go (secret pattern names), handlers/runs.go (createRunBody,
 * runContextJSON), handlers/automations.go (automationContextJSON) and
 * automations/validate.go (checkout "none").
 */

const s = spec as any;
const op = (path: string, method: string) => s.paths[path][method];
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

/** Every contexts operation, its operationId and the scope it needs. */
const OPS: Array<[string, string, string, 'contexts:read' | 'contexts:write']> = [
  ['/contexts', 'get', 'listContexts', 'contexts:read'],
  ['/contexts', 'post', 'createContext', 'contexts:write'],
  ['/contexts/{id}', 'get', 'getContext', 'contexts:read'],
  ['/contexts/{id}', 'patch', 'updateContext', 'contexts:write'],
  ['/contexts/{id}', 'delete', 'deleteContext', 'contexts:write'],
  ['/contexts/{id}/versions', 'get', 'listContextVersions', 'contexts:read'],
  ['/contexts/{id}/versions', 'post', 'publishContextVersion', 'contexts:write'],
  ['/contexts/{id}/file', 'get', 'downloadContextFile', 'contexts:read'],
  ['/contexts/blobs/check', 'post', 'checkContextBlobs', 'contexts:write'],
  ['/contexts/blobs/{sha256}', 'put', 'uploadContextBlob', 'contexts:write'],
  ['/contexts/blobs/{sha256}/uploads', 'post', 'startContextUpload', 'contexts:write'],
  ['/contexts/blobs/{sha256}/uploads/{upload_id}', 'get', 'getContextUpload', 'contexts:write'],
  ['/contexts/blobs/{sha256}/uploads/{upload_id}', 'delete', 'abortContextUpload', 'contexts:write'],
  ['/contexts/blobs/{sha256}/uploads/{upload_id}/parts/{n}', 'put', 'uploadContextPart', 'contexts:write'],
  ['/contexts/blobs/{sha256}/uploads/{upload_id}/complete', 'post', 'completeContextUpload', 'contexts:write'],
];

/** contexts.secretPatterns names, in order (scan.go). */
const SECRET_PATTERNS = ['github_token', 'anthropic_key', 'openai_key', 'nan_pat', 'aws_access_key', 'slack_token', 'stripe_key', 'private_key'];

/** Every example of an operation's responses and request bodies, with its schema. */
function examples(o: any): Array<[string, unknown, Schema]> {
  const out: Array<[string, unknown, Schema]> = [];
  const add = (where: string, content: any) => {
    const c = content?.['application/json'];
    if (!c) return;
    if (c.example !== undefined) out.push([where, c.example, c.schema]);
    for (const [k, v] of Object.entries(c.examples ?? {})) out.push([`${where}/${k}`, (v as any).value, c.schema]);
  };
  for (const [status, r] of Object.entries(o.responses)) add(status, (r as any).content);
  add('request', o.requestBody?.content);
  return out;
}

describe('openapi.json: the Contexts operations', () => {
  it('the Contexts tag comes after Workspaces and links the guide', () => {
    const names = s.tags.map((t: any) => t.name);
    expect(names.slice(names.indexOf('Workspaces'))).toEqual(['Workspaces', 'Contexts']);
    const tag = s.tags.find((t: any) => t.name === 'Contexts').description as string;
    expect(tag).toContain('https://nan.builders/docs/contexts');
    expect(tag).toContain('`contexts:read`');
    expect(tag).toContain('`contexts:write`');
  });

  it.each(OPS)('%s %s (%s) is tagged Contexts and names the %s scope', (path, method, id, scope) => {
    const o = op(path, method);
    expect(o.operationId).toBe(id);
    expect(o.tags).toEqual(['Contexts']);
    expect(o.description).toContain(`with the \`${scope}\` scope`);
    if (scope === 'contexts:read') {
      // RequireContextsRead: sessions, the member's own sk- key, or a PAT with contexts:read.
      expect(o.security).toEqual([{ cliSession: [] }, { apiKey: [] }, { platformToken: [] }]);
    } else {
      // RequireWriteCredential(contexts:write): sk- keys are refused.
      expect(o.security).toEqual([{ cliSession: [] }, { platformToken: [] }]);
      expect(o.description).toContain('`403 credential_not_allowed`');
      expect(o.responses['403'].content['application/json'].examples.credential_not_allowed.value.error.message).toBe(
        'This endpoint needs a browser session, a CLI session (nan auth login) or a platform token with the "contexts:write" scope. API keys (sk-), workspace keys and sessions from older clients are not accepted here: sign in again with the CLI or at cloud.nan.builders.',
      );
    }
    expect(o.responses['401']).toEqual({ $ref: '#/components/responses/RunsUnauthorized' });
    expect(o.responses['403'].content['application/json'].examples.workspace_key_not_allowed).toBeDefined();
  });

  it.each(OPS)('%s %s: every example matches its schema', (path, method) => {
    for (const [where, value, schema] of examples(op(path, method))) expect(validate(value, schema), where).toEqual([]);
  });

  it('only GET /contexts/{id} resolves a name; the other routes take the id', () => {
    expect(op('/contexts/{id}', 'get').parameters[0].schema).toEqual({ type: 'string' });
    for (const [path, method] of OPS.filter(([p, m]) => p.startsWith('/contexts/{id}') && !(p === '/contexts/{id}' && m === 'get'))) {
      expect(op(path, method).parameters[0].schema.format, `${method} ${path}`).toBe('uuid');
    }
  });

  it('create and publish take an Idempotency-Key', () => {
    for (const [path, method] of [['/contexts', 'post'], ['/contexts/{id}/versions', 'post']]) {
      const idem = op(path, method).parameters.find((p: any) => p.name === 'Idempotency-Key');
      expect(idem.schema.pattern).toBe('^[A-Za-z0-9._:-]{1,128}$');
    }
  });

  it('uploads: 16 MiB in one PUT, parts of exactly 16 MiB above, up to 100 MiB, 1000 shas per check', () => {
    expect(s.components.schemas.ContextUpload.properties.part_size.enum).toEqual([16777216]);
    const start = op('/contexts/blobs/{sha256}/uploads', 'post').requestBody.content['application/json'].schema;
    expect(start.properties.size).toMatchObject({ minimum: 16777217, maximum: 104857600 });
    expect(start.required).toEqual(['size', 'filename']);
    expect(op('/contexts/blobs/check', 'post').requestBody.content['application/json'].schema.properties.sha256.maxItems).toBe(1000);
    expect(Object.keys(op('/contexts/blobs/{sha256}', 'put').responses)).toEqual(expect.arrayContaining(['200', '201', '409', '413', '415', '422', '429']));
  });

  it('the publish body and its refusals', () => {
    const body = s.components.schemas.PublishContextRequest;
    expect(Object.keys(body.properties)).toEqual(['base_version', 'files', 'allow_secret_like']);
    expect(body.required).toEqual(['base_version', 'files']);
    expect(body.properties.files.maxItems).toBe(1000);
    const r = op('/contexts/{id}/versions', 'post').responses;
    expect(r['409'].content['application/json'].example.current_version).toBe(3);
    expect(r['422'].content['application/json'].example.error.code).toBe('context_secret_detected');
    expect(r['422'].content['application/json'].example.findings[0]).toEqual({ path: 'files/deploy.md', line: 12, pattern: 'github_token' });
    expect(r['413'].content['application/json'].example).toMatchObject({ growing: true });
    expect(r['400'].description).toContain('`dotfile`');
  });

  it('the Context, blob and version objects have the handler fields, in order', () => {
    const sc = s.components.schemas;
    expect(Object.keys(sc.Context.properties)).toEqual([
      'id', 'object', 'name', 'description', 'version', 'tree_sha256', 'file_count', 'total_bytes', 'has_instructions', 'skills', 'created_at', 'updated_at',
    ]);
    expect(Object.keys(sc.ContextFile.properties)).toEqual(['path', 'size', 'sha256', 'executable']);
    expect(Object.keys(sc.ContextVersion.properties)).toEqual(['version', 'tree_sha256', 'file_count', 'total_bytes', 'created_at']);
    expect(Object.keys(sc.ContextBlob.properties)).toEqual(['sha256', 'size', 'format', 'secret_findings']);
    expect(sc.ContextBlob.properties.format.enum).toEqual(['text', 'pdf', 'png', 'jpeg', 'webp', 'gif', 'docx', 'xlsx', 'pptx']);
    expect(sc.ContextBlob.properties.secret_findings.items.properties.pattern.enum).toEqual(SECRET_PATTERNS);
    expect(Object.keys(sc.ContextList.properties.usage.properties)).toEqual(['stored_bytes', 'quota_bytes']);
    expect(sc.Context.properties.name.pattern).toBe('^[a-z0-9][a-z0-9-]{0,62}$');
    expect(sc.Context.properties.description.maxLength).toBe(280);
    expect(sc.Context.properties.total_bytes.maximum).toBe(262144000);
  });
});

describe('openapi.json: contexts on runs and automations', () => {
  const sc = s.components.schemas;

  it('POST /runs takes up to 5 contexts by name or id; the Run returns the pinned versions', () => {
    expect(sc.CreateRunRequest.properties.contexts).toMatchObject({ type: 'array', maxItems: 5, uniqueItems: true, items: { type: 'string' } });
    for (const code of ['context_not_found', 'context_skill_conflict', 'context_too_large', 'github_repo']) {
      expect(sc.CreateRunRequest.properties.contexts.description, code).toContain(code);
    }
    expect(sc.Run.properties.contexts.items).toEqual(ref('RunContext'));
    expect(Object.keys(sc.RunContext.properties)).toEqual(['id', 'name', 'version', 'tree_sha256']);
    expect(validate({ id: 'a', name: 'acme-api', version: 3, tree_sha256: 'f'.repeat(64) }, ref('RunContext'))).toEqual([]);
  });

  it('automations take contexts and return them as {id, name}; checkout "none" needs one', () => {
    for (const name of ['CreateAutomationRequest', 'UpdateAutomationRequest']) {
      expect(sc[name].properties.contexts).toMatchObject({ type: 'array', maxItems: 5 });
      expect(sc[name].properties.contexts.description).toContain('`409 context_in_use`');
    }
    expect(sc.Automation.properties.contexts.items).toEqual(ref('AutomationContext'));
    expect(Object.keys(sc.AutomationContext.properties)).toEqual(['id', 'name']);
    for (const name of ['Automation', 'CreateAutomationRequest', 'UpdateAutomationRequest']) {
      expect(sc[name].properties.checkout.enum).toEqual(['workspace', 'fresh', 'none']);
      expect(sc[name].properties.checkout.description).toContain('`none`: no repository');
    }
  });
});

describe('openapi.json: contexts in the credentials overview', () => {
  const desc = s.info.description as string;
  const pt = s.components.securitySchemes.platformToken.description as string;

  it('lists both scopes and the tag', () => {
    expect(desc).toContain('`contexts:read` (list, read and download contexts)');
    expect(desc).toContain('`contexts:write` (create, upload to, publish, rename and delete contexts;');
    expect(desc).toContain('[Contexts](#tag/contexts)');
    expect(pt).toContain('Contexts (`/v1/contexts...`)');
    expect(pt).toContain('`contexts:read`, `contexts:write`');
    expect(s.components.securitySchemes.apiKey.description).toContain('on reading Contexts');
  });

  it('the edge refusal names /v1/contexts', () => {
    expect(desc).toContain('/v1/notification-channels, /v1/contexts and GET /api/workspaces');
  });

  it('the generated text reference carries the routes', () => {
    const text = openapiToText(s);
    for (const [path, method] of OPS) expect(text, `${method} ${path}`).toContain(`### ${method.toUpperCase()} ${path}:`);
  });
});
