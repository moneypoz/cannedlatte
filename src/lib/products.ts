import { getCollection, type CollectionEntry } from 'astro:content';

// Re-exported so pages keep importing every helper from one place.
export { fullName, shortName, dedupeWords } from './names';

export type Product = CollectionEntry<'products'>;
export type P = Product['data'];

export async function allProducts(): Promise<Product[]> {
  const items = await getCollection('products');
  return items.sort((a, b) => a.data.brand.localeCompare(b.data.brand) || a.data.name.localeCompare(b.data.name));
}

export const lattesOnly = (items: Product[]) => items.filter((p) => p.data.type === 'latte');

export const fmt = {
  mg: (v: number | null) => (v == null ? '—' : `${v} mg`),
  g: (v: number | null) => (v == null ? '—' : `${v} g`),
  oz: (v: number | null) => (v == null ? '—' : `${v} oz`),
  cal: (v: number | null) => (v == null ? '—' : `${v}`),
  usd: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`),
  // "2026-08" -> "8/2026"
  ym: (v: string | null | undefined) => {
    if (!v) return '—';
    const [y, m] = v.split('-');
    return m ? `${Number(m)}/${y}` : v;
  },
  // "2026-09-04" -> "09-04-2026". Stored dates stay ISO so they still sort.
  mdy: (v: string | null | undefined) => {
    if (!v) return '—';
    const [y, m, d] = v.split('-');
    return m && d ? `${m}-${d}-${y}` : v;
  },
};

export const milkLabel: Record<P['milk'], string> = {
  dairy: 'Dairy',
  'lactose-free dairy': 'Lactose-free dairy',
  skim: 'Ultra-filtered skim',
  oat: 'Oat',
  almond: 'Almond',
  coconut: 'Coconut',
  plant: 'Plant-based (base not stated)',
  none: 'None',
};

export const typeLabel: Record<P['type'], string> = {
  latte: 'Latte',
  black: 'Black cold brew',
  nitro: 'Nitro',
  energy: 'Coffee energy drink',
  'milk-coffee': 'Milk coffee',
};

/** "Best for" pages. Each one sorts/filters the database; adding a product updates all of them. */
export const bestPages = [
  {
    slug: 'least-sugar',
    short: 'Least sugar',
    title: 'Canned lattes with the least sugar',
    intro: 'Sorted by grams of sugar per can, lowest first. Products without a verified sugar figure are listed at the end.',
    filter: (p: P) => p.type === 'latte',
    sort: (a: P, b: P) => (a.sugarG ?? 999) - (b.sugarG ?? 999),
    metric: (p: P) => fmt.g(p.sugarG),
    metricLabel: 'Sugar',
  },
  {
    slug: 'most-caffeine',
    short: 'Most caffeine',
    title: 'Canned lattes with the most caffeine',
    intro: 'Sorted by milligrams of caffeine per can, highest first. For reference, a 12 oz drip coffee is roughly 140–200 mg.',
    filter: (p: P) => p.type === 'latte',
    sort: (a: P, b: P) => (b.caffeineMg ?? -1) - (a.caffeineMg ?? -1),
    metric: (p: P) => fmt.mg(p.caffeineMg),
    metricLabel: 'Caffeine',
  },
  {
    slug: 'oat-milk',
    short: 'Oat milk',
    title: 'Oat milk canned lattes',
    intro: 'Every dairy-free latte in a can made with oat milk, sorted by caffeine.',
    filter: (p: P) => p.milk === 'oat',
    sort: (a: P, b: P) => (b.caffeineMg ?? -1) - (a.caffeineMg ?? -1),
    metric: (p: P) => fmt.mg(p.caffeineMg),
    metricLabel: 'Caffeine',
  },
  {
    slug: 'high-protein',
    short: 'Most protein',
    title: 'High-protein canned lattes',
    intro: 'Sorted by grams of protein per can. Anything over 10 g is doing double duty as a snack.',
    filter: (p: P) => p.type === 'latte' && (p.proteinG ?? 0) > 0,
    sort: (a: P, b: P) => (b.proteinG ?? -1) - (a.proteinG ?? -1),
    metric: (p: P) => fmt.g(p.proteinG),
    metricLabel: 'Protein',
  },
  {
    slug: 'cheapest-per-can',
    short: 'Cheapest',
    title: 'Cheapest canned lattes per can',
    intro: 'Price per can at the brand\'s own site or the most common retailer, lowest first. Grocery prices vary; treat these as a ranking, not a quote.',
    filter: (p: P) => p.type === 'latte' && p.pricePerCan != null,
    sort: (a: P, b: P) => (a.pricePerCan ?? 999) - (b.pricePerCan ?? 999),
    metric: (p: P) => fmt.usd(p.pricePerCan),
    metricLabel: 'Per can',
  },
  {
    slug: 'no-added-sugar',
    short: 'No added sugar',
    title: 'Canned lattes with no added sugar',
    intro: 'Lattes sweetened only by the milk itself or by whole ingredients like dates. Sorted by caffeine.',
    filter: (p: P) => p.addedSugar === false,
    sort: (a: P, b: P) => (b.caffeineMg ?? -1) - (a.caffeineMg ?? -1),
    metric: (p: P) => fmt.g(p.sugarG),
    metricLabel: 'Sugar',
  },
  {
    slug: 'dairy-free',
    short: 'Dairy-free',
    title: 'Dairy-free canned lattes',
    intro: 'Oat and almond milk lattes, sorted by caffeine.',
    filter: (p: P) => p.dairyFree,
    sort: (a: P, b: P) => (b.caffeineMg ?? -1) - (a.caffeineMg ?? -1),
    metric: (p: P) => milkLabel[p.milk],
    metricLabel: 'Milk',
  },
];

/** Every comparison featuring a given product, with the id of the other can. */
export const comparisonsFor = (id: string) =>
  comparePairs
    .filter(([a, b]) => a === id || b === id)
    .map(([a, b]) => ({ slug: `${a}-vs-${b}`, otherId: a === id ? b : a }));

/** Head-to-head pages. Add pairs here; each becomes /compare/a-vs-b. */
export const comparePairs: [string, string][] = [
  ['la-colombe-everyday-draft-latte', 'death-wish-caramel-cold-brew-latte'],
  ['la-colombe-everyday-draft-latte', 'wandering-bear-double-latte'],
  ['la-colombe-triple-draft-latte', 'nobl-cold-brew-oat-milk-latte'],
  ['la-colombe-oatmilk-vanilla-draft-latte', 'pop-and-bottle-vanilla-oat-milk-latte'],
  ['wandering-bear-double-latte', 'nobl-cold-brew-oat-milk-latte'],
  ['la-colombe-everyday-draft-latte', 'starbucks-doubleshot-espresso-salted-caramel-cream'],
  ['death-wish-caramel-cold-brew-latte', 'wandering-bear-vanilla-latte'],
  // Category leaders, where the ranking pages send people looking for a decision.
  ['bones-holy-cannoli-latte', 'la-colombe-triple-draft-latte'],
  ['projo-power-coffee-vanilla-latte', 'slate-caramel-latte'],
  ['slate-caramel-latte', 'wandering-bear-double-latte'],
  // Same shelf, different answer.
  ['projo-power-coffee-vanilla-latte', 'throne-coffee-latte'],
  ['rise-brewing-oat-milk-latte', 'nobl-cold-brew-oat-milk-latte'],
  ['rise-brewing-oat-milk-latte', 'la-colombe-oatmilk-vanilla-draft-latte'],
  ['la-colombe-vanilla-draft-latte', 'rise-brewing-vanilla-oat-milk-latte'],
  // Brand-name searches, and the widest sugar gap in the database.
  ['starbucks-doubleshot-espresso-salted-caramel-cream', 'illy-cold-brew-latte-macchiato'],
  ['death-wish-original-latte', 'bones-holy-cannoli-latte'],
  ['slate-vanilla-latte', 'happy-vanilla-latte'],
  // Same shelf, same flavour name, two different cans: the 200 mg flavored latte
  // against the 255 mg cold brew latte. The pair exists to answer the mix-up.
  ['bones-cannoli-latte', 'bones-holy-cannoli-latte'],
];

/* ---- head-to-head differences -------------------------------------------
 * Shared by /compare (the matchup cards' "biggest gap" line) and
 * /compare/[pair] (the opener). Both must name the same winning metric for a
 * pair, so the ranking lives here rather than in either page.
 */
export type Metric = 'caffeineMg' | 'sugarG' | 'proteinG' | 'pricePerCan';

export const METRICS = [
  { key: 'caffeineMg', label: 'caffeine', lowerWins: false, delta: (v: number) => `${v} mg` },
  { key: 'sugarG', label: 'sugar', lowerWins: true, delta: (v: number) => `${v} g` },
  { key: 'proteinG', label: 'protein', lowerWins: false, delta: (v: number) => `${v} g` },
  { key: 'pricePerCan', label: 'price', lowerWins: true, delta: (v: number) => fmt.usd(v) },
] as const satisfies readonly { key: Metric; label: string; lowerWins: boolean; delta: (v: number) => string }[];

export type Spread = Record<Metric, number>;

/** How much each metric varies across the whole database. Scoring a pair's gaps
 *  against the pair alone would make sugar lead almost every page, since sugar
 *  has by far the largest raw range. */
export const metricSpread = (items: Product[]): Spread =>
  Object.fromEntries(
    METRICS.map(({ key }) => {
      const v = items.map((p) => p.data[key]).filter((x): x is number => x != null);
      return [key, (v.length ? Math.max(...v) - Math.min(...v) : 0) || 1];
    }),
  ) as Spread;

export type Diff = { key: Metric; label: string; delta: number; display: string; aWins: boolean; rel: number };

/** Every metric where both cans publish a figure and the figures differ, widest
 *  gap first. Metrics either side leaves null are absent, not ranked last — so
 *  the first entry is always safe to print, and an empty array means the pair
 *  has no comparable numbers at all. */
export const rankedDiffs = (A: P, B: P, spread: Spread): Diff[] =>
  METRICS.flatMap(({ key, label, lowerWins, delta: show }) => {
    const x = A[key], y = B[key];
    if (x == null || y == null || x === y) return [];
    const delta = Math.abs(x - y);
    return [{ key, label, delta, display: show(delta), aWins: lowerWins ? x < y : x > y, rel: delta / spread[key] }];
  }).sort((m, n) => n.rel - m.rel);
