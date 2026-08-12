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
      windowedModels: [
        {
          model: 'baz',
          contextTokens: 128_000,
          maxParallel: 2,
          windowHours: 6,
          windowTokens: 7_000_000,
          periodCapTokens: 9_000_000,
        },
      ],
    });
    expect(out).toContain('- Requests / min: 120 rpm');
    expect(out).toContain('- Max parallel: 8 concurrent');
    expect(out).toContain('- foo: 2M tpm');
    expect(out).toContain('- bar: 500 rpm');
    expect(out).toContain('**baz · premium tier limits**');
    expect(out).toContain('- Rolling 6h window: 7M tokens');
    expect(out).toContain('- Allowance / billing period: 9M tokens');
    expect(out).toContain('- Context window: 128K tokens');
    expect(out).toContain('- Concurrent requests: 2');
  });

  it('defaults to the same numbers <RateLimits /> renders', async () => {
    const out = await mdxToText(input);
    expect(out).toContain('- Requests / min: 60 rpm');
    expect(out).toContain('- Max parallel: 5 concurrent');
    // glm5.2 is gated by the window, not by a per-minute rate, and the docs
    // had no row for it at all while the model was already being served.
    expect(out).toContain('- Rolling 4h window: 400M tokens');
    expect(out).toContain('- Allowance / billing period: 3,000M tokens');
  });

  it('omits the per-model blocks when they are empty', async () => {
    const out = await mdxToText(input, {
      perKey: { requestsPerMinute: 60, maxParallel: 5 },
      tokensPerMinuteByModel: [],
      requestsPerMinuteByModel: [],
      windowedModels: [],
    });
    expect(out).not.toContain('tokens / min per model');
    expect(out).not.toContain('requests / min per model');
    expect(out).not.toContain('premium tier limits');
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

  it('throws for a computed object key, which would blank out the real field', async () => {
    const input =
      "export const label = 'name';\n\n<FieldList fields={[{ [label]: 'model', type: 'string', description: 'desc' }]} />\n";
    await expect(mdxToText(input)).rejects.toThrow(/computed object key/);
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
