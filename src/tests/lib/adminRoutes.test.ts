import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Guarda del panel de administración (SPEC v3 §8).
 *
 * Cada FICHERO DE RUTA bajo `src/pages/events/admin` resuelve la guardia de
 * staff con `resolveAdminRoute(Astro)` y devuelve el 404 si toca; el cuerpo
 * (`_x.astro`) recibe `staff` y `cookie` como props y no toca la sesión. Si
 * una ruta nueva se olvida de la guardia, cualquier visitante vería el
 * esqueleto de la pantalla. El panel es SSR (`prerender = false`) y solo
 * existe en español: no hay `src/pages/es/events/admin`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const adminDir = resolve(here, '../../pages/events/admin');

function astroFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) astroFiles(full, found);
    else if (entry.endsWith('.astro')) found.push(full);
  }
  return found;
}

const all = astroFiles(adminDir);
const routes = all.filter((f) => !basename(f).startsWith('_'));
const bodies = all.filter((f) => basename(f).startsWith('_'));

describe('rutas de /events/admin', () => {
  test('hay rutas y cuerpos que revisar', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(bodies.length).toBeGreaterThan(0);
  });

  test.each(routes)('%s resuelve la guardia de staff y es SSR', (route) => {
    const src = readFileSync(route, 'utf-8');
    // Rutas globales: resolveAdminRoute; rutas por evento: resolveAdminEventRoute (añade la ficha y el 404 de slug).
    expect(src).toMatch(/const route = await resolveAdmin(Event)?Route\(Astro\);/);
    expect(src).toMatch(/if \(route\.notFound\) return route\.notFound;/);
    expect(src).toMatch(/export const prerender = false;/);
    expect(src).toMatch(/staff=\{route\.staff\}/);
    expect(src).toMatch(/cookie=\{route\.cookie\}/);
  });

  test.each(bodies)('%s no hace rewrite ni consulta la sesión', (body) => {
    const src = readFileSync(body, 'utf-8');
    expect(src).not.toMatch(/Astro\.rewrite/);
    expect(src).not.toMatch(/resolveAdmin(Event)?Route/);
    expect(src).not.toMatch(/fetchStaffSession/);
    expect(src).not.toMatch(/handle\w+Form\(/);
  });

  test('el panel no tiene variante /es/', () => {
    expect(existsSync(resolve(here, '../../pages/es/events/admin'))).toBe(false);
  });
});
