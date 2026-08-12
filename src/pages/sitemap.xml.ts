import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { API_DOC_SLUG } from '../lib/apiDoc';
import { LOCALES, withLang, type Locale } from '../lib/i18n';

export const prerender = false;

/**
 * Sitemap propio en vez de @astrojs/sitemap.
 *
 * La integración solo recoge páginas prerenderizadas y aquí el output es
 * 'server': con ella el sitemap saldría vacío. Escribirlo a mano cuesta poco y
 * además deja decidir explícitamente qué entra, que es lo que se quiere:
 * las pantallas del hackatón que hay detrás de login no deben indexarse.
 */

const SITE = 'https://nan.builders';

/** Rutas con versión en los dos idiomas. */
const BILINGUAL = [
  '/',
  '/events',
  '/gauntlet',
  '/projects',
  '/community',
  '/privacy',
  '/terms',
  '/cookies',
];

/**
 * Fuera del sitemap a propósito:
 *   /hackaton y sus 4 pantallas -> el hackatón #1 ya pasó (7-13 jun) y el
 *                                  registro está cerrado, así que es el
 *                                  registro de un evento, no contenido vivo.
 *                                  Ninguna página lo enlaza, y declararlo
 *                                  indexable sin entrada era pedir que se
 *                                  indexara algo a lo que solo se llega
 *                                  escribiendo la URL. Van todas con noindex.
 *                                  Cuando haya un #2 se rediseñan las cinco
 *                                  pantallas y se le da entrada, en su PR.
 *   /404                        -> noindex
 *   /api/*                      -> no son páginas
 */

// La raíz conserva la barra para que coincida exactamente con el canonical
// que emite NanBase; el resto va sin barra final.
const abs = (path: string) => (path === '/' ? `${SITE}/` : `${SITE}${path}`);

function urlEntry(path: string, alternates: { lang: Locale; href: string }[]): string {
  const links = alternates
    .map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`)
    .join('');
  const xDefault = alternates.find((a) => a.lang === 'en');
  return (
    `<url><loc>${abs(path)}</loc>${links}` +
    (xDefault ? `<xhtml:link rel="alternate" hreflang="x-default" href="${xDefault.href}"/>` : '') +
    `</url>`
  );
}

export const GET: APIRoute = async () => {
  const entries: string[] = [];

  for (const path of BILINGUAL) {
    const alternates = LOCALES.map((lang) => ({ lang, href: abs(withLang(path, lang)) }));
    for (const { href } of alternates) {
      entries.push(urlEntry(href.replace(SITE, '') || '/', alternates));
    }
  }

  // La documentación solo existe en inglés (la colección MDX no está traducida),
  // así que va sin alternates.
  const docs = await getCollection('docs');
  for (const doc of docs) {
    entries.push(`<url><loc>${abs(`/docs/${doc.id}`)}</loc></url>`);
  }

  /*
   * La referencia de API va aparte porque ya no sale de la colección: la sirve
   * Scalar desde el spec. Y sí lleva alternates, porque es la única página de
   * /docs que existe en los dos idiomas: el spec se queda en inglés, pero el
   * chrome y las etiquetas de Scalar están traducidos y /es/docs/api es una URL
   * real que queremos indexada como tal.
   */
  const apiAlternates = LOCALES.map((lang) => ({
    lang,
    href: abs(withLang(`/docs/${API_DOC_SLUG}`, lang)),
  }));
  for (const { href } of apiAlternates) {
    entries.push(urlEntry(href.replace(SITE, ''), apiAlternates));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
    entries.join('') +
    `</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
