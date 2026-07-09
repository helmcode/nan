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

describe('mdxToText rate limits', () => {
  const input = "import RateLimits from '../../components/docs/RateLimits.astro';\n\n<RateLimits />\n";

  it('serves the values from the injected config, not hardcoded ones', async () => {
    const out = await mdxToText(input, {
      perKey: { requestsPerMinute: 120, maxParallel: 8 },
      tokensPerMinuteByModel: [{ model: 'foo', label: '2M tpm' }],
      requestsPerMinuteByModel: [{ model: 'bar', label: '500 rpm' }],
    });
    expect(out).toContain('- Requests / min: 120 rpm');
    expect(out).toContain('- Paralelo máximo: 8 concurrentes');
    expect(out).toContain('- foo: 2M tpm');
    expect(out).toContain('- bar: 500 rpm');
  });

  it('defaults to the same numbers <RateLimits /> renders', async () => {
    const out = await mdxToText(input);
    expect(out).toContain('- Requests / min: 60 rpm');
    expect(out).toContain('- Paralelo máximo: 5 concurrentes');
  });

  it('omits the per-model blocks when they are empty', async () => {
    const out = await mdxToText(input, {
      perKey: { requestsPerMinute: 60, maxParallel: 5 },
      tokensPerMinuteByModel: [],
      requestsPerMinuteByModel: [],
    });
    expect(out).not.toContain('tokens / min por modelo');
    expect(out).not.toContain('requests / min por modelo');
  });
});

describe('mdxToText error cases', () => {
  it('throws for an unknown MDX component', async () => {
    const input = '<UnknownThing prop="x" />\n';
    await expect(mdxToText(input)).rejects.toThrow(/UnknownThing/);
  });

  it('throws for a bare MDX flow expression', async () => {
    await expect(mdxToText('texto\n\n{someVar}\n')).rejects.toThrow(/Unexpected MDX expression: \{someVar\}/);
  });

  it('throws for a bare MDX text expression', async () => {
    await expect(mdxToText('hola {inline} mundo\n')).rejects.toThrow(/Unexpected MDX expression: \{inline\}/);
  });

  it('ignores import/export, which is how .mdx pulls in its components', async () => {
    const input = "import Foo from './Foo.astro';\n\ntexto\n";
    await expect(mdxToText(input)).resolves.toBe('texto');
  });

  it('throws when a prop expression does not reduce to a literal', async () => {
    const input = "import EndpointGrid from './x';\n\n<EndpointGrid items={items} />\n";
    await expect(mdxToText(input)).rejects.toThrow(/identifier "items" \(in prop "items"\)/);
  });

  it('throws for a template literal prop with interpolation', async () => {
    const input = "import Callout from './x';\n\n<Callout title={`hola ${name}`}>\n\ntexto\n\n</Callout>\n";
    await expect(mdxToText(input)).rejects.toThrow(/template literal with interpolation/);
  });

  it('throws for a spread attribute', async () => {
    const input = "import Callout from './x';\n\n<Callout {...props}>\n\ntexto\n\n</Callout>\n";
    await expect(mdxToText(input)).rejects.toThrow(/spread attribute/);
  });

  it('keeps rendering components whose props are literals', async () => {
    const input = "import EndpointGrid from './x';\n\n<EndpointGrid items={[{ method: 'GET', path: '/v1/models' }]} />\n";
    await expect(mdxToText(input)).resolves.toContain('GET /v1/models');
  });
});
