import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Each project lives in its own folder: src/content/projects/<project-name>/index.md
const projects = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/projects',
    // the folder name becomes the page address: /projects/<folder-name>
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      year: z.string(),
      badge: z.string().optional(),
      summary: z.string(),
      cover: image(),
      gallery: z.array(image()).min(1),
      role: z.string().optional(),
      duration: z.string().optional(),
      tools: z.array(z.string()).default([]),
      team: z.string().optional(),
      links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
      order: z.number().default(100),
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects };
