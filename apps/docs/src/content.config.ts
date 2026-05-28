import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    badge: z.object({ text: z.string(), variant: z.enum(['note','tip','caution','danger','success']) }).optional(),
    template: z.string().optional(),
    hero: z.any().optional(),
  }),
});

export const collections = { docs };
