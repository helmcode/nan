import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { sha256Hex } from '../../../lib/contentHash';
import { htmlToText } from '../../../lib/htmlToText';

export const prerender = false;

function extractArticle(html: string): string {
  const start = html.indexOf('<!--ARTICLE-START-->');
  const end = html.indexOf('<!--ARTICLE-END-->');
  if (start === -1 || end === -1 || end <= start) return '';
  return html.slice(start + '<!--ARTICLE-START-->'.length, end);
}

export const GET: APIRoute = async ({ request }) => {
  const entries = await getCollection('docs');
  entries.sort((a, b) => a.data.order - b.data.order);

  const origin = new URL(request.url).origin;

  const manifestEntries = await Promise.all(
    entries.map(async (entry) => {
      const res = await fetch(`${origin}/docs/${entry.id}`);
      const html = res.ok ? await res.text() : '';
      const text = htmlToText(extractArticle(html));
      return {
        slug: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        order: entry.data.order,
        contentHash: `sha256:${await sha256Hex(text)}`,
        contentUrl: `/api/docs/${entry.id}.md`,
      };
    }),
  );

  const version = `sha256:${await sha256Hex(JSON.stringify(manifestEntries))}`;
  const payload = {
    version,
    entries: manifestEntries,
  };
  const body = JSON.stringify(payload, null, 2);
  const etag = `sha256:${await sha256Hex(body)}`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'ETag': `"${etag}"`,
    },
  });
};
