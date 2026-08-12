import type { APIRoute } from 'astro';
import spec from '../data/openapi.json';

/**
 * El spec OpenAPI que renderiza Scalar en /docs/api.
 *
 * Vive en src/data/ y no en public/ para que haya UNA sola copia: el generador
 * de Markdown que alimenta /api/docs (src/lib/openapiToText.ts) lo importa del
 * mismo sitio. Con el fichero en public/ habría que duplicarlo o leerlo del
 * disco, y en Workers no hay disco.
 *
 * Prerenderizado: es contenido estático que cambia solo cuando se despliega, y
 * así Scalar lo pide a un asset en vez de despertar al worker en cada visita.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(spec), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
