import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
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
  }),
});

export const collections = { docs };
