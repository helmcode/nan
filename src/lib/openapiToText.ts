import { normalizeCanonicalText } from './mdxToText';

/**
 * Convierte el spec OpenAPI en el Markdown que /api/docs sirve como si fuera
 * una página más de la colección.
 *
 * Existe por el bot de Discord. Cuando la referencia de API dejó de ser
 * `api.mdx`, el manifest se habría quedado sin la entrada `api`, y el bot no
 * falla ante eso: borra en silencio los chunks de la fuente que desaparece
 * (`stale_sources` en bot/knowledge.py::load_documentation_from_remote). Es
 * decir, habríamos perdido justo el contenido que más se le pregunta sin que
 * saltara ninguna alarma.
 *
 * Servir el JSON crudo tampoco vale: el bot trocea por PÁRRAFOS en bloques de
 * ~2000 caracteres (bot/knowledge.py::chunk_text) y embebe cada trozo. Un
 * openapi.json partido cada 2000 caracteres produce fragmentos cortados a
 * mitad de llave y embeddings sin sentido. Lo que el bot necesita es prosa en
 * párrafos, y de dónde salga esa prosa le da igual.
 *
 * La salida pasa por normalizeCanonicalText para ser un punto fijo del
 * canonicalizador del bot, igual que la de mdxToText: si no lo fuera, su hash
 * nunca coincidiría con el nuestro y reindexaría la referencia entera en cada
 * versión del manifest.
 */

/** Sub-conjunto del spec que se lee aquí. El resto se ignora sin molestar. */
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
  // Una respuesta es un Response Object o un Reference Object a
  // #/components/responses: los códigos compartidos (401, 429…) van por $ref.
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
  // En OpenAPI 3.1 `type` puede ser una lista: `["string", "null"]` es como se
  // declara un campo anulable (finish_reason, entre otros).
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  required?: string[];
  // El valor va como opcional porque un `oneOf` de objetos con claves distintas
  // hace que TypeScript infiera `clave?: undefined` en las ramas que no la
  // tienen (ContentPart: text | image_url). typeName y describeField ya tratan
  // el undefined.
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
 * Nombre legible del tipo de un campo, para la columna "Type" de las tablas.
 * No resuelve el `$ref`: lo nombra y enlaza mentalmente al esquema, que se
 * documenta aparte. Resolverlo aquí expandiría el mismo objeto una vez por
 * endpoint y multiplicaría el tamaño del texto que se embebe.
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
 * Aplana el texto para una celda de tabla: los saltos de línea romperían la
 * fila en Markdown y la barra vertical abriría una columna nueva.
 */
function cell(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

/** Describe un campo: descripción + enum + default, en una sola celda. */
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

/** Tabla de propiedades de un objeto. Devuelve '' si no hay ninguna. */
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
 * Baja de nivel los encabezados que traiga una descripción del spec.
 *
 * Están escritos para Scalar, que los pinta dentro del panel del endpoint, así
 * que empiezan en `##`. Volcados tal cual en un documento plano quedarían por
 * encima del `###` del propio endpoint al que pertenecen: el `## Use it as an
 * agent tool` de /search se leía como una sección hermana de "Search" en vez de
 * como parte suya. Se hunden hasta quedar por debajo, con tope en `######`.
 *
 * Solo cuentan los encabezados a principio de línea y fuera de un bloque de
 * código: dentro de un ``` un `#` suele ser un comentario de shell.
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
 * Descripción de una respuesta, resolviendo el $ref si lo lleva.
 *
 * Los códigos compartidos (401, 403, 429, 402) están en components.responses y
 * cada endpoint los referencia. Sin resolverlos, la tabla de respuestas salía
 * con la celda vacía —`| 401 | |`— y quien leyera el texto (o el bot) no se
 * enteraba de qué significa cada código en ese endpoint.
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

  out.push(`### ${method.toUpperCase()} ${path} — ${title}`);
  if (op.deprecated) out.push('**Deprecated.**');
  // La operación es un `###`, así que sus subsecciones bajan a `#####` para no
  // competir con los `####` que genera esta misma función (Parameters, etc.).
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
    out.push(`#### Example — ${sample.label || sample.lang || 'request'}`);
    out.push(`\`\`\`${sample.lang || ''}\n${sample.source}\n\`\`\``);
  }

  return out.join('\n\n');
}

/** Documenta los esquemas reutilizables, que los endpoints solo nombran. */
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
 * El spec entero como Markdown. Se agrupa por tag, en el orden en que el spec
 * los declara, que es el orden en el que Scalar los pinta: el texto que lee el
 * bot y la página que lee una persona recorren la API en el mismo orden.
 */
export function openapiToText(spec: Spec): string {
  const out: string[] = [];
  const info = spec.info ?? {};

  out.push(`# ${info.title ?? 'API'} Reference`);

  const server = spec.servers?.[0]?.url;
  if (server) out.push(`Base URL: \`${server}\``);
  if (info.description) out.push(info.description.trim());

  // Operaciones indexadas por tag, conservando el orden de aparición.
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
