import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkStringify from 'remark-stringify';

const KNOWN_COMPONENTS = new Set([
  'ModelCard',
  'LimitationsCard',
  'EndpointGrid',
  'FieldList',
  'Callout',
  'RateLimits',
]);

const AUTHOR_HTML_BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4']);
const AUTHOR_HTML_INLINE_TAGS = new Set(['a', 'code', 'strong', 'b', 'em', 'i', 'br']);

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
  le: '≤',
  ge: '≥',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (ENTITIES[n] !== undefined ? ENTITIES[n] : m));
}

export function stripInlineHtml(input: string): string {
  let s = input;
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, a, t) => {
    const hrefMatch = a.match(/href\s*=\s*"([^"]*)"/i);
    const href = hrefMatch ? hrefMatch[1] : null;
    const text = stripInlineHtml(t).trim();
    return href ? `[${text}](${href})` : text;
  });
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, t) => `\`${stripInlineHtml(t).replace(/`/g, '')}\``);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/(strong|b)>/gi, (_m, _t, t) => `**${stripInlineHtml(t).trim()}**`);
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/(em|i)>/gi, (_m, _t, t) => `*${stripInlineHtml(t).trim()}*`);
  s = s.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, (_m, t) => stripInlineHtml(t));
  s = decodeEntities(s);
  return s;
}

export function htmlNodeToMarkdown(input: string): string {
  let s = input;
  s = s.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n\n# ${stripInlineHtml(t).trim()}\n\n`);
  s = s.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n\n## ${stripInlineHtml(t).trim()}\n\n`);
  s = s.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n\n### ${stripInlineHtml(t).trim()}\n\n`);
  s = s.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_m, t) => `\n\n#### ${stripInlineHtml(t).trim()}\n\n`);
  return stripInlineHtml(s);
}

export function astToValue(node: unknown): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as { type: string; [k: string]: unknown };
  switch (n.type) {
    case 'Literal':
      return (n as { value: unknown }).value;
    case 'ArrayExpression':
      return ((n as { elements: unknown[] }).elements || []).map((e) => astToValue(e));
    case 'ObjectExpression': {
      const obj: Record<string, unknown> = {};
      const props = (n as { properties: unknown[] }).properties || [];
      for (const p of props) {
        const prop = p as { type: string; key: { type: string; name?: string; value?: unknown }; value: unknown };
        if (prop.type !== 'Property') continue;
        let key: string;
        if (prop.key.type === 'Identifier') key = prop.key.name as string;
        else key = String(astToValue(prop.key));
        obj[key] = astToValue(prop.value);
      }
      return obj;
    }
    case 'TemplateLiteral': {
      const quasis = ((n as { quasis: { value: { cooked: string } }[] }).quasis || []);
      return quasis.map((q) => q.value.cooked).join('');
    }
    case 'UnaryExpression': {
      const op = (n as { operator: string; argument: unknown }).operator;
      const arg = astToValue((n as { argument: unknown }).argument);
      if (op === '-' && typeof arg === 'number') return -arg;
      if (op === '+' && typeof arg === 'number') return arg;
      if (op === '!') return !arg;
      return undefined;
    }
    case 'Identifier': {
      const name = (n as { name: string }).name;
      if (name === 'undefined') return undefined;
      return undefined;
    }
    default:
      return undefined;
  }
}

export function getAttr(node: { attributes?: unknown[] }, name: string): unknown {
  if (!Array.isArray(node.attributes)) return undefined;
  for (const a of node.attributes) {
    const attr = a as {
      type: string;
      name?: string;
      value?: unknown;
    };
    if (attr.type !== 'mdxJsxAttribute') continue;
    if (attr.name !== name) continue;
    if (typeof attr.value === 'string') return attr.value;
    if (attr.value == null) return true;
    const v = attr.value as { type: string; data?: { estree?: { body?: unknown[] } } };
    if (v.type === 'mdxJsxAttributeValueExpression') {
      const body = v.data?.estree?.body;
      if (Array.isArray(body) && body[0]) {
        const expr = (body[0] as { expression?: unknown }).expression;
        return astToValue(expr);
      }
    }
  }
  return undefined;
}

function getName(node: { name?: string | null }): string {
  return node.name || '';
}

function textOfChildren(node: { children?: unknown[] }): string {
  if (!Array.isArray(node.children)) return '';
  return node.children
    .map((c) => {
      const child = c as { type: string; value?: string; children?: unknown[] };
      if (child.type === 'text') return child.value || '';
      if (Array.isArray(child.children)) return textOfChildren(child);
      return '';
    })
    .join('');
}

const stringifier = unified()
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    fences: true,
    rule: '-',
    listItemIndent: 'one',
  });

function stringifyBlockChildren(children: unknown[]): string {
  const root = { type: 'root', children: (children || []) as unknown[] } as unknown;
  return (stringifier.stringify(root as never) as string).replace(/\r\n/g, '\n');
}

