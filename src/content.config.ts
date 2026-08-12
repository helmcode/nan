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
     * Encabezado bajo el que la página aparece en la navegación de docs.
     *
     * El nav de helmcode escribe los grupos a mano en el layout; aquí van en el
     * dato para que añadir una guía siga siendo crear un fichero y no tocar
     * también el layout, que es como se desincronizan estas cosas. El orden
     * entre grupos sale del `order` más bajo de cada uno, así que tampoco hay
     * una segunda lista que mantener.
     */
    group: z.string().default('Guides'),
    locale: z.string().default('es'),
  }),
});

export const collections = { docs };
