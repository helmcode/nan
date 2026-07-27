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

  // We do not use Astro sessions in v1 (no auth). The Cloudflare adapter
  // otherwise auto-enables a KV-backed session driver and tries to inject a
  // "SESSION" KV binding into the generated wrangler config. Pointing the
  // session driver at `unstorage/drivers/null` disables it cleanly.
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
