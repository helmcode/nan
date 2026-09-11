import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveSpec } from '../lib/apiDoc';
import { getRateLimitsConfig } from '../lib/rateLimits';

/**
 * The OpenAPI spec Scalar renders at /docs/api.
 *
 * It lives in src/data/ rather than public/ so there is ONE copy: the Markdown
 * generator behind /api/docs (src/lib/openapiToText.ts) imports it from the
 * same place. With the file in public/ it would have to be duplicated or read
 * from disk, and Workers has no disk.
 *
 * NOT prerendered, even though the content is nearly static: the rate limits
 * come from rateLimits.ts, which reads RATE_LIMIT_RPM and RATE_LIMIT_PARALLEL
 * from the env (wrangler.jsonc). Prerendering would freeze those numbers at
 * build time, and /docs/api would publish a different limit from /docs/models
 * the moment someone changed the variable. The cache header keeps the cost to
 * one request an hour.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(resolveSpec(getRateLimitsConfig(env))), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
