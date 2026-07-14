import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { slug as githubSlug } from 'github-slugger';
import { globSync } from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAFE_SLUG } from './docsApi';

// astro:content and cloudflare:workers are virtual modules that only exist
// under Astro's Vite plugin, so the route module cannot be imported without
// mocking them first. The factory references are hoisted with vi.hoisted so
// they are available when vi.mock runs before the import below.
const { getCollectionMock } = vi.hoisted(() => ({ getCollectionMock: vi.fn() }));
vi.mock('astro:content', () => ({ getCollection: getCollectionMock }));
vi.mock('cloudflare:workers', () => ({ env: {} }));

// Import AFTER the mocks so the handler binds to them.
import { GET } from '../pages/api/docs/manifest.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(here, '..', 'content', 'docs');

/**
 * Astro's glob loader (base ./src/content/docs, pattern **\/*.{md,mdx}) derives
 * an entry id from the frontmatter `slug` if present — verbatim and BEFORE
 * schema parsing, so the collection schema cannot veto it (generateIdDefault in
 * astro/dist/content/loaders/glob.js) — and otherwise from the file path
 * relative to the base — each path segment slugified with github-slugger,
 * joined with '/', and a trailing '/index' collapsed (getContentEntryIdAndSlug
 * in astro/dist/content/utils.js). Both branches are mirrored here, using the
 * same frontmatter parser Astro itself uses for entries
 * (astro/dist/content/utils.js imports it from @astrojs/markdown-remark), so a
 * nested guides/foo.md and a flat doc declaring `slug: guides/foo` in any
 * YAML form each yield an id the route now rejects, and CI fails at PR time
 * the moment someone adds a doc whose effective id is not slug-safe — while a
 * doc that Astro itself would normalize to a safe id keeps passing.
 */
function frontmatterSlug(file: string): string | undefined {
  const { frontmatter } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  return frontmatter.slug ? String(frontmatter.slug) : undefined;
}

function collectDocIds(dir: string): string[] {
  // Identical file discovery to the loader: same library, same pattern, same
  // options (astro/dist/content/loaders/glob.js), so dotfile handling, symlink
  // following and matching semantics cannot diverge.
  const files = globSync('**/*.{md,mdx}', { cwd: dir, expandDirectories: false });
  return files.map((rel) => {
    const pathId = rel
      .replace(/\.(md|mdx)$/, '')
      .split('/')
      .map((segment) => githubSlug(segment))
      .join('/')
      .replace(/\/index$/, '');
    return frontmatterSlug(path.join(dir, rel)) ?? pathId;
  });
}

const corpusIds = collectDocIds(docsDir);

function entry(id: string, body = '# Titulo\n\nContenido de prueba.\n') {
  return {
    id,
    body,
    data: { title: `Titulo ${id}`, description: `Descripcion ${id}`, order: 0, locale: 'es' },
  };
}

function ctx(headers: Record<string, string> = {}) {
  const request = new Request('https://nan.builders/api/docs/manifest.json', { headers });
  return { request } as never;
}

