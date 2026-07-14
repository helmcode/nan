export const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const DOCS_CACHE_CONTROL = 'public, max-age=900, s-maxage=900';

export function quoteEtag(value: string): string {
  return `"${value}"`;
}

export function ifNoneMatchMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;

  const normalized = etag.startsWith('W/') ? etag.slice(2) : etag;

  return header
    .split(',')
    .map((part) => part.trim())
    .map((part) => (part.startsWith('W/') ? part.slice(2) : part))
    .some((part) => part === normalized);
}
