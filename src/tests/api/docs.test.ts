import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDocsApiServer, type DocsApiServer } from '../helpers/docsApiServer';

let server: DocsApiServer;

beforeAll(async () => {
  server = await startDocsApiServer();
}, 60_000);

afterAll(async () => {
  if (server) await server.stop();
});

interface ManifestEntry {
  slug: string;
  title: string;
  description: string;
  order: number;
  contentHash: string;
  contentUrl: string;
}

interface Manifest {
  version: string;
  entries: ManifestEntry[];
}

describe('GET /api/docs/manifest.json', () => {
  it('returns 200 with a valid manifest payload', async () => {
    const res = await server.fetch('/api/docs/manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/i);
    expect(res.headers.get('cache-control')).toBe('public, max-age=900, s-maxage=900');
    const payload = (await res.json()) as Manifest;
    expect(payload.version).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(payload.entries.length).toBeGreaterThan(0);
    for (const entry of payload.entries) {
      expect(entry.slug).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
      expect(entry.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.contentUrl).toBe(`/api/docs/${entry.slug}.md`);
    }
  });

  it('is ordered by (order, slug)', async () => {
    const res = await server.fetch('/api/docs/manifest.json');
    const payload = (await res.json()) as Manifest;
    const expected = [...payload.entries]
      .map((e) => ({ slug: e.slug, order: e.order }))
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.slug.localeCompare(b.slug)));
    expect(payload.entries.map((e) => e.slug)).toEqual(expected.map((e) => e.slug));
  });

  it('has a stable version and ETag across hits', async () => {
    const a = await server.fetch('/api/docs/manifest.json');
    const b = await server.fetch('/api/docs/manifest.json');
    const versionA = ((await a.json()) as Manifest).version;
    const versionB = ((await b.json()) as Manifest).version;
    expect(versionA).toBe(versionB);
    expect(a.headers.get('etag')).toBe(b.headers.get('etag'));
  });

  it('returns 304 on matching If-None-Match', async () => {
    const first = await server.fetch('/api/docs/manifest.json');
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    const second = await server.fetch('/api/docs/manifest.json', {
      headers: { 'If-None-Match': etag },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
  });

  it('matches per-entry contentHash with the body endpoint hash', async () => {
    const res = await server.fetch('/api/docs/manifest.json');
    const payload = (await res.json()) as Manifest;
    const entry = payload.entries[0];
    const bodyRes = await server.fetch(entry.contentUrl);
    expect(bodyRes.status).toBe(200);
    expect(bodyRes.headers.get('x-content-hash')).toBe(entry.contentHash);
  });
});

describe('GET /api/docs/[slug].md', () => {
  it('returns 400 for an invalid slug', async () => {
    const res = await server.fetch('/api/docs/Bad-Slug.md');
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await server.fetch('/api/docs/nonexistent.md');
    expect(res.status).toBe(404);
  });

  it('returns 200 with markdown content for a valid slug', async () => {
    const res = await server.fetch('/api/docs/intro.md');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/i);
    expect(res.headers.get('cache-control')).toBe('public, max-age=900, s-maxage=900');
    const body = await res.text();
    expect(body).not.toMatch(/^---\s*\n/);
    expect(body).not.toMatch(/^import\s/m);
    expect(body).not.toMatch(/^export\s/m);
    expect(body.replace(/```[\s\S]*?```/g, '')).not.toMatch(/<[a-zA-Z]/);
  });

  it('coheres ETag with X-Content-Hash', async () => {
    const res = await server.fetch('/api/docs/intro.md');
    const etag = res.headers.get('etag')!;
    const hash = res.headers.get('x-content-hash')!;
    expect(etag).toBe(`"${hash}"`);
  });

  it('returns 304 on matching If-None-Match', async () => {
    const first = await server.fetch('/api/docs/intro.md');
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    const second = await server.fetch('/api/docs/intro.md', {
      headers: { 'If-None-Match': etag },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
  });
});
