import { describe, expect, test, vi } from 'vitest';
import {
  safeUrl,
  safeImage,
  slugify,
  byStars,
  toFloppyProject,
  fetchProjects,
  type ApiProject,
} from '../../lib/projects';

/**
 * Tests de comportamiento, no de texto: aquí hay lógica pura que decide qué
 * enlaces se pintan y en qué orden, y son datos que aporta cualquier miembro al
 * publicar su proyecto.
 */

const project = (over: Partial<ApiProject> = {}): ApiProject => ({
  id: 1,
  handle: 'someone',
  name: 'A project',
  ...over,
});

describe('safeUrl', () => {
  test('acepta http y https', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('http://example.com')).toBe('http://example.com');
  });

  test('descarta javascript: y otros esquemas', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeUrl('file:///etc/passwd')).toBe('');
  });

  test('descarta lo vacío y lo que no es una URL absoluta', () => {
    expect(safeUrl(undefined)).toBe('');
    expect(safeUrl('')).toBe('');
    expect(safeUrl('/relativa')).toBe('');
    expect(safeUrl('example.com')).toBe('');
  });

  test('no se cuela por mayúsculas', () => {
    expect(safeUrl('JavaScript:alert(1)')).toBe('');
    expect(safeUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });
});

describe('safeImage', () => {
  test('exige https: una portada en http la bloquearía el navegador', () => {
    expect(safeImage('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeImage('http://cdn.example.com/a.png')).toBe('');
  });

  test('descarta esquemas peligrosos y lo vacío', () => {
    expect(safeImage('javascript:alert(1)')).toBe('');
    expect(safeImage(undefined)).toBe('');
  });
});

describe('slugify', () => {
  test('pasa a minúsculas y une con guiones', () => {
    expect(slugify('A Project Name')).toBe('a-project-name');
  });

  test('quita los acentos', () => {
    expect(slugify('Evaluación de agentes')).toBe('evaluacion-de-agentes');
  });

  test('no deja guiones sueltos en los extremos', () => {
    expect(slugify('  ¡Hola!  ')).toBe('hola');
    expect(slugify('---a---')).toBe('a');
  });

  test('aguanta lo vacío y lo que no deja nada', () => {
    expect(slugify('')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});

describe('byStars', () => {
  test('ordena descendente', () => {
    const sorted = [project({ stars: 1 }), project({ stars: 9 }), project({ stars: 5 })].sort(byStars);
    expect(sorted.map((p) => p.stars)).toEqual([9, 5, 1]);
  });

  test('un proyecto sin stars no rompe el orden', () => {
    // El bug: sin el `?? 0` el comparador devuelve NaN y el orden queda
    // indefinido para TODA la lista, no solo para el proyecto sin stars.
    const sorted = [project({ stars: 3 }), project({}), project({ stars: 7 })].sort(byStars);
    expect(sorted.map((p) => p.stars ?? 0)).toEqual([7, 3, 0]);
  });
});

describe('toFloppyProject', () => {
  test('el destino prefiere la app y cae al repo', () => {
    expect(toFloppyProject(project({ appUrl: 'https://app.example', repoUrl: 'https://repo.example' })).url)
      .toBe('https://app.example');
    expect(toFloppyProject(project({ repoUrl: 'https://repo.example' })).url).toBe('https://repo.example');
  });

  test('sin destinos válidos la url queda vacía', () => {
    expect(toFloppyProject(project({ appUrl: 'javascript:alert(1)' })).url).toBe('');
    expect(toFloppyProject(project({})).url).toBe('');
  });

  test('cover solo es true con una portada https real', () => {
    expect(toFloppyProject(project({ imageUrl: 'https://cdn.example/a.png' })).cover).toBe(true);
    expect(toFloppyProject(project({ imageUrl: 'http://cdn.example/a.png' })).cover).toBe(false);
    expect(toFloppyProject(project({})).cover).toBe(false);
  });

  test('el slug cae al handle si no hay nombre', () => {
    expect(toFloppyProject(project({ name: '', handle: 'jane-doe' })).slug).toBe('jane-doe');
  });

  test('rellena los huecos en vez de dejar undefined en el marcado', () => {
    const p = toFloppyProject(project({}));
    expect(p.descripcion).toBe('');
    expect(p.tags).toEqual([]);
    expect(p.stars).toBe(0);
  });
});

describe('fetchProjects', () => {
  const ok = (projects: ApiProject[]) =>
    vi.fn(async () => new Response(JSON.stringify({ projects }), { status: 200 }));

  test('pide el límite que se le pasa y manda el origin', async () => {
    const fetchImpl = ok([]);
    await fetchProjects('https://api.example/', { limit: 16, fetchImpl: fetchImpl as unknown as typeof fetch });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // La barra final del base no debe duplicarse.
    expect(url).toBe('https://api.example/api/projects?limit=16');
    expect((init.headers as Record<string, string>).origin).toBe('https://nan.builders');
  });

  test('devuelve los proyectos ordenados y normalizados', async () => {
    const fetchImpl = ok([
      project({ id: 1, name: 'Low', stars: 2 }),
      project({ id: 2, name: 'High', stars: 30, appUrl: 'https://a.example' }),
    ]);
    const result = await fetchProjects('https://api.example', { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.map((p) => p.nombre)).toEqual(['High', 'Low']);
    expect(result[0].url).toBe('https://a.example');
  });

  test('recorta al límite aunque la API lo ignore', async () => {
    // cloud-api devuelve hoy todos los proyectos pase lo que pase en `limit`,
    // así que si no se recortara aquí la home crecería sola.
    const many = Array.from({ length: 17 }, (_, i) => project({ id: i, name: `P${i}`, stars: i }));
    const result = await fetchProjects('https://api.example', {
      limit: 4,
      fetchImpl: ok(many) as unknown as typeof fetch,
    });

    expect(result).toHaveLength(4);
    // Y recorta DESPUÉS de ordenar: se queda con los más estrellados.
    expect(result.map((p) => p.stars)).toEqual([16, 15, 14, 13]);
  });

  test('lista vacía si la API responde con error', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(fetchProjects('https://api.example', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .resolves.toEqual([]);
  });

  test('lista vacía si el fetch lanza (red caída o timeout)', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network'); });
    await expect(fetchProjects('https://api.example', { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .resolves.toEqual([]);
  });

  test('lista vacía si el JSON no tiene la forma esperada', async () => {
    for (const body of ['{"projects":null}', '{}', 'no soy json', '[]']) {
      const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
      await expect(fetchProjects('https://api.example', { fetchImpl: fetchImpl as unknown as typeof fetch }))
        .resolves.toEqual([]);
    }
  });

  test('sin base url no llama a nadie', async () => {
    const fetchImpl = ok([]);
    await expect(fetchProjects('', { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('lleva un timeout, para no colgar la página si cloud-api va lento', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });
    await fetchProjects('https://api.example', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalled();
  });
});
