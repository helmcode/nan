import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { sha256Hex } from '../../../lib/contentHash';
import { htmlToText } from '../../../lib/htmlToText';

export const prerender = false;

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function extractArticle(html: string): string {
  const start = html.indexOf('<!--ARTICLE-START-->');
  const end = html.indexOf('<!--ARTICLE-END-->');
  if (start === -1 || end === -1 || end <= start) return '';
  return html.slice(start + '<!--ARTICLE-START-->'.length, end);
}

async function renderEntryText(slug: string, origin: string, fetcher: typeof fetch): Promise<string> {
  const res = await fetcher(`${origin}/docs/${slug}`);
  if (!res.ok) throw new Error(`Failed to render /docs/${slug}: ${res.status}`);
  const html = await res.text();
  const article = extractArticle(html);
  return htmlToText(article);
}

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;

  if (!slug || !SAFE_SLUG.test(slug)) {
    return new Response('Invalid slug', { status: 400 });
  }

  const entry = await getEntry('docs', slug);
  if (!entry) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const body = await renderEntryText(slug, url.origin, fetch);
  const contentHash = `sha256:${await sha256Hex(body)}`;

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(entry.data.title)}`,
    `description: ${JSON.stringify(entry.data.description)}`,
    `order: ${entry.data.order}`,
    `slug: ${entry.id}`,
    '---',
    '',
  ].join('\n');

  const responseBody = `${frontmatter}\n${body}`;
  const etag = `sha256:${await sha256Hex(responseBody)}`;

  return new Response(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'ETag': `"${etag}"`,
      'X-Content-Hash': contentHash,
    },
  });
};
