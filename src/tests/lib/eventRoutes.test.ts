/**
 * Rutas /events/[slug]/* — el 404 de slug desconocido vive en el envoltorio.
 *
 * `Astro.rewrite` solo surte efecto en ficheros de ruta; desde un cuerpo
 * `_x.astro` el `return` se ignora y la ruta saldría vacía con 200 (bug
 * detectado en el smoke test local). Este test fija el reparto:
 *  - cada envoltorio (en y /es) llama a resolveEventRoute y devuelve notFound;
 *  - ningún cuerpo llama a fetchEvent ni a Astro.rewrite.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EN = join(process.cwd(), 'src/pages/events/[slug]');
const ES = join(process.cwd(), 'src/pages/es/events/[slug]');
const SCREENS = ['index', 'me', 'submission', 'projects', 'leaderboard'];

describe('rutas /events/[slug]/* — envoltorios y cuerpos', () => {
  it('los envoltorios EN y ES resuelven el evento y devuelven el 404', () => {
    for (const dir of [EN, ES]) {
      for (const name of SCREENS) {
        const src = readFileSync(join(dir, `${name}.astro`), 'utf8');
        expect(src, `${dir}/${name}`).toContain('resolveEventRoute(Astro)');
        expect(src, `${dir}/${name}`).toContain('if (route.notFound) return route.notFound;');
        expect(src, `${dir}/${name}`).toContain(`_${name}.astro`);
        expect(src, `${dir}/${name}`).toContain('<Page event={route.event} />');
        expect(src, `${dir}/${name}`).toContain('export const prerender = false;');
      }
    }
  });

  it('los cuerpos reciben el evento por props y no hacen rewrite', () => {
    const bodies = readdirSync(EN).filter((f) => f.startsWith('_') && f.endsWith('.astro'));
    expect(bodies.sort()).toEqual(SCREENS.map((s) => `_${s}.astro`).sort());
    for (const f of bodies) {
      const src = readFileSync(join(EN, f), 'utf8');
      expect(src, f).toContain('const ev = Astro.props.event;');
      expect(src, f).not.toMatch(/Astro\.rewrite\(/);
      expect(src, f).not.toMatch(/\bfetchEvent\(/);
    }
  });
});
