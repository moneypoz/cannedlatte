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
    type: z.enum(['latte', 'black', 'nitro', 'energy', 'milk-coffee']).default('latte'),
    flavor: z.string().optional(),
    sizeOz: z.number().nullable(),
    caffeineMg: z.number().nullable(),
    // caffeineMg above is always the one number the machinery runs on: ranking,
    // sorting, per-ounce maths, head-to-head deltas. caffeineBasis says what that
    // number is, and therefore how it may be written down.
    //
    //   'exact'   — the source published this figure. "230 mg".
    //   'range'   — the source published a span; caffeineMg is its midpoint and
    //               caffeineMinMg/caffeineMaxMg hold the ends. "40–50 mg".
    //   'ceiling' — the source published a bound, not a figure; caffeineMg is that
    //               bound. "up to 120 mg", which is Death Wish's own label wording.
    //
    // A basis other than 'exact' is a *qualified* figure. It may be reported freely,
    // because every place the site prints it prints the qualifier with it — but it
    // may never be crowned, since a superlative strips the qualifier off. See
    // caffeineFigure and isQualified in src/lib/titles.ts, and the rules in
    // check-data.mjs (the fields each basis requires) and check-claims.mjs (that no
    // rendered figure ever loses its qualifier, and no crown ever rests on one).
    caffeineBasis: z.enum(['exact', 'range', 'ceiling']).default('exact'),
    caffeineMinMg: z.number().nullable().default(null),
    caffeineMaxMg: z.number().nullable().default(null),
    caffeineNote: z.string().optional(),       // e.g. "brand lists 100–150 mg"
    sugarG: z.number().nullable(),
    addedSugar: z.boolean().nullable().default(null),
    addedSugarG: z.number().nullable().default(null),   // brand-published "includes Xg added sugars", where stated
    proteinG: z.number().nullable(),
    calories: z.number().nullable(),
    // 'plant' is the milk column's version of null: the can is demonstrably
    // plant-based but the brand does not say which plant. Guessing 'oat' here
    // would put a possible tree-nut drink under the oat filter, which is the one
    // direction this field must never be wrong in. Currently unused — the one can
    // that needed it turned out to be almond, printed on a label image the brand
    // publishes but does not put in text. Kept because the situation will recur.
    milk: z.enum(['dairy', 'lactose-free dairy', 'skim', 'oat', 'almond', 'coconut', 'plant', 'none']),
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
    // The barcode off the can, where we have had one in hand. Optional, and read by
    // nobody at build time — it exists because "same nutrition panel and same UPC
    // means the same product" is the rule that decides whether alternate artwork is
    // an edition or a second record, and until now that rule had no field behind it.
    upc: z.string().nullable().default(null),
    image: z.string().optional(),               // /images/products/<slug>.jpg once photographed
    summary: z.string(),
    // My own words, written after I drink the can. First person, and short — the
    // house style is one to three sentences. That length is not enforced here: the
    // notes already on the site run longer where the can earned it, and a schema
    // that counted full stops would fail the build on writing that is simply good.
    tastingNotes: z.string().optional(),
    // My 1–5 rating, to at most one decimal place. The star row clips to a
    // percentage of its width, so it draws any tenth cleanly; the printed number
    // beside it stays the thing anyone actually reads the rating off.
    //
    // A rating and its notes are one act — drinking the can and writing it up — so
    // the refinement below refuses either one without the other. A bare number is an
    // opinion with no reasoning attached, and bare notes leave the Product schema
    // gate (see the product page) in a state nothing can render.
    rating: z.number().min(1).max(5)
      .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
        message: 'rating takes at most one decimal place (1.0–5.0), e.g. 4 or 4.5 or 4.3',
      })
      .nullable().default(null),
    tastedOn: z.string().optional(),            // YYYY-MM-DD, the day the can was actually drunk
    // The can as it was drunk, not the catalogue shot: our hand, our kitchen, the
    // day of the tasting. `image` stays the clean product photo the rest of the site
    // lays out against, so this is a second file rather than a replacement — and
    // check-data.mjs counts it as referenced, or the orphan rule would delete-flag it.
    tastingPhoto: z.string().optional(),        // /images/products/<slug>-tasting.jpg
    launched: z.string().optional(),            // YYYY-MM for the /new tracker
    verified: z.boolean().default(false),       // true once specs come from a label you photographed
    updated: z.string(),                        // YYYY-MM-DD, shown on page (date-stamp every spec)
    sources: z.array(z.string()).default([]),
  }).superRefine((d, ctx) => {
    // Both or neither. Enforced here rather than in a checker because this one is a
    // fact about a single record, and catching it at content-load names the file
    // and the field instead of reporting a missing <script> in a built page.
    const rated = d.rating != null;
    const noted = d.tastingNotes != null && d.tastingNotes.trim() !== '';
    if (rated && !noted) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tastingNotes'],
        message: `rating ${d.rating} with no tastingNotes — a score with no reasoning behind it. Write the notes or drop the rating.` });
    }
    if (noted && !rated) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rating'],
        message: 'tastingNotes with no rating — the Product schema gate needs both, so the notes would publish with no review behind them.' });
    }
  }),
});

export const collections = { products };
