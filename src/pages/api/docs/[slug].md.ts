import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { sha256Hex } from '../../../lib/contentHash';
import { DOCS_CACHE_CONTROL, SAFE_SLUG, ifNoneMatchMatches, quoteEtag } from '../../../lib/docsApi';
import { mdxToText } from '../../../lib/mdxToText';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;

  if (!slug || !SAFE_SLUG.test(slug)) {
    return new Response('Invalid slug', { status: 400 });
  }

  const entry = await getEntry('docs', slug);
  if (!entry) {
    return new Response('Not found', { status: 404 });
  }

  const body = await mdxToText(entry.body ?? '');
  const contentHash = `sha256:${await sha256Hex(body)}`;
  const etag = quoteEtag(contentHash);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatchMatches(ifNoneMatch, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': DOCS_CACHE_CONTROL,
        'ETag': etag,
        'X-Content-Hash': contentHash,
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': DOCS_CACHE_CONTROL,
      'ETag': etag,
      'X-Content-Hash': contentHash,
    },
  });
};
