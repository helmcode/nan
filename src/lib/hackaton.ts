import { env } from 'cloudflare:workers';

// Paths admin nunca deben atravesar el proxy público (§9.2).
const ADMIN_PREFIX = 'admin';

export function isAdminPath(path: string): boolean {
  // Normaliza: decodifica %2f, baja a minúsculas, quita barras iniciales y
  // colapsa barras repetidas, para que //admin, Admin/, %2fadmin no se cuelen.
  let p = path;
  try { p = decodeURIComponent(path); } catch { /* ruta malformada: usar tal cual */ }
  p = p.toLowerCase().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  return p === ADMIN_PREFIX || p.startsWith(ADMIN_PREFIX + '/');
}

/**
 * Segmento de ruta admisible: palabra plana.
 *
 * Deliberadamente NO incluye `%`, porque un `%2f` o un `%5c` reintroducen el
 * separador después de que el filtro haya mirado la ruta. Todas las rutas que
 * consume el proxy son un único segmento llano (`event`, `register`, `vote`,
 * `submission`, `reassign`), así que el coste de esta estrechez es cero.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Construye la URL destino en el backend conservando query string.
 *
 * Devuelve `null` si la ruta pedida no es una ruta simple bajo
 * `/api/hackaton/`; quien llame responde 404 sin tocar el backend.
 *
 * Por qué no basta con comprobar el prefijo antes de concatenar: la comprobación
 * y la URL final no operaban sobre la misma representación de la ruta. Hay tres
 * decodificaciones en juego, no una: `isAdminPath` decodifica, Astro decodifica
 * otra vez antes de enrutar y `new URL()` resuelve los dot-segments al final. Un
 * `..` codificado podía sobrevivir a la comprobación y resolverse después, ya
 * fuera del prefijo.
 *
 * Se valida en dos pasos independientes a propósito, porque ninguno cubre al
 * otro:
 *
 *   1. Cada segmento contra `SAFE_SEGMENT`, que descarta los dot-segments y los
 *      separadores codificados. Hace falta porque el paso 2 no los ve: `%2f` no
 *      es un dot-segment para el parser de URL, así que la ruta se queda dentro
 *      del prefijo sin resolver y el resultado dependería de cómo normalice el
 *      router del backend.
 *   2. El pathname ya resuelto por `new URL()` contra el prefijo esperado. Hace
 *      falta porque no depende de que hayamos enumerado bien las
 *      codificaciones de `..`.
 */
export function backendURL(path: string, search: string): string | null {
  const base = env.CLOUD_API_URL.replace(/\/$/, '');
  const prefix = `${base}/api/hackaton/`;

  const segments = (path ?? '').split('/').filter((s) => s !== '');
  if (segments.length === 0) return null;
  if (!segments.every((s) => SAFE_SEGMENT.test(s) && s !== '.' && s !== '..')) return null;

  let target: URL;
  let expected: URL;
  try {
    target = new URL(`${prefix}${segments.join('/')}${search ?? ''}`);
    expected = new URL(prefix);
  } catch {
    return null;
  }

  // Se comparan origin y pathname por separado, no el href entero: `new URL()`
  // normaliza el host (lo baja a minúsculas) y compararlo como texto contra el
  // valor crudo de la variable de entorno daría falsos negativos.
  if (target.origin !== expected.origin) return null;
  if (!target.pathname.startsWith(expected.pathname)) return null;

  return target.href;
}

// Cabeceras a reenviar al backend: preserva cookie/sesión NaN; nunca reenvía la
// admin key (§9.2). Fija Origin para la política CORS del backend (§13).
export function forwardHeaders(request: Request): Headers {
  const out = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) out.set('cookie', cookie);
  out.set('content-type', 'application/json');
  out.set('origin', 'https://nan.builders');
  // Backend hackatón lee CF-Connecting-IP; otros endpoints X-Forwarded-For.
  // Reenviamos ambos para que el rate-limit por IP funcione en cualquier ruta.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) { out.set('cf-connecting-ip', ip); out.set('x-forwarded-for', ip); }
  return out;
}

// Tipos del envelope { data } del backend del hackatón (SSR).
export interface Participant {
  id: string;
  name: string;
  status?: string;
  discord_user?: string;
  specialty?: string;
  level?: string;
  is_reserve?: boolean;
}
export interface Team {
  id: string;
  name?: string;
  members?: Participant[];
}
export interface MeData {
  participant?: Participant | null;
  team?: Team | null;
  my_vote?: string | null;
  submission?: unknown;
}

// Lee el envelope { data } estándar de la API; null si el cuerpo no es JSON.
export async function jsonData<T = unknown>(res: Response): Promise<T | null> {
  try { return ((await res.json()) as { data?: T })?.data ?? null; }
  catch { return null; }
}
