import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Pages people read before or while switching from another journal app. */
const articleSchema = z.object({
  /** `<title>` text. */
  title: z.string(),
  description: z.string(),
  /** Visible H1. */
  heading: z.string(),
  /** Name of the other app, as people search for it. */
  app: z.string(),
  /** When the claims about the other app were last checked against `sources`. */
  lastChecked: z.coerce.date(),
  sources: z.array(z.object({ label: z.string(), url: z.url() })).min(1),
});

const importGuides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/import' }),
  schema: articleSchema,
});

const comparisons = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/compare' }),
  schema: articleSchema,
});

/** General guides that make no claims about other apps, such as the prompts page. */
const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: z.object({
    /** `<title>` text. */
    title: z.string(),
    description: z.string(),
    /** Visible H1. */
    heading: z.string(),
    /** Short label above the H1. */
    eyebrow: z.string(),
  }),
});

export const collections = { importGuides, comparisons, guides };
