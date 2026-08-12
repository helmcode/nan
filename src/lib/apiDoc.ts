import spec from '../data/openapi.json';
import { openapiToText } from './openapiToText';

/**
 * The API reference as a docs entry, generated from the spec.
 *
 * Since Scalar took over /docs/api, `api` is no longer a file in the
 * collection: it comes from src/data/openapi.json. Consumers of /api/docs
 * (the Discord bot today) have no reason to learn about that, so it keeps
 * being published under the same slug, the same order and the same shape it
 * had as `api.mdx`. The manifest contract does not change; only where the
 * text comes from does.
 *
 * The metadata mirrors the frontmatter `api.mdx` used to carry (`order: 2`
 * included) so that neither the manifest order nor the docs navigation moves
 * with the migration.
 */
export const API_DOC_SLUG = 'api';

export const API_DOC_META = {
  title: 'API',
  description: 'Public API endpoint reference. OpenAI-compatible.',
  order: 2,
} as const;

let cached: string | null = null;

/**
 * The canonical text of the reference. Memoised because the spec is static
 * within a deployment: walking 12 endpoints and 23 schemas on every manifest
 * request would be repeated work for an identical result.
 */
export function getApiDocText(): string {
  if (cached === null) cached = openapiToText(spec);
  return cached;
}
