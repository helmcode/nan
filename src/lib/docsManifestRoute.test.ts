import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { slug as githubSlug } from 'github-slugger';
import { globSync } from 'tinyglobby';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAFE_SLUG } from './docsApi';

// astro:content y cloudflare:workers son módulos virtuales que solo existen
// bajo el plugin de Vite de Astro, así que el módulo de la ruta no se puede
// importar sin mockearlos antes. Las referencias de la factoría se elevan con
// vi.hoisted para que estén disponibles cuando vi.mock corre antes del import.
const { getCollectionMock } = vi.hoisted(() => ({ getCollectionMock: vi.fn() }));
vi.mock('astro:content', () => ({ getCollection: getCollectionMock }));
vi.mock('cloudflare:workers', () => ({ env: {} }));

// Se importa DESPUÉS de los mocks para que el handler se enlace a ellos.
import { GET } from '../pages/api/docs/manifest.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(here, '..', 'content', 'docs');

/**
 * El glob loader de Astro (base ./src/content/docs, patrón **\/*.{md,mdx})
 * deriva el id de una entrada del `slug` del frontmatter si existe: tal cual y
 * ANTES de parsear el esquema, así que el esquema de la colección no puede
 * vetarlo (generateIdDefault en astro/dist/content/loaders/glob.js). Si no, lo
 * deriva de la ruta del fichero relativa a la base: cada segmento slugificado
 * con github-slugger, unidos con '/' y con el '/index' final colapsado
 * (getContentEntryIdAndSlug en astro/dist/content/utils.js). Aquí se replican
 * las dos ramas, usando el mismo parser de frontmatter que Astro usa para las
 * entradas (astro/dist/content/utils.js lo importa de @astrojs/markdown-remark),
 * de modo que un guides/foo.md anidado y un doc plano que declare
 * `slug: guides/foo` en cualquier forma YAML producen un id que la ruta ahora
 * rechaza, y CI falla en el PR en cuanto alguien añade un doc cuyo id efectivo
 * no es slug-safe, mientras que un doc que Astro normalizaría a un id seguro
 * sigue pasando.
 */
function frontmatterSlug(file: string): string | undefined {
  const { frontmatter } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  return frontmatter.slug ? String(frontmatter.slug) : undefined;
}

function collectDocIds(dir: string): string[] {
  // Descubrimiento de ficheros idéntico al del loader: misma librería, mismo
  // patrón, mismas opciones (astro/dist/content/loaders/glob.js), así que el
  // trato de dotfiles, el seguimiento de symlinks y el matching no pueden divergir.
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
      entry('models', '# Models\n\nContenido.\n'),
    ]);

    const res = await GET(ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(body.version.startsWith('sha256:')).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    // Las dos de la colección más la referencia de la API, generada desde la
    // spec e independiente de ella.
    expect(body.entries.length).toBe(3);
    for (const e of body.entries) {
      expect(e).toHaveProperty('slug');
      expect(e).toHaveProperty('contentHash');
      expect(e).toHaveProperty('contentUrl');
      expect(e.contentHash.startsWith('sha256:')).toBe(true);
      expect(e.contentUrl).toBe(`/api/docs/${e.slug}.md`);
    }
  });

  /**
   * El bot de Discord no falla cuando un slug desaparece del manifest: descarta
   * sus chunks en silencio (bot/knowledge.py::load_documentation_from_remote,
   * `stale_sources`). Cuando /docs/api pasó a Scalar, `api` salió de la
   * colección, así que sin esta entrada sintética el bot habría perdido la
   * referencia de la API sin que saltara ninguna alarma.
   */
  it('publishes the API reference even though it is not in the collection', async () => {
    getCollectionMock.mockResolvedValue([entry('intro', '# Intro\n\nHola.\n')]);

    const res = await GET(ctx());
    const body = await res.json();

    const api = body.entries.find((e: { slug: string }) => e.slug === 'api');
    expect(api).toBeDefined();
    expect(api.contentUrl).toBe('/api/docs/api.md');
    expect(api.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(api.title).toBe('API');
  });

  /** Dos entradas con el mismo slug harían que el bot lo indexara dos veces. */
  it('keeps a single `api` entry if the collection ever gets one back', async () => {
    getCollectionMock.mockResolvedValue([
      entry('intro', '# Intro\n\nHola.\n'),
      entry('api', '# API\n\nUna copia vieja escrita a mano.\n'),
    ]);

    const res = await GET(ctx());
    const body = await res.json();

    const apiEntries = body.entries.filter((e: { slug: string }) => e.slug === 'api');
    expect(apiEntries.length).toBe(1);
    // Gana la spec, no el fichero.
    expect(apiEntries[0].title).toBe('API');
  });
});
