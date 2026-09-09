// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import rehypePrettyCode from 'rehype-pretty-code';

// https://astro.build/config
export default defineConfig({
  site: 'https://nan.builders',
  output: 'server',
  adapter: cloudflare(),
  integrations: [preact(), mdx()],

  // El idioma va en la RUTA, no en un query param: EN en `/`, ES en `/es/`.
  // Un `?lang=` no es una señal de idioma para los buscadores y no se puede
  // acompañar de hreflang; con rutas sí, y además se pueden prerenderizar.
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },

  // No usamos sesiones de Astro en v1 (sin auth). Si no, el adaptador de
  // Cloudflare activa solo un driver de sesión sobre KV e intenta inyectar un
  // binding KV "SESSION" en la config de wrangler generada. Apuntar el driver
  // de sesión a `unstorage/drivers/null` lo desactiva limpiamente.
  session: {
    driver: {
      entrypoint: 'unstorage/drivers/null',
    },
  },

  vite: {
    plugins: [tailwindcss()]
  },

  markdown: {
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: {
            dark: 'github-dark',
            light: 'github-light',
          },
          keepBackground: false,
          /** @param {any} node */
          onVisitLine(node) {
            if (node.children.length === 0) {
              node.children = [{ type: 'text', value: ' ' }];
            }
          },
          /** @param {any} node */
          onVisitHighlightedLine(node) {
            node.attributes.class.push('highlighted-line');
          },
          /** @param {any} node */
          onVisitHighlightedChars(node) {
            node.attributes.class.push('highlighted-chars');
          },
        },
      ],
    ],
  },
});
