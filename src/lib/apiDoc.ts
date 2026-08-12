import rawSpec from '../data/openapi.json';
import { openapiToText } from './openapiToText';
import { rateLimitsToSpecMarkdown, type RateLimitsConfig } from './rateLimits';

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

/**
 * The placeholder the spec carries where the rate limits go.
 *
 * They are not written into src/data/openapi.json because they already have a
 * single source of truth in rateLimits.ts, which is what /docs/models and
 * /api/docs/models.md publish and which reads RATE_LIMIT_RPM from the env. A
 * third hardcoded copy is precisely the drift that module exists to prevent.
 */
const RATE_LIMITS_PLACEHOLDER = '{{RATE_LIMITS}}';

/** The spec with its placeholders resolved, ready to serve or to render. */
export function resolveSpec(rateLimits: RateLimitsConfig): typeof rawSpec {
  const description = rawSpec.info.description.replace(
    RATE_LIMITS_PLACEHOLDER,
    rateLimitsToSpecMarkdown(rateLimits),
  );
  return { ...rawSpec, info: { ...rawSpec.info, description } };
}

let cache: { key: string; text: string } | null = null;

/**
 * The canonical text of the reference.
 *
 * Memoised on the rate-limit values rather than unconditionally: the spec is
 * static within a deployment, but the limits come from the env, so a config
 * change has to produce different text. Walking 12 endpoints and 23 schemas on
 * every manifest request would otherwise be repeated work for an identical
 * result.
 */
export function getApiDocText(rateLimits: RateLimitsConfig): string {
  const key = JSON.stringify(rateLimits);
  if (cache?.key !== key) {
    cache = { key, text: openapiToText(resolveSpec(rateLimits)) };
  }
  return cache.text;
}
