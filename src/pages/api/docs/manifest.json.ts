import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import { API_DOC_META, API_DOC_SLUG, getApiDocText } from '../../../lib/apiDoc';
import { sha256Hex } from '../../../lib/contentHash';
import { DOCS_CACHE_CONTROL, SAFE_SLUG, ifNoneMatchMatches, quoteEtag } from '../../../lib/docsApi';
import { mdxToText } from '../../../lib/mdxToText';
import { getRateLimitsConfig } from '../../../lib/rateLimits';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const entries = await getCollection('docs');
    for (const entry of entries) {
      if (!SAFE_SLUG.test(entry.id)) {
        throw new Error(`Doc id is not slug-safe: ${entry.id}`);
      }
    }
    entries.sort((a, b) => {
      if (a.data.order !== b.data.order) return a.data.order - b.data.order;
      return a.id.localeCompare(b.id);
    });

    const rateLimits = getRateLimitsConfig(env);
    // Si alguien vuelve a añadir un `api.md(x)` a la colección, el spec sigue
    // mandando: dos entradas con el mismo slug le harían indexar la referencia
    // dos veces, y con contenidos distintos.
    const collectionEntries = await Promise.all(
      entries
        .filter((entry) => entry.id !== API_DOC_SLUG)
        .map(async (entry) => {
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

    // La referencia de API ya no es un fichero de la colección: la sirve Scalar
    // desde el spec. Se publica igualmente como entrada, porque para quien
    // consume el manifest sigue siendo una página de docs más. Ver src/lib/apiDoc.ts.
    const apiText = getApiDocText();
    const apiEntry = {
      slug: API_DOC_SLUG,
      title: API_DOC_META.title,
      description: API_DOC_META.description,
      order: API_DOC_META.order,
      contentHash: `sha256:${await sha256Hex(apiText)}`,
      contentUrl: `/api/docs/${API_DOC_SLUG}.md`,
    };

    const manifestEntries = [...collectionEntries, apiEntry].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.slug.localeCompare(b.slug);
    });

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
  } catch (error) {
    console.error('[api/docs] failed to build manifest.json', error);
    return new Response('Internal error', { status: 500 });
  }
};
