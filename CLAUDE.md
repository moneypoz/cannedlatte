# cannedlatte.com — working rules

Project background, stack and the "adding a product" schema live in `README.md`.
This file is the editorial standard. Read it before building or changing a page.

## The 5 gates

Every new or changed page passes 5 gates.

**Gate 1 — data.** Every number traces to a label photo (`verified: true`) or to a
brand-published source (recorded, and flagged unverified). Unverified figures never
carry headline claims. Check servings-per-container.

**Gate 2 — writing.** Keyword-literal H1. The direct answer in the first sentence.
Table high on the page. 2–3 paragraphs computed from our own data. 2–3 FAQs phrased
as real search queries.

**Gate 3 — accuracy.** No sentence contradicts any table sitewide. Every leader and
every number in prose is recomputed from current data. The page must add something
the brand doesn't publish.

**Gate 4 — technical.** Unique title and meta description, written for the click.
Extensionless, self-referencing canonical matching `og:url`. Sitemap. Breadcrumb.
Internal links in both directions. Schema only where earned — no FAQ rich results
exist any more, and `Product` schema only with a real rating.

**Gate 5 — iterate.** After indexing, mine Search Console for near-miss queries
(position 8–20) and feed the exact phrasings back into the page.

## Standing rules

- **One SKU, one record.** Same nutrition panel and same UPC means the same product —
  alternate artwork belongs in `src/lib/editions.ts`, not in a second record. A
  different panel means a real product file. See `EDITION_IMAGES` in
  `scripts/check-data.mjs`.
- **News is dated to the day we confirmed it**, never to the day a brand acted. See
  the header comment in `src/lib/news.ts`.
- **Generalizations carry their denominator.** "Stronger than 70% of them" needs the
  count it was computed from; "every can we track" narrows to "every can with a
  published figure" the moment one lacks it.
- **Never publish pages faster than they can pass Gate 1.**

## How the gates are enforced

Three checkers run around the build; all three must pass before a deploy.

- `npm run check:data` (prebuild) — images, sources on verified records, and the
  `brandCaffeineGuides` registry against the pages behind it.
- `npm run check:claims` (postbuild) — re-reads `dist/` and cross-checks numeric
  prose against the table rendered on the same page. Every group declares a minimum
  it expects to inspect: **a checker that parses zero claims must fail.**
- `npm run check:urls` (postbuild) — canonical, `og:url` and sitemap agreement.

When you add a page shape that carries numbers, add a group to `check-claims.mjs`
for it, and verify the group bites by deliberately corrupting the built HTML before
trusting the pass.

## Page shapes

- `/latte/<id>` — product page, one per JSON file in `src/content/products/`.
- `/brands/<brandSlug>` — brand hub.
- `/caffeine/<product-id>` — "how much caffeine is in X", one per product with a
  figure. Owns the **flavor** query.
- `/caffeine/<brandSlug>` — brand-level caffeine guide, hand-built per brand and
  registered in `brandCaffeineGuides` in `src/lib/products.ts`. Owns the **brand**
  query. Cross-link with the per-flavor pages rather than duplicating their prose.
- `/best/<slug>`, `/compare/<a>-vs-<b>` — rankings and head-to-heads, defined in
  `src/lib/products.ts`.
