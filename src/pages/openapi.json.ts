import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveSpec } from '../lib/apiDoc';
import { getRateLimitsConfig } from '../lib/rateLimits';

/**
 * La spec OpenAPI que Scalar renderiza en /docs/api.
 *
 * Vive en src/data/ y no en public/ para que haya UNA copia: el generador de
 * Markdown que hay detrás de /api/docs (src/lib/openapiToText.ts) la importa
 * del mismo sitio. Con el fichero en public/ habría que duplicarlo o leerlo
 * de disco, y Workers no tiene disco.
 *
 * NO se prerenderiza, aunque el contenido sea casi estático: los rate limits
 * vienen de rateLimits.ts, que lee RATE_LIMIT_RPM y RATE_LIMIT_PARALLEL del
 * env (wrangler.jsonc). Prerenderizar congelaría esos números en el build, y
 * /docs/api publicaría un límite distinto del de /docs/models en cuanto alguien
 * cambiara la variable. La cabecera de caché deja el coste en una petición
 * por hora.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(resolveSpec(getRateLimitsConfig(env))), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
