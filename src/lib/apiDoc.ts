import spec from '../data/openapi.json';
import { openapiToText } from './openapiToText';

/**
 * La referencia de API como entrada de docs, generada desde el spec.
 *
 * Desde que /docs/api la sirve Scalar, `api` ya no es un fichero de la
 * colección: sale de src/data/openapi.json. Pero los consumidores de
 * /api/docs —el bot de Discord, hoy— no tienen por qué enterarse de eso, así
 * que se sigue publicando con el mismo slug, el mismo orden y la misma forma
 * que tenía cuando era `api.mdx`. El contrato del manifest no cambia; cambia
 * de dónde sale el texto.
 *
 * Los metadatos replican el frontmatter que tenía `api.mdx` (incluido
 * `order: 2`) para que ni el orden del manifest ni el de la navegación se
 * muevan con la migración.
 */
export const API_DOC_SLUG = 'api';

export const API_DOC_META = {
  title: 'API',
  description: 'Public API endpoint reference. OpenAI-compatible.',
  order: 2,
} as const;

let cached: string | null = null;

/**
 * El texto canónico de la referencia. Se memoiza porque el spec es estático
 * dentro de un despliegue: recorrer 12 endpoints y 23 esquemas en cada
 * petición del manifest sería trabajo repetido para un resultado idéntico.
 */
export function getApiDocText(): string {
  if (cached === null) cached = openapiToText(spec);
  return cached;
}