function stringifyInlineChildren(children: unknown[]): string {
  const root = {
    type: 'root',
    children: [{ type: 'paragraph', children: (children || []) as unknown[] }],
  } as unknown;
  return (stringifier.stringify(root as never) as string).replace(/\r\n/g, '\n').trim();
}

function mdToBlockChildren(md: string): unknown[] {
  const proc = unified().use(remarkParse).use(remarkGfm);
  const tree = proc.parse(md) as { children: unknown[] };
  return tree.children;
}

function mdToInlineChildren(md: string): unknown[] {
  const proc = unified().use(remarkParse).use(remarkGfm);
  const tree = proc.parse(md) as { children: unknown[] };
  const first = tree.children[0] as { type?: string; children?: unknown[] } | undefined;
  if (!first || first.type !== 'paragraph' || !Array.isArray(first.children)) {
    return [{ type: 'text', value: md }];
  }
  return first.children;
}

interface MdxNode {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  children?: unknown[];
}

function componentToBlockMd(node: MdxNode): string {
  const name = getName(node);
  switch (name) {
    case 'ModelCard':
      return modelCardToMd(node);
    case 'LimitationsCard':
      return limitationsCardToMd(node);
    case 'EndpointGrid':
      return endpointGridToMd(node);
    case 'FieldList':
      return fieldListToMd(node);
    case 'Callout':
      return calloutToMd(node);
    case 'RateLimits':
      return rateLimitsToMd();
    default:
      throw new Error(`Unknown MDX block component: <${name || '?'}>`);
  }
}

function modelCardToMd(node: MdxNode): string {
  const name = String(getAttr(node, 'name') ?? '');
  const tag = getAttr(node, 'tag');
  const leftLabel = String(getAttr(node, 'leftLabel') ?? '');
  const rightLabel = String(getAttr(node, 'rightLabel') ?? '');
  const description = String(getAttr(node, 'description') ?? '');
  const specs = (getAttr(node, 'specs') as Array<{ label?: string; value?: string }> | undefined) || [];
  const items = (getAttr(node, 'items') as string[] | undefined) || [];

  const heading = tag ? `### ${name} - ${tag}` : `### ${name}`;
  const lines: string[] = [heading, '', description, '', `**${leftLabel}**`, ''];
  for (const s of specs) {
    const label = String(s.label ?? '');
    const value = stripInlineHtml(String(s.value ?? ''));
    lines.push(`- ${label}: ${value}`);
  }
  lines.push('');
  lines.push(`**${rightLabel}**`);
  lines.push('');
  for (const it of items) {
    lines.push(`- ${stripInlineHtml(String(it))}`);
  }
  lines.push('');
  return lines.join('\n');
}

function limitationsCardToMd(node: MdxNode): string {
  const title = String(getAttr(node, 'title') ?? 'limitaciones conocidas');
  const items = (getAttr(node, 'items') as Array<{ title?: string; body?: string }> | undefined) || [];

  const lines: string[] = [`### ${title}`, ''];
  for (const it of items) {
    const t = stripInlineHtml(String(it.title ?? ''));
    const body = stripInlineHtml(String(it.body ?? ''));
    lines.push(`**${t}**`);
    lines.push('');
    lines.push(body);
    lines.push('');
  }
  return lines.join('\n');
}

function endpointGridToMd(node: MdxNode): string {
  const items =
    (getAttr(node, 'items') as Array<{ href?: string; title?: string; method?: string; path?: string }> | undefined) ||
    [];
  const lines: string[] = [];
  for (const it of items) {
    const title = String(it.title ?? '');
    const href = String(it.href ?? '');
    const method = String(it.method ?? '');
    const path = String(it.path ?? '');
    lines.push(`- [${title}](${href}) - \`${method} ${path}\``);
  }
  lines.push('');
  return lines.join('\n');
}

function fieldListToMd(node: MdxNode): string {
  const fields =
    (getAttr(node, 'fields') as Array<{ name?: string; type?: string; description?: string }> | undefined) || [];
  const lines: string[] = [];
  for (const f of fields) {
    const name = String(f.name ?? '');
    const type = String(f.type ?? '');
    const description = stripInlineHtml(String(f.description ?? ''));
    lines.push(`- \`${name}\` - *${type}* - ${description}`);
  }
  lines.push('');
  return lines.join('\n');
}

function calloutToMd(node: MdxNode): string {
  const title = String(getAttr(node, 'title') ?? '');
  const variant = String(getAttr(node, 'variant') ?? 'info').toUpperCase();
  const innerMd = stringifyBlockChildren(node.children || []).trim();
  if (!innerMd) {
    return `> [!${variant}] ${title}\n`;
  }
  const quoted = innerMd
    .split('\n')
    .map((line) => (line.length ? `> ${line}` : '>'))
    .join('\n');
  return `> [!${variant}] ${title}\n>\n${quoted}\n`;
}

