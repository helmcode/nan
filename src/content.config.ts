import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docsSchema = z.object({
  title: z.string(),
  description: z.string(),
  order: z.number().int().min(0),
  /*
   * The heading the page appears under in the docs navigation.
   *
   * helmcode's nav writes the groups by hand in the layout; here they live in
   * the data so adding a guide stays a matter of creating a file rather than
   * also editing the layout, which is how these things drift apart. The order
   * between groups comes from the lowest `order` in each, so there is no
   * second list to maintain either.
   */
  group: z.string().default('Guides'),
  locale: z.string().default('es'),
});

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: docsSchema,
});

/*
 * The Spanish guides live in their own directory rather than under a locale
 * subfolder of `docs`.
 *
 * A `docs/en/…` + `docs/es/…` layout would turn every entry id into `en/intro`
 * and the like, and SAFE_SLUG in src/lib/docsApi.ts rejects slashes: the
 * manifest route throws on the first one, so /api/docs/manifest.json would
 * answer 500 and the Discord bot would lose everything. Keeping English where
 * it is leaves those slugs untouched.
 */
const docsEs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs-es' }),
  schema: docsSchema,
});

export const collections = { docs, docsEs };
