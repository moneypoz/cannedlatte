import { getCollection, type CollectionEntry } from 'astro:content';

export type Product = CollectionEntry<'products'>;
export type P = Product['data'];

export async function allProducts(): Promise<Product[]> {
  const items = await getCollection('products');
  return items.sort((a, b) => a.data.brand.localeCompare(b.data.brand) || a.data.name.localeCompare(b.data.name));
}

export const lattesOnly = (items: Product[]) => items.filter((p) => p.data.type === 'latte');

export const fullName = (p: P) => `${p.brand} ${p.name}`;

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
};

export const milkLabel: Record<P['milk'], string> = {
  dairy: 'Dairy',
  'lactose-free dairy': 'Lactose-free dairy',
  skim: 'Ultra-filtered skim',
  oat: 'Oat',
  almond: 'Almond',
  none: 'None',
};

export const typeLabel: Record<P['type'], string> = {
  latte: 'Latte',
  black: 'Black cold brew',
  nitro: 'Nitro',
  energy: 'Coffee energy drink',
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

/** Head-to-head pages. Add pairs here; each becomes /compare/a-vs-b. */
export const comparePairs: [string, string][] = [
  ['la-colombe-everyday-draft-latte', 'death-wish-caramel-cold-brew-latte'],
  ['la-colombe-everyday-draft-latte', 'wandering-bear-double-latte'],
  ['la-colombe-triple-draft-latte', 'nobl-cold-brew-oat-milk-latte'],
  ['la-colombe-oatmilk-vanilla-draft-latte', 'pop-and-bottle-vanilla-oat-milk-latte'],
  ['wandering-bear-double-latte', 'nobl-cold-brew-oat-milk-latte'],
  ['la-colombe-everyday-draft-latte', 'starbucks-doubleshot-espresso-salted-caramel-cream'],
  ['death-wish-caramel-cold-brew-latte', 'wandering-bear-vanilla-latte'],
];
