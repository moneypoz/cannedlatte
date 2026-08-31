import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One JSON file per product in src/content/products/.
// null = not yet verified from a can in hand. Pages hide nulls rather than showing "0".
const products = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/products' }),
  schema: z.object({
    brand: z.string(),
    brandSlug: z.string(),
    name: z.string(),
    type: z.enum(['latte', 'black', 'nitro', 'energy']).default('latte'),
    flavor: z.string().optional(),
    sizeOz: z.number().nullable(),
    caffeineMg: z.number().nullable(),
    caffeineNote: z.string().optional(),       // e.g. "brand lists 100–150 mg"
    sugarG: z.number().nullable(),
    addedSugar: z.boolean().nullable().default(null),
    proteinG: z.number().nullable(),
    calories: z.number().nullable(),
    milk: z.enum(['dairy', 'lactose-free dairy', 'skim', 'oat', 'almond', 'none']),
    dairyFree: z.boolean(),
    refrigerated: z.boolean().default(false),
    pricePerCan: z.number().nullable(),
    packPrice: z.number().nullable().default(null),
    packSize: z.number().nullable().default(null),
    retailers: z.array(z.string()).default([]),
    buyLinks: z.array(z.object({
      label: z.string(),
      url: z.string().url(),
      affiliate: z.boolean().default(false),
    })).default([]),
    image: z.string().optional(),               // /images/products/<slug>.jpg once photographed
    summary: z.string(),
    tastingNotes: z.string().optional(),        // your own words, written after you drink it
    launched: z.string().optional(),            // YYYY-MM for the /new tracker
    verified: z.boolean().default(false),       // true once specs come from a label you photographed
    updated: z.string(),                        // YYYY-MM-DD, shown on page (date-stamp every spec)
    sources: z.array(z.string()).default([]),
  }),
});

export const collections = { products };
