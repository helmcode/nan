import { env } from 'cloudflare:workers';

// Paths admin nunca deben atravesar el proxy público (§9.2).
const ADMIN_PREFIX = 'admin';

export function isAdminPath(path: string): boolean {
  return path === ADMIN_PREFIX || path.startsWith(ADMIN_PREFIX + '/');
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
  const auth = request.headers.get('authorization');
  if (auth) out.set('authorization', auth);
  out.set('content-type', 'application/json');
  out.set('origin', 'https://nan.builders');
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) out.set('cf-connecting-ip', ip);
  return out;
}
