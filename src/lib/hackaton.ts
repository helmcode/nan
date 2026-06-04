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

// Construye la URL destino en el backend conservando query string.
export function backendURL(path: string, search: string): string {
  const base = env.CLOUD_API_URL.replace(/\/$/, '');
  const clean = path.replace(/^\/+/, '');
  return `${base}/api/hackaton/${clean}${search ?? ''}`;
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
  checkin_at?: string | null;
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