function rateLimitsToMd(): string {
  return ['- Requests / min: 100 rpm', '- Paralelo máximo: 5 concurrentes', ''].join('\n');
}

function htmlTagToBlockMd(node: MdxNode): string {
  const name = getName(node).toLowerCase();
  if (AUTHOR_HTML_BLOCK_TAGS.has(name)) {
    const level = Number(name.slice(1));
    const hashes = '#'.repeat(level);
    const inner = stringifyInlineChildren(node.children || []).trim();
    return `${hashes} ${inner}`;
  }
  // Inline tags occurring at block level — wrap as paragraph.
  return htmlTagToInlineMd(node);
}

function htmlTagToInlineMd(node: MdxNode): string {
  const name = getName(node).toLowerCase();
  const innerText = stringifyInlineChildren(node.children || []).trim();
  switch (name) {
    case 'a': {
      const href = String(getAttr(node, 'href') ?? '');
      return href ? `[${innerText}](${href})` : innerText;
    }
    case 'code':
      return `\`${textOfChildren(node).replace(/`/g, '')}\``;
    case 'strong':
    case 'b':
      return `**${innerText}**`;
    case 'em':
    case 'i':
      return `*${innerText}*`;
    case 'br':
      return '\n';
    default:
      throw new Error(`Unknown MDX inline component: <${name || '?'}>`);
  }
}

function isMdxJsxFlowComponent(t: string): boolean {
  return t === 'mdxJsxFlowElement';
}

function isMdxJsxTextComponent(t: string): boolean {
  return t === 'mdxJsxTextElement';
}

function isMdxEsm(t: string): boolean {
  return t === 'mdxjsEsm';
}

function isMdxExpression(t: string): boolean {
  return t === 'mdxFlowExpression' || t === 'mdxTextExpression';
}

function promoteHeadingParagraphs(root: { children?: unknown[] }): void {
  if (!Array.isArray(root.children)) return;
  const out: unknown[] = [];
  for (const c of root.children) {
    const child = c as MdxNode & { type?: string };
    if (
      child.type === 'paragraph' &&
      Array.isArray(child.children) &&
      child.children.length === 1
    ) {
      const only = child.children[0] as MdxNode;
      if (only.type === 'mdxJsxTextElement') {
        const name = getName(only).toLowerCase();
        if (AUTHOR_HTML_BLOCK_TAGS.has(name)) {
          out.push({ ...only, type: 'mdxJsxFlowElement' });
          continue;
        }
      }
    }
    out.push(c);
  }
  root.children = out;
}

function transformTree(root: { children?: unknown[] }): void {
  promoteHeadingParagraphs(root);

  function process(node: { type?: string; children?: unknown[] }): unknown[] {
    if (!Array.isArray(node.children)) return [];
    const out: unknown[] = [];
    for (const c of node.children) {
      const child = c as MdxNode;
      // Recurse first (post-order).
      if (Array.isArray(child.children)) {
        const newChildren = process(child);
        child.children = newChildren;
      }

      if (isMdxEsm(child.type) || isMdxExpression(child.type)) {
        continue;
      }

      if (child.type === 'html') {
        const md = htmlNodeToMarkdown((child as unknown as { value: string }).value);
        out.push(...mdToBlockChildren(md));
        continue;
      }

      if (isMdxJsxFlowComponent(child.type)) {
        const name = getName(child);
        if (KNOWN_COMPONENTS.has(name)) {
          const md = componentToBlockMd(child);
          out.push(...mdToBlockChildren(md));
        } else if (AUTHOR_HTML_BLOCK_TAGS.has(name.toLowerCase()) || AUTHOR_HTML_INLINE_TAGS.has(name.toLowerCase())) {
          const md = htmlTagToBlockMd(child);
          out.push(...mdToBlockChildren(md));
        } else {
          throw new Error(`Unknown MDX block component: <${name || '?'}>`);
        }
        continue;
      }

      if (isMdxJsxTextComponent(child.type)) {
        const name = getName(child);
        if (AUTHOR_HTML_INLINE_TAGS.has(name.toLowerCase())) {
          const md = htmlTagToInlineMd(child);
          out.push(...mdToInlineChildren(md));
        } else if (KNOWN_COMPONENTS.has(name)) {
          throw new Error(`MDX component <${name}> is not allowed in inline context`);
        } else {
          throw new Error(`Unknown MDX inline component: <${name || '?'}>`);
        }
        continue;
      }

      out.push(child);
    }
    return out;
  }

  root.children = process(root as { type?: string; children?: unknown[] });
}

export function normalizeCanonicalText(text: string): string {
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export async function mdxToText(body: string): Promise<string> {
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);
  const tree = parser.parse(body) as { children: unknown[] };
  transformTree(tree as { children?: unknown[] });
  const out = stringifier.stringify(tree as never) as string;
  return normalizeCanonicalText(out);
}
