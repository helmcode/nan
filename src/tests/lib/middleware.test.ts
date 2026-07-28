import { describe, expect, test, vi } from 'vitest';
import { onRequest } from '../../middleware';

/**
 * Comportamiento, no texto: esto decide a qué idioma acaba un visitante que
 * llega por un enlace ya compartido.
 */

type Handler = typeof onRequest;

/** Ejecuta el middleware con una URL y devuelve a dónde redirige, o null. */
async function run(href: string) {
  const redirect = vi.fn((location: string, status?: number) =>
    new Response(null, { status: status ?? 302, headers: { location } }),
  );
  const next = vi.fn(async () => new Response('page', { status: 200 }));

  const context = { url: new URL(href), redirect } as unknown as Parameters<Handler>[0];
  const res = await onRequest(context, next as unknown as Parameters<Handler>[1]);

  return {
    res: res as Response,
    location: redirect.mock.calls[0]?.[0] ?? null,
    status: redirect.mock.calls[0]?.[1] ?? null,
    passedThrough: next.mock.calls.length > 0,
  };
}

describe('middleware — enlaces del esquema ?lang=', () => {
  test('?lang=es lleva a la ruta con prefijo, con 301', async () => {
    const { location, status } = await run('https://nan.builders/community?lang=es');
    expect(location).toBe('/es/community');
    expect(status).toBe(301);
  });

  test('la raíz con ?lang=es lleva a /es', async () => {
    const { location } = await run('https://nan.builders/?lang=es');
    expect(location).toBe('/es');
  });

  test('?lang=en solo limpia el parámetro: el inglés vive sin prefijo', async () => {
    const { location, status } = await run('https://nan.builders/community?lang=en');
    expect(location).toBe('/community');
    expect(status).toBe(301);
  });

  test('no vuelve a prefijar una ruta que ya está en español', async () => {
    const { location } = await run('https://nan.builders/es/community?lang=es');
    expect(location).toBe('/es/community');
  });

  test('conserva los demás parámetros', async () => {
    const { location } = await run('https://nan.builders/projects?lang=es&tag=agents');
    expect(location).toBe('/es/projects?tag=agents');
  });

  test('sin ?lang= no se mete por medio', async () => {
    const { passedThrough, location } = await run('https://nan.builders/es/community');
    expect(passedThrough).toBe(true);
    expect(location).toBeNull();
  });

  test('un ?lang= con cualquier otro valor se deja pasar', async () => {
    // No inventamos idiomas: `?lang=fr` no es una ruta nuestra.
    const { passedThrough } = await run('https://nan.builders/community?lang=fr');
    expect(passedThrough).toBe(true);
  });

  test('no redirige en bucle: el destino nunca lleva ?lang=', async () => {
    const first = await run('https://nan.builders/community?lang=es');
    expect(first.location).not.toContain('lang=');

    // Y la URL de destino, pasada otra vez, ya no redirige.
    const second = await run(`https://nan.builders${first.location}`);
    expect(second.passedThrough).toBe(true);
  });

  test('el 301 sale con la cabecera location', async () => {
    const { res } = await run('https://nan.builders/community?lang=es');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/es/community');
  });
});
