import { describe, expect, test, vi, beforeEach } from 'vitest';

// astro:content es un módulo virtual que solo existe dentro del build de Astro,
// así que se moquea antes de importar la ruta.
const getCollectionMock = vi.fn();
vi.mock('astro:content', () => ({ getCollection: getCollectionMock }));

const { GET } = await import('../../pages/sitemap.xml');

/**
 * El sitemap es la única declaración de qué queremos indexado, y se escribió a
 * mano porque @astrojs/sitemap no recoge rutas SSR. Hasta ahora no tenía ningún
 * test, y es justo donde un error no se ve: sale mal y nadie se entera hasta que
 * el buscador indexa lo que no debía.
 */

const SITE = 'https://nan.builders';

async function sitemap(docs: { id: string }[] = []) {
  getCollectionMock.mockResolvedValue(docs);
  const res = await GET({} as Parameters<typeof GET>[0]);
  return { res: res as Response, xml: await (res as Response).text() };
}

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

beforeEach(() => getCollectionMock.mockReset());

describe('sitemap.xml', () => {
  test('se sirve como XML', async () => {
    const { res } = await sitemap();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
  });

  test('declara el namespace de xhtml, que hace falta para los alternates', async () => {
    const { xml } = await sitemap();
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  test('cada ruta bilingüe aparece en los dos idiomas', async () => {
    const { xml } = await sitemap();
    const urls = locs(xml);

    for (const path of ['/events', '/gauntlet', '/projects', '/community', '/privacy', '/terms', '/cookies']) {
      expect(urls).toContain(`${SITE}${path}`);
      expect(urls).toContain(`${SITE}/es${path}`);
    }
    expect(urls).toContain(`${SITE}/`);
    expect(urls).toContain(`${SITE}/es`);
  });

  test('la landing del gauntlet está declarada: se enlaza desde /events', async () => {
    // Regla del proyecto: o entra en el sitemap, o va con noindex. La fila de
    // la agenda la enlaza, así que tiene que entrar.
    const { xml } = await sitemap();
    expect(locs(xml)).toContain(`${SITE}/gauntlet`);
  });

  test('el hackatón queda fuera entero, en los dos idiomas', async () => {
    const { xml } = await sitemap();
    const urls = locs(xml);

    // El evento ya pasó y ninguna página lo enlaza: o entrada en la nav, o
    // fuera del sitemap con noindex. Lo que no vale es declararlo indexable
    // sin que se pueda llegar. Las cinco pantallas van con noindex.
    for (const path of ['/hackaton', '/hackaton/me', '/hackaton/submission', '/hackaton/leaderboard', '/hackaton/projects']) {
      expect(urls).not.toContain(`${SITE}${path}`);
      expect(urls).not.toContain(`${SITE}/es${path}`);
    }
  });

  test('no cuela el 404 ni las rutas de API', async () => {
    const { xml } = await sitemap();
    const urls = locs(xml);

    // noindex.
    expect(urls.some((u) => u.includes('/404'))).toBe(false);
    // No son páginas.
    expect(urls.some((u) => u.includes('/api/'))).toBe(false);
  });

  test('solo la raíz lleva barra final, y el resto no', async () => {
    const { xml } = await sitemap();
    for (const url of locs(xml)) {
      if (url === `${SITE}/`) continue;
      expect(url.endsWith('/')).toBe(false);
    }
  });

  test('cada URL bilingüe declara sus dos alternates y el x-default', async () => {
    const { xml } = await sitemap();
    // Se toma un <url> concreto y se comprueba su bloque, no el documento entero.
    const block = xml.match(/<url><loc>https:\/\/nan\.builders\/events<\/loc>(.*?)<\/url>/)?.[1] ?? '';

    expect(block).toContain(`hreflang="en" href="${SITE}/events"`);
    expect(block).toContain(`hreflang="es" href="${SITE}/es/events"`);
    expect(block).toContain(`hreflang="x-default" href="${SITE}/events"`);
  });

  test('el x-default apunta siempre al inglés, también en la URL española', async () => {
    const { xml } = await sitemap();
    const block = xml.match(/<url><loc>https:\/\/nan\.builders\/es\/events<\/loc>(.*?)<\/url>/)?.[1] ?? '';
    expect(block).toContain(`hreflang="x-default" href="${SITE}/events"`);
  });

  test('la documentación entra desde la colección, y sin alternates (solo existe en inglés)', async () => {
    const { xml } = await sitemap([{ id: 'intro' }, { id: 'apps' }]);
    const urls = locs(xml);

    expect(urls).toContain(`${SITE}/docs/intro`);
    expect(urls).toContain(`${SITE}/docs/apps`);

    const block = xml.match(/<url><loc>https:\/\/nan\.builders\/docs\/intro<\/loc>(.*?)<\/url>/)?.[1] ?? '';
    expect(block).not.toContain('hreflang');
  });

  test('sin documentos, el sitemap sigue siendo válido', async () => {
    const { xml } = await sitemap([]);
    expect(xml).toContain('<urlset');
    expect(xml.includes('/docs/')).toBe(false);
  });

  test('no hay URLs repetidas', async () => {
    const { xml } = await sitemap([{ id: 'intro' }]);
    const urls = locs(xml);
    expect(urls.length).toBe(new Set(urls).size);
  });
});
