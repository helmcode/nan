import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { env } from 'cloudflare:workers';
import { sha256Hex } from '../../../lib/contentHash';
import { DOCS_CACHE_CONTROL, SAFE_SLUG, ifNoneMatchMatches, quoteEtag } from '../../../lib/docsApi';
import { mdxToText } from '../../../lib/mdxToText';
import { getRateLimitsConfig } from '../../../lib/rateLimits';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;

  if (!slug || !SAFE_SLUG.test(slug)) {
    return new Response('Invalid slug', { status: 400 });
  }

  try {
    const entry = await getEntry('docs', slug);
    if (!entry) {
      return new Response('Not found', { status: 404 });
    }

    const body = await mdxToText(entry.body ?? '', getRateLimitsConfig(env));
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
  } catch (error) {
    console.error(`[api/docs] failed to render ${slug}.md`, error);
    return new Response('Internal error', { status: 500 });
  }
};
