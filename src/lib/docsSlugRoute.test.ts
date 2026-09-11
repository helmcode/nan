import { afterEach, describe, expect, it, vi } from 'vitest';

// astro:content and cloudflare:workers are virtual modules that only exist
// under Astro's Vite plugin, so they must be mocked before the route import.
vi.mock('cloudflare:workers', () => ({ env: {} }));
vi.mock('astro:content', () => ({ getEntry: vi.fn() }));

import { getEntry } from 'astro:content';
import { GET } from '../pages/api/docs/[slug].md';

const getEntryMock = getEntry as unknown as ReturnType<typeof vi.fn>;

function ctx(slug: string | undefined, init?: { ifNoneMatch?: string }) {
  const headers = new Headers();
  if (init?.ifNoneMatch) headers.set('if-none-match', init.ifNoneMatch);
  const request = new Request(`https://nan.builders/api/docs/${slug ?? ''}.md`, { headers });
  return { params: { slug }, request } as never;
}

describe('GET /api/docs/[slug].md', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getEntryMock.mockReset();
  });

  it('rejects an invalid slug with 400 before touching the collection', async () => {
    const resp = await GET(ctx('Not A Slug'));
    expect(resp.status).toBe(400);
    expect(await resp.text()).toBe('Invalid slug');
    expect(getEntryMock).not.toHaveBeenCalled();
  });

  it('renders a valid entry body to 200 markdown', async () => {
    getEntryMock.mockResolvedValue({ body: '# Hello\n\nWorld' });

    const resp = await GET(ctx('intro'));
    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await resp.text();
    expect(body).toContain('# Hello');
    expect(body).toContain('World');
  });

  it('returns a loud 500 when mdxToText throws on a bare MDX expression', async () => {
    // `{oops}` parses to an mdxFlowExpression/mdxTextExpression node, which the
    // real mdxToText refuses rather than silently dropping — the genuine failure
    // path, exercised without mocking mdxToText itself.
    getEntryMock.mockResolvedValue({ body: 'before\n\n{oops}\n\nafter' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resp = await GET(ctx('breaks'));

    expect(resp.status).toBe(500);
    expect(await resp.text()).toBe('Internal error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('breaks');
  });

  it('returns 404 when the entry is missing', async () => {
    getEntryMock.mockResolvedValue(undefined);

    const resp = await GET(ctx('ghost'));
    expect(resp.status).toBe(404);
    expect(await resp.text()).toBe('Not found');
  });
});
