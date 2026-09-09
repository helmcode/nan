import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getApiDocText } from './apiDoc';
import { DEFAULT_RATE_LIMITS } from './rateLimits';
import { mdxToText, normalizeCanonicalText } from './mdxToText';

/**
 * El texto que servimos desde /api/docs lo vuelve a canonicalizar y a hashear
 * el bot de Discord antes de compararlo con nuestro contentHash
 * (nan-discord-bot, bot/docs_client.py:265 y bot/knowledge.py:390).
 *
 * Si nuestra salida no es ya un punto fijo del canonicalizador del bot, los dos
 * hashes no coinciden nunca y cada nueva versión del manifest reindexa
 * documentos que no han cambiado.
 *
 * Lo que sigue es una transcripción deliberadamente INDEPENDIENTE de
 * bot/knowledge.py::canonicalize_doc_text. No debe importar nuestro propio
 * normalizeCanonicalText, o el test solo estaría comparando esa función
 * consigo misma. El recorte se escribe como un recorrido de code points en vez
 * de una regex para que una errata de nuestro lado no pueda replicarse aquí.
 */

// Los 29 code points para los que str.isspace() de Python es True. U+FEFF no
// está entre ellos, y U+001C..U+001F sí.
const PYTHON_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000,
]);

/** El str.strip() de Python sin argumento. */
function pyStrip(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && PYTHON_SPACE.has(s.charCodeAt(start))) start += 1;
  while (end > start && PYTHON_SPACE.has(s.charCodeAt(end - 1))) end -= 1;
  return s.slice(start, end);
}

// re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)
const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n/;

/** bot/knowledge.py::canonicalize_doc_text */
function canonicalizeDocText(raw: string, { stripFrontmatter }: { stripFrontmatter: boolean }): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (stripFrontmatter) text = text.replace(FRONTMATTER_RE, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return pyStrip(text);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '__fixtures__');
const docsDir = path.join(here, '..', 'content', 'docs');

function stripFrontmatterSource(raw: string): string {
  return raw.replace(/^---[\s\S]*?\n---\s*\n/, '');
}

const fixtures = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.mdx'));
const docs = fs.readdirSync(docsDir).filter((f) => /\.(md|mdx)$/.test(f));

const corpus: Array<{ label: string; body: string }> = [
  ...fixtures.map((f) => ({
    label: `fixture ${f}`,
    body: stripFrontmatterSource(fs.readFileSync(path.join(fixturesDir, f), 'utf8')),
  })),
  ...docs.map((f) => ({
    label: `doc ${f}`,
    body: stripFrontmatterSource(fs.readFileSync(path.join(docsDir, f), 'utf8')),
  })),
];

/**
 * La referencia de la API ya no pasa por mdxToText: se genera desde la spec.
 * Sigue viajando por el mismo camino (/api/docs/api.md) y la vuelve a
 * canonicalizar el mismo bot, así que tiene que cumplir exactamente las mismas
 * propiedades. Sin esto, el hash del manifest y el que calcula el bot no
 * coincidirían nunca y reindexaría toda la referencia en cada versión.
 */
describe('openapiToText output is a fixed point of the bot canonicaliser', () => {
  const out = getApiDocText(DEFAULT_RATE_LIMITS);

  it('canonicalize(x) === x', () => {
    expect(canonicalizeDocText(out, { stripFrontmatter: false })).toBe(out);
  });

  it('stable under strip_frontmatter=True too', () => {
    expect(canonicalizeDocText(out, { stripFrontmatter: true })).toBe(out);
  });

  it('does not open with a frontmatter-shaped fence', () => {
    expect(out.startsWith('---')).toBe(false);
  });

  it('has no run of three or more newlines for the canonicaliser to collapse', () => {
    expect(out).not.toMatch(/\n{3,}/);
  });
});

describe('mdxToText output is a fixed point of the bot canonicaliser', () => {
  for (const { label, body } of corpus) {
    // El camino feliz documentado en el docstring de canonicalize_doc_text.
    it(`${label}: canonicalize(mdxToText(x)) === mdxToText(x)`, async () => {
      const out = await mdxToText(body);
      expect(canonicalizeDocText(out, { stripFrontmatter: false })).toBe(out);
    });

    // Lo que docs_client.py llama de verdad sobre un cuerpo descargado.
    it(`${label}: stable under strip_frontmatter=True too`, async () => {
      const out = await mdxToText(body);
      expect(canonicalizeDocText(out, { stripFrontmatter: true })).toBe(out);
    });

    // rule: '-' en el stringifier hace que un thematic break serialice a `---`.
    // Un cuerpo canónico que empiece por uno dejaría que la regex de frontmatter
    // del bot se comiera todo hasta el siguiente `---`.
    it(`${label}: canonical text does not open with a frontmatter-shaped fence`, async () => {
      const out = await mdxToText(body);
      expect(out.startsWith('---')).toBe(false);
    });
  }
});

describe('normalizeCanonicalText matches the independent Python replica', () => {
  const inputs: Array<[string, string]> = [
    ['CRLF', 'a\r\nb\r\nc'],
    ['lone CR', 'a\rb'],
    ['three or more newlines', 'a\n\n\n\n\nb'],
    ['leading and trailing spaces', '   a\nb   '],
    ['tabs and newlines around', '\n\t a \t\n'],
    ['U+FEFF, which Python keeps', '\uFEFFtexto\uFEFF'],
    ['U+001C, which Python strips', '\u001Ctexto\u001C'],
    ['U+001F, which Python strips', '\u001Ftexto\u001F'],
    ['NBSP', '\u00A0texto\u00A0'],
    ['next line', '\u0085texto\u0085'],
    ['ideographic space', '\u3000texto\u3000'],
    ['line separator', '\u2028texto\u2028'],
    ['empty', ''],
    ['only whitespace', ' \n\t '],
  ];

  for (const [label, input] of inputs) {
    it(label, () => {
      expect(normalizeCanonicalText(input)).toBe(canonicalizeDocText(input, { stripFrontmatter: false }));
    });
  }

  it('keeps U+FEFF, unlike JS .trim()', () => {
    expect('\uFEFFx'.trim()).toBe('x');
    expect(normalizeCanonicalText('\uFEFFx')).toBe('\uFEFFx');
  });

  it('strips U+001C, which JS .trim() keeps', () => {
    expect('\u001Cx'.trim()).toBe('\u001Cx');
    expect(normalizeCanonicalText('\u001Cx')).toBe('x');
  });
});
