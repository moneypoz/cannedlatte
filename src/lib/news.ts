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
    date: '2026-10-08',
    text: 'La Colombe has a limited-edition Peppermint Mocha Draft Latte, confirmed with a four-pack in hand and label-verified from the can: 100 mg of caffeine, 13 g of sugar with 9 g of it added, and 6 g of protein in a 9 oz can at 130 calories. It is cold brew on reduced-fat milk, not the 190 mg espresso base their Caramel, Mocha, Vanilla, Pumpkin Spice and S’mores cans share, and La Colombe’s own site had no page for it on the day we checked.',
    link: { href: '/latte/la-colombe-peppermint-mocha-draft-latte', label: 'Peppermint Mocha Draft Latte' },
    image: 'la-colombe-peppermint-mocha-draft-latte-card.png',
  },
  {
    date: '2026-10-04',
    text: 'La Colombe has a Vanilla Matcha Latte on store shelves, confirmed and label-verified from a can in hand: matcha green tea on lactose-free whole milk under the Coffee Workshop name, with no coffee in it. The can prints 65 mg of caffeine, with 16 g of sugar (7 g of it added) and 7 g of protein in an 11 oz can at 160 calories.',
    link: { href: '/latte/la-colombe-vanilla-matcha-latte', label: 'Vanilla Matcha Latte' },
    image: 'la-colombe-vanilla-matcha-latte-card.png',
  },
  {
    date: '2026-10-04',
    text: 'Great Lakes’ Cold Brew Vanilla Latte now has its own record, label-verified from a can in hand: 160 mg of caffeine printed on the front, 15 g of sugar, all of it added, and 1 g of protein in an 11 oz oatmilk can at 150 calories. Great Lakes’ own site sells it only inside their Latte Variety Pack.',
    link: { href: '/latte/great-lakes-coffee-vanilla-latte', label: 'Cold Brew Vanilla Latte' },
    image: 'great-lakes-coffee-vanilla-latte-card.png',
  },
  {
    date: '2026-10-03',
    text: 'Three of the four Throne Sport Coffee cans we track — French Vanilla, Mocha Java and Salted Caramel — are label-verified from cans in hand: 150 mg of caffeine, 22 g of sugar with 21 g of it added and 10 g of protein in an 11 oz can at 140 calories, every figure matching the brand’s own site, on lactose-free ultra-filtered skim milk. The panels are not identical: Mocha Java prints 160 mg of sodium and under 1 g of fiber against 150 mg and 0 g on the other two. La Colombe’s Triple Draft Latte is photographed too, its side band printing 230 mg of caffeine over a panel showing 5 g of added sugar. Throne’s Coffee Latte stays unverified.',
    link: { href: '/brands/throne', label: 'Throne Sport Coffee' },
    image: 'throne-mocha-java-latte-card.png',
  },
  {
    date: '2026-09-29',
    text: 'Stella Blue’s Caffe Mocha Latte is label-verified from a can in hand, so both Stella Blue cans we track are now checked against the label: 190 mg of caffeine, 27 g of sugar with 15 g of it added, 8 g of protein and 2 g of fiber from chicory root in an 11 oz can at 190 calories — every figure matching the brand’s own site. The can itself reads Espresso Caffe Mocha.',
    link: { href: '/latte/stella-blue-caffe-mocha-latte', label: 'Caffe Mocha Latte' },
    image: 'stella-blue-caffe-mocha-latte-card.png',
  },
  {
    date: '2026-09-26',
    text: 'Stella Blue’s Sweet Cream Latte is label-verified from a can in hand: 190 mg of caffeine, 25 g of sugar with 14 g of it added, 7 g of protein and 2 g of fiber from chicory root in an 11 oz can at 170 calories — every figure matching the brand’s own site. The can itself reads Espresso Sweet Cream.',
    link: { href: '/latte/stella-blue-sweet-cream-latte', label: 'Sweet Cream Latte' },
    image: 'stella-blue-sweet-cream-latte-card.png',
  },
  {
    date: '2026-09-23',
    text: 'La Colombe has a limited-edition S’mores Draft Latte on shelves — spotted in store and label-verified from the can in hand: 190 mg of caffeine, 20 g of sugar with 11 g of it added, and 7 g of protein in an 11 oz can at 190 calories. It runs on the same 190 mg espresso base as their Caramel, Mocha, Vanilla and Pumpkin Spice cans.',
    link: { href: '/latte/la-colombe-smores-draft-latte', label: 'S’mores Draft Latte' },
    image: 'la-colombe-smores-draft-latte-card.png',
  },
  {
    date: '2026-09-17',
    text: 'Bones’ Cookies & Cream Latte is label-verified from a can in hand: 200 mg of caffeine, 16 g of sugar with only 5 g of it added, and 7 g of protein — the same panel their Cannoli, French Toast and Sea Salt Caramel Mocha cans carry. It is a different drink from their Cookies N’ Dreams Latte, which is 210 calories and 33 g of sugar on the cold brew line.',
    link: { href: '/latte/bones-cookies-cream-latte', label: 'Cookies & Cream Latte' },
  },
  {
    date: '2026-09-17',
    text: 'New brand in the database: Great Lakes Coffee Roasting Company, a Bloomfield Hills, Michigan roaster whose Cold Brew Mocha Latte prints 180 mg of caffeine on an 11 oz oatmilk can. Their Lavender Latte is in alongside it, unverified from the brand’s own published panel; a third flavour, Vanilla, is named only inside their variety pack and has no page or figures anywhere on their site.',
    link: { href: '/brands/great-lakes-coffee', label: 'Great Lakes Coffee' },
  },
  {
    date: '2026-09-14',
    text: 'Two La Colombe cans we were not tracking are listed on the brand’s own site: an Oatmilk Everyday Draft Latte badged at 120 mg, and a fall-seasonal Salted Caramel Apple Draft Latte badged at 135 mg and already out of stock. Both are 9 oz, both are in the database unverified.',
    link: { href: '/brands/la-colombe', label: 'La Colombe' },
  },
  {
    date: '2026-09-10',
    text: 'King Coffee’s Vietnamese ready-to-drink lattes are on sale in the US, $19.99 for six 8 oz cans direct from the brand.',
    link: { href: '/latte/king-coffee-vanilla-latte', label: 'King Coffee Vanilla Latte' },
  },
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
