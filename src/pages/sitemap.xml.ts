import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
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
const BILINGUAL = ['/', '/events', '/projects', '/community', '/privacy', '/terms', '/cookies', '/hackaton'];

/**
 * Fuera del sitemap a propósito:
 *   /hackaton/me, /hackaton/submission  -> requieren sesión
 *   /hackaton/leaderboard, /projects    -> contenido de evento, cambia a diario
 *   /api/*                              -> no son páginas
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
