import { normalizeCanonicalText } from './mdxToText';

/**
 * Turns the OpenAPI spec into the Markdown /api/docs serves as if it were one
 * more page of the collection.
 *
 * It exists because of the Discord bot. When the API reference stopped being
 * `api.mdx`, the manifest would have lost its `api` entry, and the bot does
 * not fail on that: it silently drops the chunks of a source that disappears
 * (`stale_sources` in bot/knowledge.py::load_documentation_from_remote). We
 * would have lost the content it gets asked about the most without a single
 * alarm going off.
 *
 * Serving the raw JSON is no good either: the bot splits on PARAGRAPHS into
 * ~2000-character blocks (bot/knowledge.py::chunk_text) and embeds each one.
 * An openapi.json cut every 2000 characters yields fragments severed
 * mid-brace and meaningless embeddings. What the bot needs is prose in
 * paragraphs, and where that prose comes from is none of its concern.
 *
 * The output goes through normalizeCanonicalText so it is a fixed point of
 * the bot's canonicaliser, exactly like mdxToText's: otherwise its hash would
 * never agree with ours and it would re-index the whole reference on every
 * manifest version.
 */

/** The subset of the spec read here. Everything else is ignored quietly. */
interface Spec {
  info?: { title?: string; description?: string; version?: string };
  servers?: Array<{ url?: string; description?: string }>;
  tags?: Array<{ name?: string; description?: string }>;
  paths?: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, SchemaLike>;
    responses?: Record<string, ResponseOrRef>;
  };
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content?: Record<string, MediaType> };
  // A response is either a Response Object or a Reference Object into
  // #/components/responses: shared codes (401, 429...) travel as a $ref.
  responses?: Record<string, ResponseOrRef>;
  'x-codeSamples'?: Array<{ lang?: string; label?: string; source?: string }>;
}

interface ResponseOrRef {
  description?: string;
  $ref?: string;
}

interface Parameter {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: SchemaLike;
}

interface MediaType {
  schema?: SchemaLike;
}

interface SchemaLike {
  // In OpenAPI 3.1 `type` may be a list: `["string", "null"]` is how a
  // nullable field is declared (finish_reason, among others).
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  required?: string[];
  // The value is optional because a `oneOf` of objects with different keys
  // makes TypeScript infer `key?: undefined` on the branches that lack it
  // (ContentPart: text | image_url). typeName and describeField already
  // handle the undefined.
  properties?: Record<string, SchemaLike | undefined>;
  items?: SchemaLike;
  $ref?: string;
  allOf?: SchemaLike[];
  anyOf?: SchemaLike[];
  oneOf?: SchemaLike[];
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

/** `#/components/schemas/Message` -> `Message`. */
function refName(ref: string): string {
  return ref.split('/').pop() || ref;
}

/**
 * Readable type name for a field, for the "Type" column of the tables.
 * It does not resolve the `$ref`: it names it and leaves the reader to the
 * schema, which is documented separately. Resolving it here would expand the
 * same object once per endpoint and multiply the size of the embedded text.
 */
function typeName(schema: SchemaLike | undefined): string {
  if (!schema) return 'any';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.allOf?.length) return schema.allOf.map(typeName).join(' & ');
  if (schema.oneOf?.length) return schema.oneOf.map(typeName).join(' | ');
  if (schema.anyOf?.length) return schema.anyOf.map(typeName).join(' | ');
  if (Array.isArray(schema.type)) {
    return schema.type.join(' | ') || 'any';
  }
  if (schema.type === 'array') return `${typeName(schema.items)}[]`;
  return schema.type || 'any';
}

/**
 * Flattens text for a table cell: newlines would break the Markdown row and a
 * pipe would open a new column.
 */
function cell(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

/** Describes a field: description + enum + default, in a single cell. */
function describeField(schema: SchemaLike | undefined, description?: string): string {
  const parts: string[] = [];
  const desc = description ?? schema?.description;
  if (desc) parts.push(cell(desc));
  if (schema?.enum?.length) {
    parts.push(`One of: ${schema.enum.map((v) => `\`${String(v)}\``).join(', ')}.`);
  }
  if (schema?.default !== undefined) parts.push(`Default \`${String(schema.default)}\`.`);
  return parts.join(' ');
}

/** Property table for an object. Returns '' when there are none. */
function propertyTable(schema: SchemaLike | undefined): string {
  if (!schema?.properties) return '';
  const required = new Set(schema.required ?? []);
  const rows = Object.entries(schema.properties).map(([name, prop]) => {
    const req = required.has(name) ? 'required' : 'optional';
    return `| \`${name}\` | ${typeName(prop)} · ${req} | ${describeField(prop)} |`;
  });
  if (rows.length === 0) return '';
  return ['| Field | Type | Description |', '| --- | --- | --- |', ...rows].join('\n');
}

/**
 * Demotes any headings a spec description carries.
 *
 * They are written for Scalar, which paints them inside the endpoint panel, so
 * they start at `##`. Dumped as-is into a flat document they would outrank the
 * `###` of the very endpoint they belong to: the `## Use it as an agent tool`
 * of /search read as a sibling section of "Search" instead of part of it. They
 * sink until they sit below, capped at `######`.
 *
 * Only headings at the start of a line and outside a code fence count: inside
 * a ``` a `#` is usually a shell comment.
 */
