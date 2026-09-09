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

  test('las pantallas de los eventos quedan fuera enteras, en los dos idiomas', async () => {
    const { xml } = await sitemap();
    const urls = locs(xml);

    // Son dinámicas (copy y fase desde la API) y parte va detrás de sesión: o
    // entrada en la nav, o fuera del sitemap con noindex. Las cinco pantallas
    // de cada evento van con noindex; la entrada pública es /events y /gauntlet.
    for (const slug of ['hackaton-2026-1', 'gauntlet-2026-08']) {
      for (const sub of ['', '/me', '/submission', '/leaderboard', '/projects']) {
        expect(urls).not.toContain(`${SITE}/events/${slug}${sub}`);
        expect(urls).not.toContain(`${SITE}/es/events/${slug}${sub}`);
      }
    }
    // Las URLs antiguas redirigen; tampoco entran.
    expect(urls).not.toContain(`${SITE}/hackaton`);
    expect(urls).not.toContain(`${SITE}/es/hackaton`);
  });

  test('el informe de la encuesta queda fuera, en los dos idiomas', async () => {
    const { xml } = await sitemap();
    const urls = locs(xml);

    // Va con noindex y nofollow: se reparte por enlace, no se indexa. Tenerlo
    // en el sitemap sería declarar lo contrario de lo que dice la propia página.
    expect(urls).not.toContain(`${SITE}/survey`);
    expect(urls).not.toContain(`${SITE}/es/survey`);
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

  /**
   * Las guías eran solo en inglés y se listaban sin alternates. Ahora existen
   * en /docs/<slug> y /es/docs/<slug>, así que cada una se lista en los dos
   * idiomas, declaradas de forma cruzada. Que la copia en español esté ya
   * traducida o no es cuestión de contenido y no cambia qué es indexable.
   */
  test('every guide is listed in both languages, with its alternates', async () => {
    const { xml } = await sitemap([{ id: 'intro' }, { id: 'apps' }]);
    const urls = locs(xml);

    for (const id of ['intro', 'apps']) {
      expect(urls).toContain(`${SITE}/docs/${id}`);
      expect(urls).toContain(`${SITE}/es/docs/${id}`);
    }

    const block = xml.match(/<url><loc>https:\/\/nan\.builders\/docs\/intro<\/loc>(.*?)<\/url>/)?.[1] ?? '';
    expect(block).toContain(`hreflang="en" href="${SITE}/docs/intro"`);
    expect(block).toContain(`hreflang="es" href="${SITE}/es/docs/intro"`);
  });

  test('sin documentos, el sitemap sigue siendo válido', async () => {
    const { xml } = await sitemap([]);
    expect(xml).toContain('<urlset');
    // La referencia de la API no depende de la colección, así que sobrevive a
    // una vacía; lo que no puede aparecer es ninguna guía.
    expect(locs(xml).filter((u) => u.includes('/docs/'))).toEqual([
      `${SITE}/docs/api`,
      `${SITE}/es/docs/api`,
    ]);
  });

  /**
   * /docs/api ya no sale de la colección: Scalar lo sirve desde la spec. Además
   * es la única página bajo /docs que existe en español, así que es la única de
   * la sección que lleva alternates. Si alguna vez vuelve a colarse en la
   * colección aparecería dos veces, que es lo que cubre el test de URLs
   * repetidas.
   */
  test('the API reference is listed even though it is not in the collection, in both languages', async () => {
    const { xml } = await sitemap([{ id: 'intro' }]);
    const urls = locs(xml);

    expect(urls).toContain(`${SITE}/docs/api`);
    expect(urls).toContain(`${SITE}/es/docs/api`);

    const block = xml.match(/<url><loc>https:\/\/nan\.builders\/docs\/api<\/loc>(.*?)<\/url>/)?.[1] ?? '';
    expect(block).toContain(`hreflang="en" href="${SITE}/docs/api"`);
    expect(block).toContain(`hreflang="es" href="${SITE}/es/docs/api"`);
    expect(block).toContain(`hreflang="x-default" href="${SITE}/docs/api"`);
  });

  test('no hay URLs repetidas', async () => {
    const { xml } = await sitemap([{ id: 'intro' }]);
    const urls = locs(xml);
    expect(urls.length).toBe(new Set(urls).size);
  });
});
