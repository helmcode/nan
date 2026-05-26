import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mdxToText } from './mdxToText';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '__fixtures__');
const docsDir = path.join(here, '..', 'content', 'docs');

const KNOWN_COMPONENTS = [
  'ModelCard',
  'LimitationsCard',
  'EndpointGrid',
  'FieldList',
  'Callout',
  'RateLimits',
];

const FIXTURES = [
  'modelcard',
  'limitations',
  'endpointgrid',
  'fieldlist',
  'callout',
  'ratelimits',
  'raw-html-heading',
  'raw-html-inline',
  'composite',
] as const;

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?\n---\s*\n/, '');
}

describe('mdxToText fixtures', () => {
  for (const name of FIXTURES) {
    it(`renders ${name}.mdx to the expected canonical text`, async () => {
      const input = fs.readFileSync(path.join(fixturesDir, `${name}.mdx`), 'utf8');
      const expected = fs.readFileSync(path.join(fixturesDir, `${name}.expected.md`), 'utf8');
      const actual = await mdxToText(stripFrontmatter(input));
      expect(actual).toBe(expected);
    });
  }
});

describe('mdxToText invariants on docs corpus', () => {
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => /\.(md|mdx)$/.test(f));

  for (const file of files) {
    it(`${file}: contains no MDX import/export lines and no residual HTML tags`, async () => {
      const raw = fs.readFileSync(path.join(docsDir, file), 'utf8');
      const out = await mdxToText(stripFrontmatter(raw));
      const codeFenceFree = out.replace(/```[\s\S]*?```/g, '');
      expect(codeFenceFree).not.toMatch(/^import\s/m);
      expect(codeFenceFree).not.toMatch(/^export\s/m);
      // No residual HTML tags for the supported set.
      expect(codeFenceFree).not.toMatch(/<\/?h[1-4]\b/i);
      expect(codeFenceFree).not.toMatch(/<\/?a\b/i);
      expect(codeFenceFree).not.toMatch(/<\/?(strong|b|em|i)\b/i);
      expect(codeFenceFree).not.toMatch(/<\/?code\b/i);
    });
  }

  it('every custom MDX component used in src/content/docs is mapped', () => {
    const used = new Set<string>();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(docsDir, file), 'utf8');
      const matches = raw.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g);
      for (const m of matches) used.add(m[1]);
    }
    for (const name of used) {
      expect(KNOWN_COMPONENTS, `Unmapped component <${name}>`).toContain(name);
    }
  });
});

describe('mdxToText error cases', () => {
  it('throws for an unknown MDX component', async () => {
    const input = '<UnknownThing prop="x" />\n';
    await expect(mdxToText(input)).rejects.toThrow(/UnknownThing/);
  });
});