function demoteHeadings(markdown: string, by: number): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const m = /^(#{1,6})(\s)/.exec(line);
      if (!m) return line;
      const level = Math.min(6, m[1].length + by);
      return `${'#'.repeat(level)}${line.slice(m[1].length)}`;
    })
    .join('\n');
}

/**
 * A response's description, resolving the $ref when it carries one.
 *
 * The shared codes (401, 403, 429, 402) live in components.responses and each
 * endpoint references them. Without resolving them the response table came out
 * with an empty cell (`| 401 | |`) and whoever read the text (or the bot) had
 * no idea what each code means on that endpoint.
 */
function responseDescription(spec: Spec, res: ResponseOrRef | undefined): string {
  if (!res) return '';
  if (res.description) return cell(res.description);
  if (res.$ref) {
    const name = refName(res.$ref);
    const target = spec.components?.responses?.[name];
    if (target?.description) return cell(target.description);
    return name;
  }
  return '';
}

function renderOperation(spec: Spec, path: string, method: string, op: Operation): string {
  const out: string[] = [];
  const title = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;

  out.push(`### ${method.toUpperCase()} ${path}: ${title}`);
  if (op.deprecated) out.push('**Deprecated.**');
  // The operation is a `###`, so its subsections drop to `#####` so they do
  // not compete with the `####` this same function emits (Parameters, etc.).
  if (op.description) out.push(demoteHeadings(op.description.trim(), 3));

  const params = op.parameters ?? [];
  if (params.length > 0) {
    out.push('#### Parameters');
    out.push(
      [
        '| Parameter | In | Type | Description |',
        '| --- | --- | --- | --- |',
        ...params.map(
          (p) =>
            `| \`${p.name ?? ''}\` | ${p.in ?? ''} | ${typeName(p.schema)} · ${
              p.required ? 'required' : 'optional'
            } | ${describeField(p.schema, p.description)} |`,
        ),
      ].join('\n'),
    );
  }

  const bodyContent = op.requestBody?.content ?? {};
  for (const [mediaType, media] of Object.entries(bodyContent)) {
    const table = propertyTable(media.schema);
    const required = op.requestBody?.required ? 'required' : 'optional';
    out.push(`#### Request body (\`${mediaType}\`, ${required})`);
    if (table) {
      out.push(table);
    } else if (media.schema?.$ref) {
      out.push(`See the \`${refName(media.schema.$ref)}\` schema.`);
    }
  }

  const responses = op.responses ?? {};
  const responseRows = Object.entries(responses).map(
    ([status, res]) => `| \`${status}\` | ${responseDescription(spec, res)} |`,
  );
  if (responseRows.length > 0) {
    out.push('#### Responses');
    out.push(['| Status | Description |', '| --- | --- |', ...responseRows].join('\n'));
  }

  for (const sample of op['x-codeSamples'] ?? []) {
    if (!sample.source) continue;
    out.push(`#### Example: ${sample.label || sample.lang || 'request'}`);
    out.push(`\`\`\`${sample.lang || ''}\n${sample.source}\n\`\`\``);
  }

  return out.join('\n\n');
}

/** Documents the reusable schemas, which the endpoints only name. */
function renderSchemas(spec: Spec): string {
  const schemas = spec.components?.schemas ?? {};
  const names = Object.keys(schemas).sort();
  if (names.length === 0) return '';

  const out: string[] = ['## Schemas'];
  out.push(
    'Objects reused across endpoints. Where a field above names one of these, this is its shape.',
  );
  for (const name of names) {
    const schema = schemas[name];
    out.push(`### ${name}`);
    if (schema.description) out.push(cell(schema.description));
    const table = propertyTable(schema);
    if (table) {
      out.push(table);
    } else {
      out.push(`Type: ${typeName(schema)}.`);
    }
  }
  return out.join('\n\n');
}

/**
 * The whole spec as Markdown. Grouped by tag, in the order the spec declares
 * them, which is the order Scalar paints them in: the text the bot reads and
 * the page a person reads walk the API in the same order.
 */
export function openapiToText(spec: Spec): string {
  const out: string[] = [];
  const info = spec.info ?? {};

  out.push(`# ${info.title ?? 'API'} Reference`);

  const server = spec.servers?.[0]?.url;
  if (server) out.push(`Base URL: \`${server}\``);
  if (info.description) out.push(info.description.trim());

  // Operations indexed by tag, preserving order of appearance.
  const byTag = new Map<string, string[]>();
  const tagOrder: string[] = (spec.tags ?? []).map((t) => t.name ?? '').filter(Boolean);

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const tag = op.tags?.[0] || 'Endpoints';
      if (!byTag.has(tag)) {
        byTag.set(tag, []);
        if (!tagOrder.includes(tag)) tagOrder.push(tag);
      }
      byTag.get(tag)!.push(renderOperation(spec, path, method, op));
    }
  }

  const tagDescriptions = new Map(
    (spec.tags ?? []).map((t) => [t.name ?? '', t.description ?? '']),
  );

  for (const tag of tagOrder) {
    const ops = byTag.get(tag);
    if (!ops || ops.length === 0) continue;
    out.push(`## ${tag}`);
    const desc = tagDescriptions.get(tag);
    if (desc) out.push(desc);
    out.push(...ops);
  }

  const schemas = renderSchemas(spec);
  if (schemas) out.push(schemas);

  return normalizeCanonicalText(out.join('\n\n'));
}
