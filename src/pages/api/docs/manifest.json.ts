import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { sha256Hex } from '../../../lib/contentHash';
import { DOCS_CACHE_CONTROL, SAFE_SLUG, ifNoneMatchMatches, quoteEtag } from '../../../lib/docsApi';
import { mdxToText } from '../../../lib/mdxToText';
import { getRateLimitsConfig } from '../../../lib/rateLimits';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const entries = (await getCollection('docs')).filter((e) => SAFE_SLUG.test(e.id));
  entries.sort((a, b) => {
    if (a.data.order !== b.data.order) return a.data.order - b.data.order;
    return a.id.localeCompare(b.id);
  });

  const rateLimits = getRateLimitsConfig(env);
  const manifestEntries = await Promise.all(
    entries.map(async (entry) => {
      const text = await mdxToText(entry.body ?? '', rateLimits);
      const contentHash = `sha256:${await sha256Hex(text)}`;
      return {
        slug: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        order: entry.data.order,
        contentHash,
        contentUrl: `/api/docs/${entry.id}.md`,
      };
    }),
  );

  const versionSeed = JSON.stringify(manifestEntries.map((e) => [e.slug, e.contentHash]));
  const version = `sha256:${await sha256Hex(versionSeed)}`;
  const etag = quoteEtag(version);

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatchMatches(ifNoneMatch, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': DOCS_CACHE_CONTROL,
        'ETag': etag,
      },
    });
  }

  const payload = {
    version,
    entries: manifestEntries,
  };
  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': DOCS_CACHE_CONTROL,
      'ETag': etag,
    },
  });
};
