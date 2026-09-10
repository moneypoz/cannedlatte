/**
 * Category news for /new: short dated notes about things that happen to the cans
 * we track — reformulations, limited editions, line splits, discontinuations.
 * The launch table above it only moves when a product has a `launched` date, so
 * this is where everything else in the category gets recorded.
 *
 * Two rules, both about not inventing history:
 *
 * - `date` is the day WE confirmed the thing, not the day a brand did it. We
 *   almost never know when a can was reformulated or a flavor was pulled; we
 *   know when we stood in a shop with the label or checked the brand's site.
 *   Writing an announcement date we didn't see would be a guess wearing a
 *   timestamp, which is the one thing the rest of this database refuses to do.
 * - Every entry has to trace to something already in the repo: a verified
 *   product record, a redirect, or a source cited on a product page. If it
 *   can't, it isn't news yet.
 *
 * Order in this array doesn't matter — the page sorts newest-first at render.
 */
export type NewsItem = {
  /** YYYY-MM-DD, the day we confirmed it. Sorts and renders directly. */
  date: string;
  /** One sentence. The list is scanned, not read. */
  text: string;
  /** Optional pointer to the page that carries the evidence. */
  link?: { href: string; label: string };
  /**
   * Optional thumbnail: a transparent cutout filename in
   * src/assets/products/cards/. Named rather than imported so this module stays
   * free of astro:assets and can be read by plain node. Anything referenced here
   * that is not also some product's photo must be listed in EDITION_IMAGES in
   * scripts/check-data.mjs, or the orphan check will (correctly) reject it.
   */
  image?: string;
};

export const news: NewsItem[] = [
  {
    date: '2026-09-10',
    text: 'Happy’s Tate’s Bake Shop collab can, announced May 2025 and sold only at Walmart, is still on shelves next to the standard Chocolatey Chip Latte.',
    link: { href: '/latte/happy-chocolatey-chip-latte', label: 'Happy Chocolatey Chip Latte' },
    image: 'happy-chocolatey-chip-tates-edition-card.png',
  },
  {
    date: '2026-09-10',
    text: 'La Colombe’s Oatmilk Vanilla Draft Latte can now reads 11 oz, 140 mg of caffeine and 170 calories — figures the brand’s own site had not caught up to.',
    link: { href: '/latte/la-colombe-oatmilk-vanilla-draft-latte', label: 'Oatmilk Vanilla Draft Latte' },
  },
  {
    date: '2026-09-10',
    text: 'Bones Coffee is running two canned lines at once — 255 mg cold brew lattes and 200 mg flavored lattes — which puts a Holy Cannoli and a Cannoli on the same shelf.',
    link: { href: '/compare/bones-cannoli-latte-vs-bones-holy-cannoli-latte', label: 'Cannoli vs Holy Cannoli' },
  },
  {
    date: '2026-09-06',
    text: 'Quokka Brew’s Vanilla Dream Oat Milk Latte is discontinued and has left the database, its old page redirecting to the oat milk list.',
    link: { href: '/best/oat-milk', label: 'Oat milk lattes' },
  },
];

/** Newest first. Ties keep their authored order, so same-day entries stay put. */
export const newsByDate = (items: NewsItem[] = news) =>
  [...items].sort((a, b) => b.date.localeCompare(a.date));
