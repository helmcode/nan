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
 *   /events/{slug} y sus 4 pantallas -> las pantallas de cada evento (hackatón,
 *                                  challenge…) son dinámicas: el copy y la fase
 *                                  vienen de la API y detrás hay sesión (me,
 *                                  submission). Van todas con noindex; la
 *                                  entrada pública es la agenda (/events) y la
 *                                  landing del evento (p. ej. /gauntlet).
 *                                  /hackaton/* redirige (301) a
 *                                  /events/hackaton-2026-1/*.
 *   /survey y /es/survey        -> el informe de la encuesta va con noindex y
 *                                  nofollow: es un documento que se reparte por
 *                                  enlace a la comunidad, no contenido que
 *                                  queramos en el buscador. Si algún día se
 *                                  quiere indexar, se quitan las dos banderas
 *                                  de _survey.astro y se añade aquí.
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

  /*
   * Las guías existen ya en los dos idiomas, así que cada una se lista dos
   * veces con sus alternates. No todas las copias en español están traducidas
   * aún, que es un asunto de contenido: la URL existe y responde 200, y la
   * propia página lo dice cuando todavía enseña el inglés.
   */
  const docs = await getCollection('docs');
  for (const doc of docs) {
    const alternates = LOCALES.map((lang) => ({
      lang,
      href: abs(withLang(`/docs/${doc.id}`, lang)),
    }));
    for (const { href } of alternates) {
      entries.push(urlEntry(href.replace(SITE, ''), alternates));
    }
  }

  /*
   * La referencia de la API se lista aparte porque ya no sale de la
   * colección: Scalar la sirve desde la spec. Y sí lleva alternates, porque
   * es la única página bajo /docs que existe en los dos idiomas: la spec se
   * queda en inglés, pero el chrome y las etiquetas de Scalar están traducidos
   * y /es/docs/api es una URL real que queremos indexada como tal.
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
