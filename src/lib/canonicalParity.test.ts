import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mdxToText, normalizeCanonicalText } from './mdxToText';

/**
 * The text we serve from /api/docs is re-canonicalised and re-hashed by the
 * Discord bot before it compares against our contentHash
 * (nan-discord-bot, bot/docs_client.py:265 and bot/knowledge.py:390).
 *
 * If our output is not already a fixed point of the bot's canonicaliser, the
 * two hashes never agree and every new manifest version re-indexes documents
 * that did not change.
 *
 * What follows is a deliberately INDEPENDENT transcription of
 * bot/knowledge.py::canonicalize_doc_text. It must not import our own
 * normalizeCanonicalText, or the test would only be comparing that function
 * against itself. The stripping is written as a code-point scan rather than a
 * regex so that a typo on our side cannot be mirrored here.
 */

// The 29 code points for which Python's str.isspace() is True. U+FEFF is not
// among them, and U+001C..U+001F are.
const PYTHON_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000,
]);

/** Python's str.strip() with no argument. */
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

describe('mdxToText output is a fixed point of the bot canonicaliser', () => {
  for (const { label, body } of corpus) {
    // The happy path documented in canonicalize_doc_text's docstring.
    it(`${label}: canonicalize(mdxToText(x)) === mdxToText(x)`, async () => {
      const out = await mdxToText(body);
      expect(canonicalizeDocText(out, { stripFrontmatter: false })).toBe(out);
    });

    // What docs_client.py actually calls on a fetched body.
    it(`${label}: stable under strip_frontmatter=True too`, async () => {
      const out = await mdxToText(body);
      expect(canonicalizeDocText(out, { stripFrontmatter: true })).toBe(out);
    });

    // rule: '-' in the stringifier means a thematic break serialises to `---`.
    // A canonical body opening with one would let the bot's frontmatter regex
    // eat everything up to the next `---`.
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
