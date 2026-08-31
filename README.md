# cannedlatte.com

Every latte in a can, compared. A data-first Astro site: one JSON file per product drives the home table, product pages, brand hubs, "best for" rankings, head-to-head comparisons, and caffeine one-question pages.

## Stack

- Astro 5 (static output), content collections with a zod schema
- Cloudflare Pages for hosting ($0)
- No CMS, no database server. Products live in `src/content/products/*.json`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs to dist/
```

## Deploy to Cloudflare Pages (first time, ~10 minutes)

1. Push this repo to GitHub (`moneypoz/cannedlatte`).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: framework preset **Astro**, build command `npm run build`, output directory `dist`. Node version: add an environment variable `NODE_VERSION` = `22`.
4. Deploy. You'll get `cannedlatte.pages.dev`.
5. Custom domains → add `cannedlatte.com` and `www.cannedlatte.com`. Because the domain is on Cloudflare Registrar, DNS records are created for you automatically.
6. Redirect www → apex: Rules → Redirect Rules → create rule "www to apex": if hostname equals `www.cannedlatte.com`, dynamic redirect to `concat("https://cannedlatte.com", http.request.uri.path)`, status 301.
7. If you register `cannedlattes.com` (plural): add it to Cloudflare, then Bulk Redirects → source `https://cannedlattes.com/*` → target `https://cannedlatte.com/$1`, 301, preserve path.

Every push to `main` redeploys automatically.

## Analytics and Search Console

- Create a GA4 property, copy the `G-XXXXXXX` ID, and set it as the environment variable `PUBLIC_GA4_ID` in Cloudflare Pages (Settings → Environment variables). Journey by Mediavine requires GA4.
- Google Search Console: add `cannedlatte.com` as a Domain property (verify via the DNS TXT record Cloudflare lets you add in one click). Submit `https://cannedlatte.com/sitemap-index.xml`.

## Adding a product

Create `src/content/products/<brand>-<product>.json`. The filename becomes the URL: `/latte/<filename>`.

```json
{
  "brand": "RISE Brewing Co.",
  "brandSlug": "rise-brewing",
  "name": "Oat Milk Latte",
  "type": "latte",
  "flavor": "Original",
  "sizeOz": 7,
  "caffeineMg": 180,
  "sugarG": 7,
  "addedSugar": true,
  "proteinG": 2,
  "calories": 90,
  "milk": "oat",
  "dairyFree": true,
  "refrigerated": false,
  "pricePerCan": 2.99,
  "retailers": ["Target", "Amazon"],
  "buyLinks": [
    { "label": "RISE Brewing", "url": "https://www.risebrewingco.com/", "affiliate": true }
  ],
  "image": "/images/products/rise-brewing-oat-milk-latte.jpg",
  "summary": "One or two sentences. Written by you, not pasted from the brand.",
  "tastingNotes": "Optional. Your own words after you drink it.",
  "launched": "2024-03",
  "verified": true,
  "updated": "2026-09-05",
  "sources": ["https://www.risebrewingco.com/products/oat-milk-latte"]
}
```

Rules that keep the data honest:

- Use `null` for any number you haven't confirmed. Pages show "—" and rankings push nulls to the bottom. Never guess.
- Flip `verified` to `true` only after you've checked the specs against a physical label. Until then the product shows an "unverified" pill.
- Bump `updated` every time you touch a spec. It's shown on the page and matters for trust and for Google.
- `type` is `latte` (default), `black`, `nitro`, or `energy`. Black cold brews live in the same database and show up when a visitor switches the Type filter; they're excluded from latte-only rankings automatically.
- `affiliate: true` on a buy link adds `rel="sponsored nofollow"`. Set it once the program approves you and you've swapped in the tracking URL.

Photos go in `public/images/products/` as `<slug>.jpg`, ~1200px wide, same background and angle for every can.

## Adding rankings and comparisons

- **"Best for" pages** are defined in `src/lib/products.ts` → `bestPages`. Each has a filter, a sort, and the metric column to show. Add an entry and it becomes `/best/<slug>` on the next build.
- **Head-to-head pages** are pairs of product IDs in `comparePairs`. Add a pair and it becomes `/compare/<a>-vs-<b>`.
- **Caffeine pages** (`/caffeine/<slug>`) build automatically for every product with a `caffeineMg` value.

## Before you turn on money

- Apply: Impact (Death Wish, Instacart, Thrive Market), Pop & Bottle form, Chamberlain program. Swap `buyLinks[].url` to tracking links and set `affiliate: true`.
- `/shop`: replace the Etsy link with your shop section URL.
- `/new`: replace the placeholder form with your newsletter provider's embed.
- Journey by Mediavine: apply once GA4 shows 1,000 sessions in 30 days.

## Structure

```
src/
  content.config.ts       product schema (zod)
  content/products/*.json one file per product
  lib/products.ts         helpers, "best for" definitions, compare pairs
  layouts/Base.astro      head, nav, footer, global CSS, GA4
  components/             ProductTable (sortable), BuyLinks, Disclosure
  pages/
    index.astro           home table with filters
    latte/[slug].astro    product page (Product + FAQ schema)
    brands/               brand index and hubs
    best/[slug].astro     rankings
    compare/[pair].astro  head-to-head
    caffeine/[slug].astro "how much caffeine in X"
    new.astro             launch tracker + newsletter
    shop.astro, about.astro, disclosure.astro, 404.astro
```