describe('docs corpus ids are slug-safe', () => {
  it('finds at least one real doc to guard', () => {
    expect(corpusIds.length).toBeGreaterThan(0);
  });

  it('derives ids the way the glob loader does, including frontmatter slug overrides', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guard-'));
    try {
      fs.writeFileSync(path.join(tmp, 'flat.md'), '---\ntitle: T\nslug: guides/foo\n---\n\nBody\n');
      fs.writeFileSync(path.join(tmp, 'flow.md'), '---\n{ title: T, slug: guides/flow }\n---\n\nBody\n');
      fs.writeFileSync(path.join(tmp, 'quoted.md'), '---\ntitle: T\n"slug": guides/quoted\n---\n\nBody\n');
      fs.writeFileSync(path.join(tmp, 'crlf.md'), '---\r\ntitle: T\r\nslug: guides/crlf\r\n---\r\n\r\nBody\r\n');
      fs.writeFileSync(path.join(tmp, 'Foo Bar.md'), '---\ntitle: T\n---\n\nBody\n');
      fs.mkdirSync(path.join(tmp, 'guides'));
      fs.writeFileSync(path.join(tmp, 'guides', 'nested.md'), '---\ntitle: T\n---\n\nBody\n');
      fs.writeFileSync(path.join(tmp, 'guides', 'index.md'), '---\ntitle: T\n---\n\nBody\n');
      const ids = collectDocIds(tmp).sort();
      expect(ids).toEqual([
        'foo-bar',
        'guides',
        'guides/crlf',
        'guides/flow',
        'guides/foo',
        'guides/nested',
        'guides/quoted',
      ]);
      const unsafe = ids.filter((id) => !SAFE_SLUG.test(id));
      expect(unsafe).toEqual(['guides/crlf', 'guides/flow', 'guides/foo', 'guides/nested', 'guides/quoted']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('excludes dot-prefixed files and directories like the glob loader', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guard-'));
    try {
      fs.writeFileSync(path.join(tmp, 'visible.md'), '---\ntitle: T\n---\n\nBody\n');
      fs.writeFileSync(path.join(tmp, '.hidden.md'), '---\ntitle: T\nslug: guides/hidden\n---\n\nBody\n');
      fs.mkdirSync(path.join(tmp, '.draft', 'guides'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.draft', 'guides', 'foo.md'), '---\ntitle: T\n---\n\nBody\n');
      expect(collectDocIds(tmp)).toEqual(['visible']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('follows directory symlinks like the glob loader', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guard-'));
    try {
      const real = path.join(tmp, 'real-docs');
      const base = path.join(tmp, 'docs');
      fs.mkdirSync(real);
      fs.mkdirSync(base);
      fs.writeFileSync(path.join(real, 'foo.md'), '---\ntitle: T\n---\n\nBody\n');
      fs.symlinkSync(real, path.join(base, 'linked'), 'dir');
      const ids = collectDocIds(base);
      expect(ids).toEqual(['linked/foo']);
      expect(SAFE_SLUG.test(ids[0])).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('ignores slug keys that are not top-level, matching the loader', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guard-'));
    try {
      fs.writeFileSync(
        path.join(tmp, 'inner.md'),
        '---\ntitle: T\nmeta:\n  slug: guides/inner\n---\n\nBody\n',
      );
      expect(collectDocIds(tmp)).toEqual(['inner']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  for (const id of corpusIds) {
    it(`id "${id}" matches SAFE_SLUG`, () => {
      expect(SAFE_SLUG.test(id)).toBe(true);
    });
  }
});

describe('GET /api/docs/manifest.json', () => {
  beforeEach(() => {
    getCollectionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails loud with a controlled 500 when a doc id is not slug-safe', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCollectionMock.mockResolvedValue([entry('intro'), entry('guides/foo')]);

    const res = await GET(ctx());

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
    expect(errorSpy).toHaveBeenCalledWith('[api/docs] failed to build manifest.json', expect.any(Error));
    const loggedError = errorSpy.mock.calls[0][1] as Error;
    expect(loggedError.message).toContain('guides/foo');
  });

  it('returns a controlled 500 (not an unhandled rejection) when mdxToText throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCollectionMock.mockResolvedValue([entry('intro', 'texto\n\n{oops}\n')]);

    const res = await GET(ctx());

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
    expect(errorSpy).toHaveBeenCalledOnce();
    const loggedError = errorSpy.mock.calls[0][1] as Error;
    expect(loggedError.message).toContain('{oops}');
  });

  it('returns 200 with a well-formed manifest for valid entries', async () => {
    getCollectionMock.mockResolvedValue([
      entry('intro', '# Intro\n\nHola mundo.\n'),
      entry('api', '# API\n\nContenido.\n'),
    ]);

    const res = await GET(ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(body.version.startsWith('sha256:')).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBe(2);
    for (const e of body.entries) {
      expect(e).toHaveProperty('slug');
      expect(e).toHaveProperty('contentHash');
      expect(e).toHaveProperty('contentUrl');
      expect(e.contentHash.startsWith('sha256:')).toBe(true);
      expect(e.contentUrl).toBe(`/api/docs/${e.slug}.md`);
    }
  });
});
