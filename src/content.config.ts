import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docsSchema = z.object({
  title: z.string(),
  description: z.string(),
  order: z.number().int().min(0),
  /*
   * El encabezado bajo el que aparece la página en la navegación de docs.
   *
   * La navegación de helmcode escribe los grupos a mano en el layout; aquí
   * viven en los datos para que añadir una guía siga siendo cuestión de crear
   * un fichero y no de editar también el layout, que es como estas cosas se
   * desincronizan. El orden entre grupos sale del `order` más bajo de cada
   * uno, así que tampoco hay una segunda lista que mantener.
   */
  group: z.string().default('Guides'),
  locale: z.string().default('es'),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: docsSchema,
});

/*
 * Las guías en español viven en su propio directorio y no en una subcarpeta
 * de locale dentro de `docs`.
 *
 * Una estructura `docs/en/…` + `docs/es/…` convertiría cada id de entrada en
 * `en/intro` y similares, y SAFE_SLUG en src/lib/docsApi.ts rechaza las
 * barras: la ruta del manifest lanza en la primera, así que
 * /api/docs/manifest.json respondería 500 y el bot de Discord lo perdería
 * todo. Dejar el inglés donde está deja esos slugs intactos.
 */
const docsEs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs-es' }),
  schema: docsSchema,
});

export const collections = { docs, docsEs };
