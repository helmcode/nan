/**
 * Proyectos de la comunidad. Fuente de verdad única: cloud-api.
 *
 * Antes había dos: la home los pintaba de un `data/proyectos.json` scrapeado a
 * mano y /projects los pedía a la API, así que la sección más visible del sitio
 * se desincronizaba sola. Este módulo lo comparten las dos.
 *
 * Los datos los aporta el miembro al publicar, así que todo lo que sale de aquí
 * pasa por los filtros de esquema de abajo. Quien lo pinte tiene además que
 * tratarlo como texto, no como marcado (ver el modal de /projects).
 */

/** Lo que devuelve cloud-api en /api/projects. */
export interface ApiProject {
  id: number;
  handle: string;
  name: string;
  description?: string;
  imageUrl?: string;
  appUrl?: string;
  repoUrl?: string;
  tags?: string[];
  stars?: number;
}

/** Forma que espera el disquete (heredada de nan-site). */
export interface FloppyProject {
  slug: string;
  nombre: string;
  autor: string;
  descripcion: string;
  tags: string[];
  url: string;
  thumbnail: string;
  cover: boolean;
  stars: number;
  app: string;
  repo: string;
}

/**
 * Solo http(s): descarta javascript: y cualquier otro esquema que venga en los
 * datos de usuario.
 */
export const safeUrl = (u?: string): string => (u && /^https?:\/\//i.test(u) ? u : '');

/**
 * Para las portadas exigimos https. Hay proyectos con la imagen en http:// y el
 * navegador las bloquea por contenido mixto (y la CSP también), así que se veía
 * el icono de imagen rota. Sin portada válida el disquete cae a su etiqueta
 * editorial, que es un estado de diseño, no un fallo.
 */
export const safeImage = (u?: string): string => (u && /^https:\/\//i.test(u) ? u : '');

export const slugify = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Un proyecto de la API a la forma que pinta el disquete. */
export function toFloppyProject(p: ApiProject): FloppyProject {
  const thumbnail = safeImage(p.imageUrl);
  const app = safeUrl(p.appUrl);
  const repo = safeUrl(p.repoUrl);
  return {
    slug: slugify(p.name || p.handle),
    nombre: p.name,
    autor: p.handle,
    descripcion: p.description ?? '',
    tags: p.tags ?? [],
    url: app || repo || '',
    thumbnail,
    cover: Boolean(thumbnail),
    stars: p.stars ?? 0,
    app,
    repo,
  };
}

/**
 * Ordena por estrellas, descendente.
 *
 * El `?? 0` es imprescindible AQUÍ y no solo en el mapeo: si la API omite
 * `stars` en algún proyecto, el comparador devuelve NaN y el orden de toda la
 * galería queda indefinido.
 */
export const byStars = (a: ApiProject, b: ApiProject): number => (b.stars ?? 0) - (a.stars ?? 0);

/**
 * Cuánto esperamos a cloud-api antes de pintar la página sin proyectos.
 *
 * 1,5 s y no 4: esto lo espera la home, que es la página más visitada, y la
 * galería es una sección secundaria. Con 4 s el peor caso era que el visitante
 * mirase una pantalla en blanco cuatro segundos por una tira de disquetes.
 * Cuando la API responde normal ni se acerca a este límite; el número solo
 * decide cuánto se tarda en rendirse.
 */
const TIMEOUT_MS = 1500;

/** Caché de borde. La galería no necesita estar al segundo. */
const CACHE_TTL_S = 300;

export interface FetchProjectsOptions {
  /**
   * Cuántos devolver. La home solo pinta unos pocos.
   *
   * Se manda como query param Y se recorta aquí: cloud-api **ignora** hoy el
   * `limit` (con `limit=5` devuelve los 17 igual), así que confiar solo en el
   * param haría que la home creciera sola a medida que se publican proyectos.
   */
  limit?: number;
  /** Para inyectar un fetch en los tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Trae los proyectos ya ordenados y normalizados.
 *
 * Nunca lanza: si cloud-api no responde, tarda de más o devuelve algo que no es
 * la forma esperada, resuelve a lista vacía y quien llame pinta su estado vacío.
 * Es una sección de la página, no debe poder tumbarla.
 */
export async function fetchProjects(
  baseUrl: string,
  { limit = 100, fetchImpl = fetch }: FetchProjectsOptions = {},
): Promise<FloppyProject[]> {
  const base = (baseUrl ?? '').replace(/\/$/, '');
  if (!base) return [];

  try {
    const res = await fetchImpl(`${base}/api/projects?limit=${limit}`, {
      headers: { origin: 'https://nan.builders' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // `cf` es propio del runtime de Workers: la caché de borde la aplica
      // Cloudflare, no el fetch estándar. En los tests el fetch inyectado lo
      // ignora sin más.
      cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { projects?: ApiProject[] };
    if (!Array.isArray(data?.projects)) return [];

    return data.projects.slice().sort(byStars).slice(0, limit).map(toFloppyProject);
  } catch {
    // Timeout, red caída o JSON inválido: la página se pinta sin proyectos.
    return [];
  }
}
