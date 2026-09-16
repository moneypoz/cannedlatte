// Page <title> templates. Every number in every title is computed here from the
// product JSONs at build time — none is ever hand-typed, so a title cannot go
// stale against the table underneath it. check-claims.mjs re-derives each one from
// the rendered HTML and fails the build if the two disagree.
//
// Deliberately free of astro:content imports, like names.ts, so it stays readable
// under plain node.
//
// --- the budget ---------------------------------------------------------------
// Base.astro renders "<templated> · Canned Latte", a 15-character suffix. Google
// shows roughly 60, so the templated half is budgeted at 55 and the product name
// is what gives way inside it (fitName: full name, then the compact chart name,
// then clipped). The number never gives way — it is the reason these titles exist.
//
// --- reporting vs crowning ----------------------------------------------------
// Two different uses of a figure, with two different bars (see CLAUDE.md):
//
//   Reporting — stating a product's own figure beside its own name, on a page that
//   discloses where that figure came from. "Bones Cannoli: 200 mg Caffeine",
//   "A vs B: 230 vs 255 mg". Unverified figures are allowed: the page flags the
//   sourcing and the title only restates the page.
//
//   Crowning — a superlative built on one record's figure. "Strongest … Up to
//   255 mg". Gate 1 bars an unverified figure from carrying it, so bestHeadline()
//   below withholds the number and the caller falls back to a count.
import { fitName, fullName, shortName, clipName, type Named } from './names';

/** Characters available to the templated half of a title, before " · Canned Latte". */
export const TITLE_BUDGET = 55;

/** A name clipped below this stops being recognisable in a search result. A title
 *  is allowed to run past the budget rather than mangle its subject that far;
 *  check-claims reports anything that ends up over 60. */
const NAME_FLOOR = 20;

/** Fit a product name into whatever the fixed part of a title leaves behind. */
const fitAround = (p: Named, fixed: string) =>
  fitName(p, Math.max(NAME_FLOOR, TITLE_BUDGET - fixed.length));

/* ---- ranges ---------------------------------------------------------------
 * Some sources publish a range, not a figure: "Brand states 70–80 mg". The record
 * keeps caffeineMg as the midpoint, because rankings, per-ounce maths and
 * comparisons need one number per can. A title is the opposite case — it is read
 * without the note that qualifies it, so "75 mg per Can" in a search result
 * asserts a precision the brand never offered. Where both ends are stored, the
 * title states the range and the midpoint stays out of it. */
type Range = { caffeineMinMg: number | null; caffeineMaxMg: number | null };

export const rangeOf = (p: Range) =>
  p.caffeineMinMg != null && p.caffeineMaxMg != null
    ? { min: p.caffeineMinMg, max: p.caffeineMaxMg }
    : null;

/** An en dash, matching the notes the ranges were read out of. */
const showRange = (r: { min: number; max: number }) => `${r.min}–${r.max}`;

/* ---- /caffeine/<product> ------------------------------------------------- */

/** "Bones Holy Cannoli Caffeine: 250–260 mg per Can", or a lone figure where the
 *  source published one. Reporting. */
export const caffeineTitle = (p: Named & Range, mg: number) => {
  const r = rangeOf(p);
  const fixed = ` Caffeine: ${r ? showRange(r) : mg} mg per Can`;
  return fitAround(p, fixed) + fixed;
};

/** The pre-numbers title. Two ways to reach it, one benign and one not:
 *  a product with no published figure at all (this route does not build those),
 *  and a product whose note describes a range but which never had the structured
 *  fields populated. The second must not persist quietly, so check-data.mjs fails
 *  the build on it — this fallback only keeps a half-populated record from
 *  asserting a midpoint as though it were printed. */
export const caffeineQuestionTitle = (p: Named) => `How much caffeine is in ${fullName(p)}?`;

/** True when the note talks about a range but the fields to render it are absent.
 *  Shared with check-data.mjs's rule so both agree on what counts as a range. */
