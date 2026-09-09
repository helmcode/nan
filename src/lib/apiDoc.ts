import rawSpec from '../data/openapi.json';
import { openapiToText } from './openapiToText';
import { rateLimitsToSpecMarkdown, type RateLimitsConfig } from './rateLimits';

/**
 * La referencia de la API como entrada de docs, generada desde la spec.
 *
 * Desde que Scalar se hizo cargo de /docs/api, `api` ya no es un fichero de la
 * colección: sale de src/data/openapi.json. Los consumidores de /api/docs (hoy
 * el bot de Discord) no tienen por qué enterarse, así que se sigue publicando
 * con el mismo slug, el mismo orden y la misma forma que tenía como `api.mdx`.
 * El contrato del manifest no cambia; solo cambia de dónde sale el texto.
 *
 * Los metadatos replican el frontmatter que llevaba `api.mdx` (`order: 2`
 * incluido) para que ni el orden del manifest ni la navegación de docs se
 * muevan con la migración.
 */
export const API_DOC_SLUG = 'api';

export const API_DOC_META = {
  title: 'API',
  description: 'Public API endpoint reference. OpenAI-compatible.',
  order: 2,
  /**
   * El grupo de navegación, por locale.
   *
   * La referencia no está en ninguna de las dos colecciones, así que su
   * etiqueta de grupo no puede venir del frontmatter como la del resto de
   * páginas. Hardcodear la inglesa partía la barra lateral en español en
   * "Reference" y "Referencia", dos secciones donde debería haber una.
   */
  group: { en: 'Reference', es: 'Referencia' },
} as const;

/**
 * El placeholder que lleva la spec donde van los rate limits.
 *
 * No se escriben en src/data/openapi.json porque ya tienen una única fuente de
 * verdad en rateLimits.ts, que es lo que publican /docs/models y
 * /api/docs/models.md y lo que lee RATE_LIMIT_RPM del env. Una tercera copia
 * hardcodeada es precisamente la desviación que ese módulo existe para evitar.
 */
const RATE_LIMITS_PLACEHOLDER = '{{RATE_LIMITS}}';

/** La spec con los placeholders resueltos, lista para servir o renderizar. */
export function resolveSpec(rateLimits: RateLimitsConfig): typeof rawSpec {
  const description = rawSpec.info.description.replace(
    RATE_LIMITS_PLACEHOLDER,
    rateLimitsToSpecMarkdown(rateLimits),
  );
  return { ...rawSpec, info: { ...rawSpec.info, description } };
}

let cache: { key: string; text: string } | null = null;

/**
 * El texto canónico de la referencia.
 *
 * Memoizado sobre los valores de rate limit y no de forma incondicional: la
 * spec es estática dentro de un despliegue, pero los límites vienen del env,
 * así que un cambio de config tiene que producir un texto distinto. Recorrer
 * 12 endpoints y 23 esquemas en cada petición del manifest sería, si no,
 * trabajo repetido para un resultado idéntico.
 */
export function getApiDocText(rateLimits: RateLimitsConfig): string {
  const key = JSON.stringify(rateLimits);
  if (cache?.key !== key) {
    cache = { key, text: openapiToText(resolveSpec(rateLimits)) };
  }
  return cache.text;
}
