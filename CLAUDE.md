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

- **Reporting a figure and crowning one are different claims.** *Reporting* is
  stating a product's own figure beside its own name — `Bones Cannoli: 200 mg
  Caffeine`, `A vs B: 230 vs 255 mg`. An unverified figure is allowed, but only on a
  page that discloses its sourcing: the disclosure is what earns the right, so a page
  that reports figures without marking the brand-sourced ones may not report them in
  its title either. *Crowning* is a superlative resting on one record's figure —
  "Strongest", `Up to 255 mg`, `From 0 g`. Gate 1 bars an unverified figure from
  carrying one, so the title falls back to a count of the list, which is a fact about
  our own database and can be neither unverified nor in conflict with the table.
  Never reach past an unverified leader to the best verified figure instead: a title
  reading `Up to 230 mg` above a table whose top row shows 255 mg breaks Gate 3.
  See `bestHeadline` in `src/lib/titles.ts`; the fallback reverses itself on its own
  the day that record is checked against a label.

- **Every number in a title is computed, never typed.** Titles live in `<head>`,
  where no amount of looking at the page reveals a stale one. Templates live in
  `src/lib/titles.ts`, and the `titles` group in `check-claims.mjs` re-derives each
  number from the same table the page renders.

- **A published range is reported as a range.** Where a source says "70–80 mg",
  `caffeineMinMg` and `caffeineMaxMg` hold both ends and `caffeineMg` stays the
  midpoint. The midpoint is for machinery — ranking, sorting, per-ounce maths,
  head-to-head deltas — and never for a title: a `<title>` is read in a results page
  stripped of the note that qualifies it, so "75 mg per Can" there asserts a
  precision the brand never offered. Pages lead with the range and name the midpoint
  as the derived figure it is. Populate both ends or neither; a `caffeineNote` that
  describes a range while the fields are empty fails `check-data.mjs`, because that
  is exactly the state that renders a midpoint as though it were printed.

- **Qualifiers have to travel.** A figure whose note carries a hedge — a range, "up
  to", "contents may vary", a marketing badge rather than a panel — is not the same
  claim as a printed number, and the hedge has to survive into any context that
  quotes the figure without the note beside it.
- **Never publish pages faster than they can pass Gate 1.**

## How the gates are enforced

Three checkers run around the build; all three must pass before a deploy.

- `npm run check:data` (prebuild) — images, sources on verified records, and the
  `brandCaffeineGuides` registry against the pages behind it.
- `npm run check:claims` (postbuild) — re-reads `dist/` and cross-checks numeric
  prose, and every `<title>`, against the table rendered on the same page. It also
  holds the compare pages to their sourcing disclosure. Every group declares a
  minimum it expects to inspect: **a checker that parses zero claims must fail.**
  Set that minimum near what the group actually inspects, not to 1 — a floor of 1
  let the compare group fall from 45 claims to 6 and still report a pass.
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
