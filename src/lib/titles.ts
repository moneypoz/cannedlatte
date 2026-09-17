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

/* ---- how a caffeine figure is written down ---------------------------------
 * Three shapes of published figure, declared per record by caffeineBasis:
 *
 *   exact    the source published this number             "230 mg"
 *   range    the source published a span, caffeineMg is    "40–50 mg"
 *            its midpoint
 *   ceiling  the source published a bound, caffeineMg is   "up to 120 mg"
 *            that bound
 *
 * caffeineMg is the same thing in all three cases: the one number the machinery
 * sorts, ranks and subtracts. What changes is how it may be written, and the rule
 * is that a qualified figure is never written bare. A table cell or a <title> is
 * read without the note that qualifies it, so "120 mg" in a results page asserts
 * something the brand did not — Death Wish prints "up to 120 mg" on the can.
 *
 * Everything that renders a product's own caffeine figure goes through
 * caffeineFigure, so there is one place the qualifier could be dropped, and
 * check-claims.mjs watches that place from the rendered HTML. */
export type CaffeineBasis = 'exact' | 'range' | 'ceiling';
type Caffeine = {
  caffeineMg: number | null;
  caffeineBasis?: CaffeineBasis;
  caffeineMinMg: number | null;
  caffeineMaxMg: number | null;
};

export const basisOf = (p: Caffeine): CaffeineBasis => p.caffeineBasis ?? 'exact';

/** A qualified figure may be reported anywhere, and crowned nowhere. */
export const isQualified = (p: Caffeine) => basisOf(p) !== 'exact';

/** The figure without its unit: "230", "40–50", "up to 120". */
export const caffeineValue = (p: Caffeine): string | null => {
  if (p.caffeineMg == null) return null;
  const basis = basisOf(p);
  if (basis === 'range' && p.caffeineMinMg != null && p.caffeineMaxMg != null) {
    return `${p.caffeineMinMg}–${p.caffeineMaxMg}`;
  }
  if (basis === 'ceiling') return `up to ${p.caffeineMg}`;
  return String(p.caffeineMg);
};

/** The figure as it is printed anywhere on the site: "230 mg", "40–50 mg",
 *  "up to 120 mg", or the em dash for a can that publishes nothing. */
export const caffeineFigure = (p: Caffeine): string => {
  const v = caffeineValue(p);
  return v == null ? '—' : `${v} mg`;
};

/** Sentence- or title-initial form: "Up to 120 mg". */
export const caffeineFigureCap = (p: Caffeine): string => {
  const s = caffeineFigure(p);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Kept for the pages that ask "does this record carry a span". */
export const rangeOf = (p: Caffeine) =>
  basisOf(p) === 'range' && p.caffeineMinMg != null && p.caffeineMaxMg != null
    ? { min: p.caffeineMinMg, max: p.caffeineMaxMg }
    : null;

/* ---- /caffeine/<product> ------------------------------------------------- */

/** "La Colombe Triple Draft Latte Caffeine: 230 mg per Can",
 *  "Bones Holy Cannoli Caffeine: 250–260 mg per Can",
 *  "Death Wish Mocha Caffeine: Up to 120 mg per Can". Reporting. */
export const caffeineTitle = (p: Named & Caffeine, _mg: number) => {
  const fixed = ` Caffeine: ${caffeineFigureCap(p)} per Can`;
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
export const productTitle = (p: Named & Spec & Caffeine) => {
  const bits = [
    p.caffeineMg != null ? `${caffeineFigureCap(p)} Caffeine` : null,
    p.sugarG != null ? `${p.sugarG} g Sugar` : null,
  ].filter(Boolean);
  if (!bits.length) return fitName(p, TITLE_BUDGET);
  const fixed = `: ${bits.join(', ')}`;
  return fitAround(p, fixed) + fixed;
};

/* ---- /brands/<brand> ----------------------------------------------------- */

/** A count of our own records — always computable, never unverifiable.
 *
 *  The brand name gets the same budget treatment as a product name. It was the one
 *  template that skipped it, because a brand name is usually short — until "Great
 *  Lakes Coffee Roasting Company" pushed the title to 65 characters. There is no
 *  shortName for a brand, so this clips, and the floor keeps a clipped name
 *  recognisable even when the fixed half is long. */
export const brandTitle = (brand: string, count: number) => {
  const fixed = count === 1 ? ' Canned Latte: Full Specs' : ` Canned Lattes: All ${count} Compared`;
  return clipName(brand, Math.max(NAME_FLOOR, TITLE_BUDGET - fixed.length)) + fixed;
};

/* ---- /compare/<a>-vs-<b> ------------------------------------------------- */

/** "Bones Cannoli vs Bones Holy Cannoli: 200 vs 255 mg". Reporting, so an
 *  unverified figure is allowed — the spec table on these pages marks every
 *  brand-sourced figure, which is what earns the title the right to restate it.
 *  Falls back to "… Compared" when either can publishes no caffeine figure. */
export const compareTitle = (A: Named & Caffeine, B: Named & Caffeine) => {
  // Each side brings its own shape, so a qualified can keeps its qualifier here as
  // everywhere else: "200 vs 250–260 mg", "155 vs up to 120 mg". The alternative —
  // printing the bare midpoint or bound because two numbers share a line — is the
  // one thing caffeineValue exists to prevent.
  const va = caffeineValue(A), vb = caffeineValue(B);
  const fixed = va && vb ? `: ${va} vs ${vb} mg` : ' Compared';
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
export type Crowned<T> =
  | { kind: 'crown'; value: number; holder: T }
  /** Leader is brand-sourced. Gate 1: fall back to a count. */
  | { kind: 'unverified'; holder: T }
  /** Leader publishes a qualified figure — a range or a ceiling — and would
   *  otherwise be crowned. A superlative strips the qualifier off, so there is no
   *  honest automatic answer here: check-claims.mjs stops the build and asks for a
   *  hand decision rather than quietly printing "Up to 255 mg" for a midpoint. */
  | { kind: 'qualified'; holder: T }
  | null;

export const bestHeadline = <T extends { verified: boolean } & Partial<Caffeine>>(
  list: T[],
  field: keyof T,
  lowerWins: boolean,
): Crowned<T> => {
  const withValue = list.filter((p) => p[field] != null);
  if (!withValue.length) return null;
  const holder = withValue.reduce((a, b) => {
    const x = a[field] as number, y = b[field] as number;
    return (lowerWins ? y < x : y > x) ? b : a;
  });
  // The qualifier lives on the caffeine figure, so it only bears on a list crowned
  // on caffeine. A sugar or price crown is unaffected by how caffeine was published.
  const qualified = field === 'caffeineMg' && isQualified(holder as Caffeine);
  if (!holder.verified) return { kind: 'unverified', holder };
  if (qualified) return { kind: 'qualified', holder };
  return { kind: 'crown', value: holder[field] as number, holder };
};
