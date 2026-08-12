import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveSpec } from '../lib/apiDoc';
import { getRateLimitsConfig } from '../lib/rateLimits';

/**
 * El spec OpenAPI que renderiza Scalar en /docs/api.
 *
 * Vive en src/data/ y no en public/ para que haya UNA sola copia: el generador
 * de Markdown que alimenta /api/docs (src/lib/openapiToText.ts) lo importa del
 * mismo sitio. Con el fichero en public/ habría que duplicarlo o leerlo del
 * disco, y en Workers no hay disco.
 *
 * NO se prerenderiza, aunque el contenido sea casi estático: los rate limits
 * salen de rateLimits.ts, que lee RATE_LIMIT_RPM y RATE_LIMIT_PARALLEL del
 * entorno (wrangler.jsonc). Prerenderizado congelaría esos números en el build
 * y /docs/api publicaría un límite distinto del que publica /docs/models en
 * cuanto alguien cambiase la variable. La cabecera de caché se encarga de que
 * el coste sea el de una petición por hora.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(resolveSpec(getRateLimitsConfig(env))), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