export const NOTE_STATES_RANGE = /(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*mg/;

/* ---- /latte/<product> ---------------------------------------------------- */

type Spec = { caffeineMg: number | null; sugarG: number | null };

/** "Wandering Bear Double Latte: 140 mg Caffeine, 5 g Sugar". Reporting. Carries
 *  only the figures the record actually publishes, and degrades to the bare name
 *  when it publishes neither. Range-sourced cans state the range here too — the
 *  leak this closes is a title read without its note, and that is just as true of
 *  a product page's title as of a caffeine page's. */
export const productTitle = (p: Named & Spec & Range) => {
  const r = rangeOf(p);
  const bits = [
    r ? `${showRange(r)} mg Caffeine` : p.caffeineMg != null ? `${p.caffeineMg} mg Caffeine` : null,
    p.sugarG != null ? `${p.sugarG} g Sugar` : null,
  ].filter(Boolean);
  if (!bits.length) return fitName(p, TITLE_BUDGET);
  const fixed = `: ${bits.join(', ')}`;
  return fitAround(p, fixed) + fixed;
};

/* ---- /brands/<brand> ----------------------------------------------------- */

/** A count of our own records — always computable, never unverifiable. */
export const brandTitle = (brand: string, count: number) =>
  count === 1
    ? `${brand} Canned Latte: Full Specs`
    : `${brand} Canned Lattes: All ${count} Compared`;

/* ---- /compare/<a>-vs-<b> ------------------------------------------------- */

/** "Bones Cannoli vs Bones Holy Cannoli: 200 vs 255 mg". Reporting, so an
 *  unverified figure is allowed — the spec table on these pages marks every
 *  brand-sourced figure, which is what earns the title the right to restate it.
 *  Falls back to "… Compared" when either can publishes no caffeine figure. */
export const compareTitle = (
  A: Named & { caffeineMg: number | null },
  B: Named & { caffeineMg: number | null },
) => {
  const both = A.caffeineMg != null && B.caffeineMg != null;
  const fixed = both ? `: ${A.caffeineMg} vs ${B.caffeineMg} mg` : ' Compared';
  // Two names share one budget. Each starts on half of what the fixed part leaves,
  // and whichever needs less hands the remainder to the other, so a short name
  // beside a long one does not waste its half.
  const room = Math.max(NAME_FLOOR * 2, TITLE_BUDGET - fixed.length - ' vs '.length);
  const sa = shortName(A), sb = shortName(B);
  let ba = Math.floor(room / 2);
  let bb = room - ba;
  if (sa.length < ba) { bb += ba - sa.length; ba = sa.length; }
  else if (sb.length < bb) { ba += bb - sb.length; bb = sb.length; }
  const MIN = 14;
  return `${clipName(sa, Math.max(MIN, ba))} vs ${clipName(sb, Math.max(MIN, bb))}${fixed}`;
};

/* ---- /table -------------------------------------------------------------- */

export const tableTitle = (count: number) =>
  `Every Canned Latte Compared: ${count} Cans, One Table`;

/* ---- /best/<slug> -------------------------------------------------------- */

/** The record a ranking's headline stat would be crowned from: the one holding the
 *  extreme of `field`. Returns null when nothing publishes the field, and — the
 *  point of this function — when the holder is unverified, which is Gate 1
 *  refusing to let a brand-sourced figure become a superlative.
 *
 *  Withholding the figure rather than reaching past it to the best *verified*
 *  value also keeps Gate 3: a title reading "Up to 230 mg" above a table whose top
 *  row shows 255 mg would contradict the page it sits on. The caller falls back to
 *  a count instead, and the sharper form switches itself on the day that record is
 *  checked against a label. */
export const bestHeadline = <T extends { verified: boolean }>(
  list: T[],
  field: keyof T,
  lowerWins: boolean,
): { value: number; holder: T } | null => {
  const withValue = list.filter((p) => p[field] != null);
  if (!withValue.length) return null;
  const holder = withValue.reduce((a, b) => {
    const x = a[field] as number, y = b[field] as number;
    return (lowerWins ? y < x : y > x) ? b : a;
  });
  return holder.verified ? { value: holder[field] as number, holder } : null;
};
