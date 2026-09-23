// Cross-checks the numeric claims in generated prose against the tables rendered
// on the same page. Runs as `postbuild`, over dist/.
//
// The cardinal rule here: a verifier that parses zero claims MUST fail. An earlier
// ad-hoc version of this check silently matched nothing (its selectors predated
// Astro's data-astro-cid attributes) and reported "0 mismatches", which read as a
// pass. Every group below therefore declares a minimum it expects to inspect.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const failures = [];
let totalClaims = 0;

const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const num = (s) => parseFloat(String(s).replace('$', ''));

/** Read a two-column spec row, tolerating Astro's data-astro-cid attributes.
 *  The cells carry inline markup now — an unverified figure trails a <sup> marker —
 *  so each value is captured non-greedily and stripped, rather than matched as a run
 *  of non-'<' characters. That earlier [^<]* silently cut this group from 45 claims
 *  to 6 the moment the marker was added, which is why the minimum for this group is
 *  now the real expected count instead of 1. */
const rowVal = (html, label) => {
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((x) => text(x[1]));
    if (c.length === 3 && c[0] === label) return [c[1], c[2]];
  }
  return null;
};

/* ======================================================================
 * Shared source of truth for the two groups below.
 *
 * Both re-derive what a page *should* say from the product JSONs and from
 * src/lib/products.ts, never from the rendered page alone. A check that read only
 * dist/ would pass the moment a template stopped emitting the thing being checked,
 * which is the failure mode this whole file exists to prevent.
 * ==================================================================== */
const SRC = existsSync('src/lib/products.ts') ? readFileSync('src/lib/products.ts', 'utf8') : '';

const PRODUCTS = existsSync('src/content/products')
  ? Object.fromEntries(
      readdirSync('src/content/products')
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(`src/content/products/${f}`, 'utf8'))]),
    )
  : {};

const COMPARE_PAIRS = [
  ...((SRC.match(/comparePairs[^=]*=\s*\[([\s\S]*?)\n\];/) || [])[1] ?? '').matchAll(/\['([^']+)',\s*'([^']+)'\]/g),
].map((m) => [m[1], m[2]]);

/** Each ranking's headline config, or null where the list crowns no single figure
 *  (dairy-free, oat milk). Read from source because whether a /best title is
 *  allowed to carry a superlative is a decision made there, and the rendered page
 *  does not reveal it. */
const BEST_CONFIG = (() => {
  const arr = (SRC.match(/export const bestPages: BestPage\[\] = \[([\s\S]*?)\n\];/) || [])[1] ?? '';
  const out = {};
  for (const m of arr.matchAll(/slug:\s*'([^']+)',([\s\S]*?)metricLabel:/g)) {
    const h = m[2].match(/headline:\s*\{\s*field:\s*'(\w+)',\s*lowerWins:\s*(true|false)/);
    out[m[1]] = h ? { field: h[1], lowerWins: h[2] === 'true' } : null;
  }
  return out;
})();

/* ---- how a caffeine figure must be written --------------------------------
 * A deliberate second implementation of caffeineFigure() from src/lib/titles.ts,
 * derived from the product JSONs rather than imported. If the site's own helper
 * were reused, a bug inside it would render wrong and verify wrong at once. The
 * rule it enforces: a qualified figure — a range midpoint or a published ceiling —
 * is never printed bare, anywhere on the site. "120 mg" where the label says
 * "up to 120 mg" is a claim the brand never made. */
const basisOf = (d) => d.caffeineBasis ?? 'exact';
const isQualified = (d) => basisOf(d) !== 'exact';

/** "230" | "40–50" | "up to 120" | null */
const valueFor = (id) => {
  const d = PRODUCTS[id];
  if (!d || d.caffeineMg == null) return null;
  const b = basisOf(d);
  if (b === 'range') {
    if (d.caffeineMinMg == null || d.caffeineMaxMg == null) return null;
    return `${d.caffeineMinMg}–${d.caffeineMaxMg}`;
  }
  if (b === 'ceiling') return `up to ${d.caffeineMg}`;
  return String(d.caffeineMg);
};
/** "230 mg" | "40–50 mg" | "up to 120 mg" | "—" */
const figureFor = (id) => {
  const v = valueFor(id);
  return v == null ? '—' : `${v} mg`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Every id whose figure carries a qualifier, for the "never bare" sweep. */
const QUALIFIED = Object.keys(PRODUCTS).filter((id) => PRODUCTS[id].caffeineMg != null && isQualified(PRODUCTS[id]));

// ---- compare pages: every delta in the opener must match its own spec table ----
const COMPARE_TESTS = [
  [/(\d+) mg more/g, 'Caffeine'],
  [/(\d+) g less sugar|has (\d+) g less\b/g, 'Sugar'],
  [/(\d+) g more protein|has (\d+) g more\b/g, 'Protein'],
  [/\$([0-9.]+) less per can/g, 'Price per can'],
];
let compareClaims = 0, comparePages = 0;
if (existsSync('dist/compare')) {
  for (const f of readdirSync('dist/compare')) {
    const h = readFileSync('dist/compare/' + f, 'utf8');
    const lede = text((h.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
    if (!lede) continue;
    comparePages++;
    // The opener's deltas are arithmetic on caffeineMg, which for a qualified can is
    // its midpoint or ceiling — while the Caffeine cell beside it now prints the
    // published shape ("250–260 mg"). So the caffeine delta is checked against the
    // records, not the cell; every other row still reads straight off the table.
    const pair = COMPARE_PAIRS.find(([a, b]) => `${a}-vs-${b}.html` === f);
    for (const [re, label] of COMPARE_TESTS) {
      const r = rowVal(h, label);
      if (!r) continue;
      const qualified = label === 'Caffeine' && pair && pair.some((id) => PRODUCTS[id] && isQualified(PRODUCTS[id]));
      const x = qualified ? PRODUCTS[pair[0]].caffeineMg : num(r[0]);
      const y = qualified ? PRODUCTS[pair[1]].caffeineMg : num(r[1]);
      if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) continue;
      for (const m of lede.matchAll(re)) {
        const claimed = parseFloat(m[1] || m[2]);
        compareClaims++;
        if (Math.abs(Math.abs(x - y) - claimed) > 0.011) {
          failures.push(`${f}: opener claims ${claimed} for ${label}, table shows ${x} / ${y}`);
        }
      }
    }
  }
}

// Brand-level guides live in the same directory as the per-product pages but are
// shaped nothing like them, so they are split out by this marker and checked below.
const GUIDE_MARK = 'data-claims="brand-caffeine"';

// Which guides are supposed to exist, read out of src/lib/products.ts the same way
// check-data.mjs reads it. Discovering them from dist/ alone would mean a page that
// stopped emitting GUIDE_MARK — a renamed attribute, a table moved into a component
// — quietly dropped out of this check and reported a pass, which is the exact
// failure this file exists to prevent.
const EXPECTED_GUIDES = existsSync('src/lib/products.ts')
  ? [
      ...(
        (readFileSync('src/lib/products.ts', 'utf8').match(/brandCaffeineGuides[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] ?? ''
      ).matchAll(/slug:\s*'([^']+)'/g),
    ].map((m) => m[1])
  : [];

// ---- caffeine pages: the headline mg must match the stat card on the page ----
let caffeineClaims = 0, caffeinePages = 0;
const guideFiles = [];
if (existsSync('dist/caffeine')) {
  for (const f of readdirSync('dist/caffeine')) {
    const h = readFileSync('dist/caffeine/' + f, 'utf8');
    if (h.includes(GUIDE_MARK)) { guideFiles.push('dist/caffeine/' + f); continue; }
    const body = text(h.slice(h.indexOf('<main'), h.indexOf('</main>')));
    caffeinePages++;
    // The direct answer, first sentence, in whichever shape the source published:
    // "has about 230 mg", "has 40–50 mg", "has up to 120 mg". It must match the
    // headline stat card beside it. The alternation has to cover all three — when
    // the ceiling form was added and this pattern did not, three pages silently
    // stopped being counted here and the group still reported a pass.
    const claim = body.match(/has (?:about )?((?:up to )?\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg of caffeine/);
    const stat = h.match(/<div class="n"[^>]*>((?:up to )?\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg<\/div>/);
    if (claim && stat) {
      caffeineClaims++;
      if (claim[1] !== stat[1]) {
        failures.push(`${f}: answer says ${claim[1]} mg, stat card shows ${stat[1]} mg`);
      }
    }
  }
}

// ---- brand caffeine guides: the opening range, the per-ounce column and every
// FAQ answer must agree with the table on the same page ----
//
// These pages contain no hand-typed numbers at all — everything is computed from
// the product JSONs — so the way they go wrong is a template bug rather than a
// typo: a sort that stops matching the prose around it, a rounding change in the
// per-ounce column, an FAQ pointed at the wrong product id. Each of those shows up
// as prose disagreeing with the table beside it, which is what this compares.
const cells = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => text(m[1]));
let guideClaims = 0, guidePages = 0;

for (const path of guideFiles) {
  const h = readFileSync(path, 'utf8');
  const f = path.split('/').pop();
  guidePages++;

  const table = h.match(new RegExp(`<table[^>]*${GUIDE_MARK}[^>]*>([\\s\\S]*?)<\\/table>`));
  if (!table) { failures.push(`${f}: marked a brand caffeine guide but has no ${GUIDE_MARK} table`); continue; }
  const tbody = (table[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => cells(m[1]))
    .filter((c) => c.length >= 4)
    // The flavor cell carries an "unverified" pill for rows still sourced from the
    // brand rather than a label; the pill is not part of the product's name.
    .map(([name, mg, size, perOz]) => ({
      name: name.replace(/\s*unverified$/, '').trim(),
      mg: num(mg), size: num(size), perOz: num(perOz),
    }))
    .filter((r) => !Number.isNaN(r.mg));
  if (!rows.length) { failures.push(`${f}: parsed 0 rows out of the ${GUIDE_MARK} table`); continue; }

  // (a) the per-ounce column is arithmetic on the other two, so recompute it
  for (const r of rows) {
    if (Number.isNaN(r.size) || Number.isNaN(r.perOz)) continue;
    guideClaims++;
    const want = Math.round((r.mg / r.size) * 10) / 10;
    if (Math.abs(want - r.perOz) > 0.051) {
      failures.push(`${f}: ${r.name} shows ${r.perOz} mg/oz, but ${r.mg} mg over ${r.size} oz is ${want}`);
    }
  }

  // (b) the direct answer names the mildest and the strongest can, with figures
  const lede = text((h.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
  const range = lede.match(/range from (\d+) mg \(([^)]+)\) to (\d+) mg \(([^)]+)\)/);
  if (!range) {
    failures.push(`${f}: the opening answer states no "from N mg (can) to N mg (can)" range`);
  } else {
    const lo = rows.reduce((a, b) => (b.mg < a.mg ? b : a));
    const hi = rows.reduce((a, b) => (b.mg > a.mg ? b : a));
    for (const [claimMg, claimName, row, which] of [
      [parseFloat(range[1]), range[2], lo, 'low'],
      [parseFloat(range[3]), range[4], hi, 'high'],
    ]) {
      guideClaims++;
      if (claimMg !== row.mg || claimName !== row.name) {
        failures.push(`${f}: opener's ${which} end says ${claimMg} mg (${claimName}), the table's is ${row.mg} mg (${row.name})`);
      }
    }
  }

  // (c) every FAQ answer's leading figure, its can size and its per-ounce value
  const faqs = [...h.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => ({ q: text(m[1]), a: text(m[2]) }));
  if (!faqs.length) failures.push(`${f}: no FAQ question/answer pairs found`);
  // Longest name first, so "Oatmilk Vanilla Draft Latte" is never resolved to the
  // "Vanilla Draft Latte" whose name it contains.
  const longestFirst = [...rows].sort((a, b) => b.name.length - a.name.length);
  // Every can named in a string, matched longest-first and blanked out as it goes
  // so a longer name cannot be double-counted as the shorter one inside it.
  // Returned in the order they appear: the first is the one the answer must open on.
  const named = (s) => {
    let hay = s;
    const hits = [];
    for (const r of longestFirst) {
      const at = hay.indexOf(r.name);
      if (at === -1) continue;
      hits.push({ r, at });
      hay = hay.split(r.name).join(' '.repeat(r.name.length));
    }
    return hits.sort((x, y) => x.at - y.at).map((h) => h.r);
  };

  // The lookbehind stops "17.2 mg per ounce" reading as "2 mg"; the lookahead keeps
  // per-ounce figures out of the per-can set.
  const PER_CAN_MG = /(?<![\d.])(\d+(?:\.\d+)?) mg(?! per ounce)/g;
  const PER_OZ_MG = /(?<![\d.])(\d+(?:\.\d+)?) mg per ounce/g;
  const CAN_SIZE = /per (\d+(?:\.\d+)?) oz can/g;

  for (const { q, a } of faqs) {
    const inQ = named(q);
    const inA = named(a);
    const involved = [...new Set([...inQ, ...inA])];
    if (!involved.length) { failures.push(`${f}: FAQ "${q}" names no can that is in the table`); continue; }

    const perCan = [...a.matchAll(PER_CAN_MG)].map((m) => parseFloat(m[1]));
    if (!perCan.length) { failures.push(`${f}: FAQ "${q}" is answered without a milligram figure`); continue; }

    // (i) the answer opens on the figure for the can the question asked about.
    // This is the "first sentence is the number" rule, enforced rather than trusted.
    const primary = inQ[0] ?? inA[0];
    guideClaims++;
    if (perCan[0] !== primary.mg) {
      failures.push(`${f}: FAQ "${q}" opens on ${perCan[0]} mg, table says ${primary.mg} mg for ${primary.name}`);
    }

    // (ii) every can the answer names has its own figure stated somewhere in it.
    // An answer covering two SKUs has to carry both numbers, not just the first.
    for (const r of involved) {
      guideClaims++;
      if (!perCan.includes(r.mg)) {
        failures.push(`${f}: FAQ "${q}" names ${r.name} but never states its ${r.mg} mg`);
      }
    }

    // (iii) each can size and per-ounce figure belongs to one of the cans named.
    const sizes = involved.map((r) => r.size).filter((v) => !Number.isNaN(v));
    for (const m of a.matchAll(CAN_SIZE)) {
      guideClaims++;
      if (!sizes.includes(parseFloat(m[1]))) {
        failures.push(`${f}: FAQ "${q}" says a ${m[1]} oz can, matching none of ${involved.map((r) => `${r.name} at ${r.size} oz`).join('; ')}`);
      }
    }
    const ozs = involved.map((r) => r.perOz).filter((v) => !Number.isNaN(v));
    for (const m of a.matchAll(PER_OZ_MG)) {
      guideClaims++;
      const v = parseFloat(m[1]);
      if (!ozs.some((x) => Math.abs(x - v) <= 0.051)) {
        failures.push(`${f}: FAQ "${q}" says ${m[1]} mg per ounce, matching none of ${involved.map((r) => `${r.name} at ${r.perOz}`).join('; ')}`);
      }
    }
  }
}

// Every declared guide must have built, and must still be carrying the marker that
// puts it through the block above.
for (const slug of EXPECTED_GUIDES) {
  const path = `dist/caffeine/${slug}.html`;
  if (!existsSync(path)) {
    failures.push(`brand caffeine guide "${slug}" did not build — ${path} is missing`);
  } else if (!guideFiles.includes(path)) {
    failures.push(`${path} built without ${GUIDE_MARK}, so none of its numbers were checked`);
  }
}

const rawCells = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[1]);
const bodyRows = (h) => {
  const tb = h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  return tb ? [...tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]) : [];
};

/* ---- compare pages: sourcing disclosure -------------------------------------
 * A /compare title is allowed to restate a can's figure ("230 vs 255 mg") only
 * because the table below discloses where each figure came from. That makes the
 * marker load-bearing rather than decorative: if it stops rendering, the titles
 * above it silently become undisclosed claims. So every figure belonging to a
 * verified:false record must carry the marker — and, the other direction, no
 * figure from a label-checked record may wear it. */
const MARK = 'class="unv"';
let discloseClaims = 0, disclosePages = 0;
for (const [a, b] of COMPARE_PAIRS) {
  const A = PRODUCTS[a], B = PRODUCTS[b];
  if (!A || !B) continue;
  const path = `dist/compare/${a}-vs-${b}.html`;
  if (!existsSync(path)) { failures.push(`compare page ${a}-vs-${b} did not build — ${path} is missing`); continue; }
  const h = readFileSync(path, 'utf8');
  disclosePages++;
  const rows = bodyRows(h);
  if (!rows.length) { failures.push(`${a}-vs-${b}: parsed 0 spec rows, so no figure was checked for disclosure`); continue; }

  let expected = 0;
  for (const row of rows) {
    const c = rawCells(row);
    if (c.length < 3) continue;
    const label = text(c[0]);
    for (const [i, rec, who] of [[1, A, a], [2, B, b]]) {
      const val = text(c[i]);
      const marked = c[i].includes(MARK);
      // "Oat", "Yes" and "Shelf-stable" are specs but not figures; "—" is unpublished.
      if (!/\d/.test(val)) {
        if (marked) failures.push(`${a}-vs-${b}: "${label}" marks ${who}'s non-figure cell "${val}"`);
        continue;
      }
      discloseClaims++;
      if (!rec.verified) {
        expected++;
        if (!marked) failures.push(`${a}-vs-${b}: "${label}" shows ${who}'s ${val} from an unverified record with no sourcing marker`);
      } else if (marked) {
        failures.push(`${a}-vs-${b}: "${label}" marks ${who}'s ${val} as brand-published, but that record is label-verified`);
      }
    }
  }

  const note = /class="tablenote"/.test(h);
  discloseClaims++;
  if (expected > 0 && !note) failures.push(`${a}-vs-${b}: ${expected} marked figure(s) but no footnote saying what the marker means`);
  if (expected === 0 && note) failures.push(`${a}-vs-${b}: carries the marker footnote but marks nothing`);
}

/* ---- titles: every number in a <title> must match that page's own data -------
 * Titles are the one piece of copy nobody re-reads after shipping, and they render
 * into <head> where looking at the page will never reveal a stale one. Every figure
 * in them is computed at build time from the same records the table renders, so
 * this re-derives each and fails when the two drift apart. */
const SUFFIX = ' · Canned Latte';
const titleOf = (h) => {
  const raw = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (raw == null) return null;
  const t = text(raw);
  return t.endsWith(SUFFIX) ? t.slice(0, -SUFFIX.length) : t;
};
/** The stat cards on a product page, as displayed value + label. */
const statCards = (h) =>
  [...h.matchAll(/<div class="stat-card"[^>]*>\s*<div class="n"[^>]*>([\s\S]*?)<\/div>\s*<div class="l"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => ({ v: text(m[1]), l: text(m[2]) }));

let titleClaims = 0;
const titlePages = { caffeine: 0, latte: 0, brands: 0, best: 0, compare: 0, table: 0 };

// (a) /caffeine/<product> — "<name> Caffeine: N mg per Can", or the published
// range where the record carries one. RANGES[id] holds both ends; a record that
// has them may not be titled with its midpoint alone, which is the whole point of
// storing them.
for (const f of existsSync('dist/caffeine') ? readdirSync('dist/caffeine') : []) {
  const h = readFileSync('dist/caffeine/' + f, 'utf8');
  if (h.includes(GUIDE_MARK)) continue;
  const t = titleOf(h);
  if (t == null) { failures.push(`caffeine/${f}: no <title>`); continue; }
  titlePages.caffeine++;
  const id = f.replace(/\.html$/, '');
  const want = figureFor(id);
  const statCard = h.match(/<div class="n"[^>]*>([^<]*? mg)<\/div>/);
  titleClaims++;
  if (/^How much caffeine is in /.test(t)) {
    // The pre-numbers fallback. Legitimate only for a page with no figure at all,
    // and this route builds only pages that have one, so it should never fire.
    if (statCard) failures.push(`caffeine/${f}: title fell back to the question form though the page states ${statCard[1]}`);
    continue;
  }
  const m = t.match(/ Caffeine: (.+) per Can$/);
  if (!m) { failures.push(`caffeine/${f}: title "${t}" is not in the "<name> Caffeine: <figure> per Can" form`); continue; }
  const d = PRODUCTS[id] ?? {};
  if (m[1] !== cap(want)) {
    failures.push(
      `caffeine/${f}: the record publishes "${want}", but the title states "${m[1]} per Can"` +
      (isQualified(d) && m[1] === `${d.caffeineMg} mg`
        ? ` — the bare ${basisOf(d) === 'range' ? 'midpoint' : 'ceiling value'}, dropping the qualifier its source attached`
        : ''),
    );
  }
  if (!statCard) failures.push(`caffeine/${f}: title states ${m[1]} but the page has no mg stat card to check it against`);
  else if (statCard[1] !== want) failures.push(`caffeine/${f}: stat card shows ${statCard[1]}, the record publishes ${want}`);
}

// (b) /latte/<product> — "<name>: N mg Caffeine, N g Sugar", each part present
// only where the record publishes it. Checked in both directions, so a title can
// neither state a figure the page lacks nor drop one the page shows.
for (const f of existsSync('dist/latte') ? readdirSync('dist/latte') : []) {
  const h = readFileSync('dist/latte/' + f, 'utf8');
  const t = titleOf(h);
  if (t == null) { failures.push(`latte/${f}: no <title>`); continue; }
  titlePages.latte++;
  const cards = statCards(h);
  const card = (name) => cards.find((c) => c.l === name || c.l.startsWith(name + ' '));

  // The caffeine half of a product title is checked against the figure the record
  // publishes, in whatever shape that is — so a qualified can cannot be titled with
  // its bare midpoint or ceiling here any more than on its caffeine page.
  const id = f.replace(/\.html$/, '');
  const rec = PRODUCTS[id] ?? {};
  if (rec.caffeineMg != null) {
    titleClaims++;
    const want = figureFor(id);
    const stated = t.match(/((?:[Uu]p to )?\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg Caffeine/);
    if (!stated) {
      failures.push(`latte/${f}: the record publishes ${want} but the title states no caffeine figure`);
    } else if (`${stated[1]} mg`.toLowerCase() !== want.toLowerCase()) {
      failures.push(
        `latte/${f}: the record publishes "${want}", but the title states "${stated[1]} mg Caffeine"` +
        (isQualified(rec) && stated[1] === String(rec.caffeineMg)
          ? ` — the bare ${basisOf(rec) === 'range' ? 'midpoint' : 'ceiling value'}`
          : ''),
      );
    }
  }

  for (const [re, label, unit] of [
    [/(\d+(?:\.\d+)?) g Sugar/, 'sugar', 'g'],
  ]) {
    const inTitle = t.match(re);
    const c = card(label);
    const shown = c ? parseFloat(c.v) : NaN;
    const published = c != null && !Number.isNaN(shown);
    if (inTitle) {
      titleClaims++;
      if (!published) failures.push(`latte/${f}: title states ${inTitle[1]} ${unit} of ${label}, but that stat card shows "${c ? c.v : 'nothing'}"`);
      else if (parseFloat(inTitle[1]) !== shown) failures.push(`latte/${f}: title says ${inTitle[1]} ${unit} ${label}, stat card shows ${c.v}`);
    } else if (published) {
      titleClaims++;
      failures.push(`latte/${f}: page publishes ${c.v} of ${label} but the title omits it`);
    }
  }
}

// (c) /brands/<brand> — "All N Compared", or "Full Specs" for a one-can lineup
for (const f of existsSync('dist/brands') ? readdirSync('dist/brands') : []) {
  if (f === 'index.html') continue;
  const h = readFileSync('dist/brands/' + f, 'utf8');
  const t = titleOf(h);
  if (t == null) { failures.push(`brands/${f}: no <title>`); continue; }
  titlePages.brands++;
  const n = bodyRows(h).length;
  titleClaims++;
  const m = t.match(/Canned Lattes: All (\d+) Compared$/);
  if (m) {
    if (parseInt(m[1], 10) !== n) failures.push(`brands/${f}: title counts ${m[1]} cans, the table lists ${n}`);
  } else if (/Canned Latte: Full Specs$/.test(t)) {
    if (n !== 1) failures.push(`brands/${f}: title is the single-can form but the table lists ${n} cans`);
  } else {
    failures.push(`brands/${f}: title "${t}" matches neither brand form`);
  }
}

// (d) /best/<slug> — the headline stat, and Gate 1 over it.
// Exactly one number per title, so its value is the whole claim: either the
// crowned extreme, or the count the title falls back to when that extreme belongs
// to an unverified record. Checking the fallback too means the Gate 1 rule cannot
// quietly stop applying in either direction.
for (const f of existsSync('dist/best') ? readdirSync('dist/best') : []) {
  const slug = f.replace(/\.html$/, '');
  const h = readFileSync('dist/best/' + f, 'utf8');
  const t = titleOf(h);
  if (t == null) { failures.push(`best/${f}: no <title>`); continue; }
  titlePages.best++;
  if (!(slug in BEST_CONFIG)) { failures.push(`best/${slug} built but is not in bestPages, so its title went unchecked`); continue; }

  const rows = bodyRows(h).map((r) => {
    const c = rawCells(r);
    return {
      unverified: /tag warn/.test(c[0] ?? ''),
      metric: num(text(c[1] ?? '')),
      id: (/href="\/latte\/([^"]+)"/.exec(c[0] ?? '') || [])[1] ?? null,
    };
  });
  if (!rows.length) { failures.push(`best/${slug}: parsed 0 rows`); continue; }

  const cfg = BEST_CONFIG[slug];
  const vals = rows.filter((r) => !Number.isNaN(r.metric));
  let expect, why;
  if (cfg && vals.length) {
    // The same leader the page's own sort puts first: the first row at the extreme.
    const extreme = vals.reduce((x, y) => ((cfg.lowerWins ? y.metric < x.metric : y.metric > x.metric) ? y : x)).metric;
    const holder = vals.find((r) => r.metric === extreme);
    if (holder.unverified) {
      expect = rows.length;
      why = `the row count, because the ${extreme} leader is unverified and Gate 1 bars crowning it`;
    } else if (cfg.field === 'caffeineMg' && holder.id && PRODUCTS[holder.id] && isQualified(PRODUCTS[holder.id])) {
      // A qualified leader that is otherwise crownable. There is no honest automatic
      // title here: a superlative drops the qualifier, and reaching past the leader
      // to the next can would crown something that is not the leader. Stop, and let
      // a person decide which number the list should claim.
      failures.push(
        `best/${slug}: "${holder.id}" leads on ${cfg.field} with a ${basisOf(PRODUCTS[holder.id])} figure ` +
        `(${figureFor(holder.id)}) and is label-verified, so it would be crowned — but a superlative cannot carry ` +
        `a qualifier. Decide by hand what this title should claim.`,
      );
      expect = rows.length;
      why = 'the row count, pending a hand decision about the qualified leader';
    } else {
      expect = extreme;
      why = `the crowned leader, which is label-verified`;
    }
  } else {
    expect = rows.length; why = 'the row count, since this list crowns no single figure';
  }

  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
  titleClaims++;
  if (nums.length !== 1) {
    failures.push(`best/${slug}: title "${t}" carries ${nums.length} numbers, expected exactly one — ${expect}, ${why}`);
  } else if (nums[0] !== expect) {
    failures.push(`best/${slug}: title says ${nums[0]}, expected ${expect} — ${why}`);
  }
}

// (e) /compare/<a>-vs-<b> — "A vs B: N vs N mg", against the Caffeine row
for (const f of existsSync('dist/compare') ? readdirSync('dist/compare') : []) {
  const h = readFileSync('dist/compare/' + f, 'utf8');
  const t = titleOf(h);
  if (t == null) { failures.push(`compare/${f}: no <title>`); continue; }
  titlePages.compare++;
  const pair = COMPARE_PAIRS.find(([a, b]) => `${a}-vs-${b}.html` === f);
  if (!pair) { failures.push(`compare/${f}: built from no pair in comparePairs, so its title went unchecked`); continue; }
  const [va, vb] = pair.map(valueFor);
  titleClaims++;
  const m = t.match(/: (.+) vs (.+) mg$/);
  if (m) {
    if (m[1] !== va || m[2] !== vb) {
      failures.push(`compare/${f}: title says "${m[1]} vs ${m[2]} mg", the records publish "${va} vs ${vb} mg"`);
    }
  } else if (/ Compared$/.test(t)) {
    // The numberless form is only right when one of the cans publishes no figure.
    if (va != null && vb != null) {
      failures.push(`compare/${f}: title omits the figures though both cans publish one (${va} / ${vb})`);
    }
  } else {
    failures.push(`compare/${f}: title "${t}" matches neither compare form`);
  }
}

/* ---- the qualifier never comes off, anywhere -------------------------------
 * The rules above cover the slots that were designed to carry a figure. This is
 * the sweep that covers the rest: every table on the site that has a Caffeine
 * column, every row in it resolved back to a product, and the cell compared to the
 * figure that product publishes. A bare "120 mg" for a can whose label says "up to
 * 120 mg" fails here no matter which page grew it — the home table, a brand hub,
 * /table, /new, a ranking, a sibling table on a caffeine page.
 *
 * It runs over every product, not only the qualified ones, so the sweep also
 * catches a cell that has drifted from its record for any other reason. */
let sweepCells = 0, sweepTables = 0;
const headerIndex = (tableHtml, label) => {
  const head = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (!head) return -1;
  const ths = [...head[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
  return ths.findIndex((x) => x === label);
};
const walkHtml = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) walkHtml(full, acc);
    else if (e.name.endsWith('.html')) acc.push(full);
  }
  return acc;
};
for (const file of existsSync('dist') ? walkHtml('dist') : []) {
  const h = readFileSync(file, 'utf8');
  for (const tm of h.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const idx = headerIndex(tm[1], 'Caffeine');
    if (idx < 0) continue;
    const tb = tm[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!tb) continue;
    sweepTables++;
    for (const rm of tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = rawCells(rm[1]);
      if (c.length <= idx) continue;
      // Which product this row is about: product tables link to /latte/<id>, the
      // sibling table on a caffeine page links to /caffeine/<id>.
      const id = (/href="\/(?:latte|caffeine)\/([^"#]+)"/.exec(rm[1]) || [])[1];
      if (!id || !PRODUCTS[id] || PRODUCTS[id].caffeineMg == null) continue;
      sweepCells++;
      const shown = text(c[idx]).replace(/\*$/, '').trim();
      const want = figureFor(id);
      if (shown !== want) {
        const d = PRODUCTS[id];
        failures.push(
          `${file.replace(/^dist\//, '')}: the Caffeine cell for ${id} reads "${shown}", the record publishes "${want}"` +
          (isQualified(d) && shown === `${d.caffeineMg} mg`
            ? ` — the bare ${basisOf(d) === 'range' ? 'midpoint' : 'ceiling value'}, with the qualifier dropped`
            : ''),
        );
      }
    }
  }
}

/* ---- and in the compare spec table, whose rows carry no product link --------- */
for (const [a, b] of COMPARE_PAIRS) {
  const path = `dist/compare/${a}-vs-${b}.html`;
  if (!existsSync(path)) continue;
  const r = rowVal(readFileSync(path, 'utf8'), 'Caffeine');
  if (!r) { failures.push(`compare/${a}-vs-${b}: no Caffeine row to sweep`); continue; }
  for (const [cell, id] of [[r[0], a], [r[1], b]]) {
    if (PRODUCTS[id]?.caffeineMg == null) continue;
    sweepCells++;
    const shown = cell.replace(/\*$/, '').trim();
    const want = figureFor(id);
    if (shown !== want) {
      failures.push(`compare/${a}-vs-${b}: the Caffeine cell for ${id} reads "${shown}", the record publishes "${want}"`);
    }
  }
}

/* ---- prose: a figure stated beside the can it belongs to --------------------
 * The sweep above walks tables. This walks sentences, and exists because a real
 * bug lived here undetected: the brand hubs summarised a lineup as "range from 55
 * to 96 mg" directly above a list reading "at 91–101 mg" — bare midpoints in the
 * first half of a sentence whose second half was correct. Nothing checked prose,
 * so only reading it found that.
 *
 * Two rules, both anchored on unambiguous attribution rather than on guessing
 * which can a loose number belongs to:
 *
 *   A. Wherever prose links to a product and then states a caffeine figure before
 *      the next link, that figure must be the one the record publishes. This is
 *      the shape every generated list uses — "<a>Organic Mocha</a> at 91–101 mg" —
 *      and it covers hand-written copy in listContent.ts on the same terms.
 *
 *   B. On a qualified can's own pages, its bare caffeineMg must not appear at all,
 *      except in the few phrasings that deliberately name the derived number —
 *      "we rank it on the 255 mg midpoint". Those are listed per product rather
 *      than pattern-matched, so a new bare mention cannot hide behind a loose rule.
 */
/* ======================================================================
 * Ratings and the Product schema gate.
 *
 * A rating is the one number on this site that is not data. Everything else is
 * measured off a label; this is one person's opinion of a drink, and it buys
 * review stars in a search result. That asymmetry is the whole reason for this
 * group: Google renders Product/review markup as a star rating next to the
 * result, so markup claiming a review the page cannot show is a rich-result
 * fabrication, not a template bug.
 *
 * The gate has always been "Product schema only with a real rating" (CLAUDE.md).
 * Until now nothing read the built JSON-LD to check it held. This group does,
 * from both directions:
 *
 *   a. A page rendering Product schema with a review or an aggregateRating must
 *      have BOTH rating and tastingNotes in its record.
 *   b. A record with both must actually render it — otherwise the gate has
 *      silently stopped emitting and nobody would notice, because a missing
 *      <script> looks exactly like a page that was never rated.
 *   c. The rating itself: 1.0-5.0, at most one decimal, and the same number in
 *      the record, in the JSON-LD and in the visible "My rating: N/5".
 *   d. The reviewer is the Person named in src/lib/products.ts, never an
 *      Organization and never an invented name. A website does not have a palate.
 *   e. No offers block, ever. We compare, we do not sell.
 *   f. The disclosure renders wherever a rating does.
 * ==================================================================== */
let ratingClaims = 0, ratingPages = 0, ratedPages = 0;

// The reviewer the page is allowed to name, read from source rather than typed
// here — the byline and the schema author are supposed to be the same human, and
// this check is worthless if it carries its own copy of the answer.
const REVIEWER_NAME = (SRC.match(/REVIEWER\s*=\s*\{\s*name:\s*'([^']+)'/) || [])[1] ?? null;
if (SRC && !REVIEWER_NAME) {
  failures.push('could not read REVIEWER out of src/lib/products.ts — this check is broken, not the data');
}

const jsonLdBlocks = (h) =>
  [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const v = JSON.parse(m[1]);
        return Array.isArray(v) ? v : [v];
      } catch {
        failures.push('unparseable JSON-LD block in a built page');
        return [];
      }
    });

/** One decimal at most, and inside the scale. Kept as its own function because the
 *  record and the rendered ratingValue are both put through it. */
const badRating = (v) => {
  if (typeof v !== 'number' || Number.isNaN(v)) return 'is not a number';
  if (v < 1 || v > 5) return `is ${v}, outside the 1.0-5.0 scale`;
  if (Math.abs(v * 10 - Math.round(v * 10)) >= 1e-9) return `is ${v}, which has more than one decimal place`;
  return null;
};

for (const f of existsSync('dist/latte') ? readdirSync('dist/latte') : []) {
  const h = readFileSync('dist/latte/' + f, 'utf8');
  const id = f.replace(/\.html$/, '');
  const rec = PRODUCTS[id];
  if (!rec) continue;
  ratingPages++;

  const recRated = rec.rating != null;
  const recNoted = typeof rec.tastingNotes === 'string' && rec.tastingNotes.trim() !== '';
  const product = jsonLdBlocks(h).find((b) => b && b['@type'] === 'Product');
  const carriesReview = !!(product && (product.review || product.aggregateRating));

  // (a) + (b): the gate, both directions.
  ratingClaims++;
  if (carriesReview && !(recRated && recNoted)) {
    failures.push(
      `latte/${f}: renders Product schema with a review, but the record has ` +
      `${recRated ? 'a rating and no tastingNotes' : recNoted ? 'tastingNotes and no rating' : 'neither a rating nor tastingNotes'} ` +
      `— that is a star rating in search results with nothing behind it`,
    );
  }
  if (!carriesReview && recRated && recNoted) {
    failures.push(`latte/${f}: record has rating ${rec.rating} and tastingNotes, but the page renders no Product review schema — the gate has stopped emitting`);
  }

  if (!(recRated && recNoted)) {
    // (unrated) nothing may show: no stars, no empty state.
    ratingClaims++;
    if (/My rating:/.test(h)) failures.push(`latte/${f}: unrated record, but the page prints a rating`);
    continue;
  }

  ratedPages++;

  // (c) the number, in all three places it appears.
  const bad = badRating(rec.rating);
  if (bad) failures.push(`latte/${f}: record rating ${bad}`);
  ratingClaims++;

  if (product) {
    const rv = product.review?.reviewRating?.ratingValue ?? product.aggregateRating?.ratingValue;
    ratingClaims++;
    const badRendered = badRating(rv);
    if (badRendered) failures.push(`latte/${f}: JSON-LD ratingValue ${badRendered}`);
    else if (rv !== rec.rating) failures.push(`latte/${f}: JSON-LD ratingValue is ${rv}, the record says ${rec.rating}`);

    // (d) the reviewer.
    ratingClaims++;
    const author = product.review?.author;
    if (!author) failures.push(`latte/${f}: Product review has no author`);
    else if (author['@type'] !== 'Person') failures.push(`latte/${f}: review author is a ${author['@type']}, not a Person — a website does not have a palate`);
    else if (REVIEWER_NAME && author.name !== REVIEWER_NAME) failures.push(`latte/${f}: review author is "${author.name}", but src/lib/products.ts names the reviewer "${REVIEWER_NAME}"`);

    // (e) no offers.
    ratingClaims++;
    if (product.offers) failures.push(`latte/${f}: Product schema carries an offers block — we compare, we do not sell`);

    // The review body has to be the notes, not the summary or some other field.
    ratingClaims++;
    const body = product.review?.reviewBody;
    if (body && body.trim() !== rec.tastingNotes.trim()) {
      failures.push(`latte/${f}: reviewBody is not the record's tastingNotes`);
    }
  }

  // (c continued) the visible number must agree with the record.
  ratingClaims++;
  const shown = h.match(/My rating:\s*([\d.]+)\s*\/\s*5/);
  if (!shown) failures.push(`latte/${f}: record is rated ${rec.rating} but the page shows no "My rating: N/5"`);
  else if (parseFloat(shown[1]) !== rec.rating) failures.push(`latte/${f}: page shows "My rating: ${shown[1]}/5", the record says ${rec.rating}`);

  // (f) the disclosure.
  ratingClaims++;
  if (!h.includes('data-claims="rating-disclosure"')) {
    failures.push(`latte/${f}: shows a rating with no line saying ratings do not affect the rankings`);
  }
}

let proseClaims = 0, proseBlocks = 0;

// <p>, <li>, <h2>, <h3>. Table cells are the sweep's job, not this one.
const PROSE_BLOCK = /<(p|li|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/g;
const PRODUCT_LINK = /<a[^>]*href="\/(?:latte|caffeine)\/([^"#]+)"[^>]*>[\s\S]*?<\/a>/g;
// A figure, not a fragment of a wider range: the lookbehind keeps "34–255 mg" from
// reading as "255 mg", and "23.2 mg" from reading as "2 mg".
const PROSE_FIGURE = /(?<![\d.–-])((?:up to )?\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg/i;

for (const file of existsSync('dist') ? walkHtml('dist') : []) {
  const h = readFileSync(file, 'utf8');
  const where = file.replace(/^dist\//, '');

  // ---- A. a figure stated after a link to the can it belongs to ----
  for (const bm of h.matchAll(PROSE_BLOCK)) {
    const inner = bm[2];
    const links = [...inner.matchAll(PRODUCT_LINK)];
    if (!links.length) continue;
    proseBlocks++;
    for (let i = 0; i < links.length; i++) {
      const id = links[i][1];
      if (!PRODUCTS[id]) continue;
      // Everything said about this can before the next can is named.
      const from = links[i].index + links[i][0].length;
      const to = i + 1 < links.length ? links[i + 1].index : inner.length;
      const said = text(inner.slice(from, to));
      const m = said.match(PROSE_FIGURE);
      if (!m) continue;
      proseClaims++;
      const want = figureFor(id);
      if (m[1].toLowerCase() !== want.replace(/ mg$/, '').toLowerCase()) {
        const d = PRODUCTS[id];
        failures.push(
          `${where}: prose says "${m[1]} mg" straight after linking ${id}, which publishes "${want}"` +
          (isQualified(d) && m[1] === String(d.caffeineMg)
            ? ` — the bare ${basisOf(d) === 'range' ? 'midpoint' : 'ceiling value'}`
            : ''),
        );
      }
    }
  }

  // ---- B. the page's own voice, where it is not quoting a linked can ----
  // Rule A only sees what follows a link. The bug that prompted this group sat in
  // front of one — "Groundwork Coffee's cans range from 55 to 96 mg" opening a
  // sentence whose linked second half was correct — so this rule reads whatever
  // the page says unattributed, and holds it to the cans the page is *about*:
  // its own can on a product or caffeine page, the whole lineup on a brand hub.
  const subjects =
    /^(?:latte|caffeine)\/(.+)\.html$/.test(where)
      ? [/^(?:latte|caffeine)\/(.+)\.html$/.exec(where)[1]]
      : /^brands\/(.+)\.html$/.test(where)
        ? Object.keys(PRODUCTS).filter((k) => PRODUCTS[k].brandSlug === /^brands\/(.+)\.html$/.exec(where)[1])
        : [];
  const qualifiedSubjects = subjects.filter((k) => PRODUCTS[k]?.caffeineMg != null && isQualified(PRODUCTS[k]));
  if (!qualifiedSubjects.length) continue;

  for (const bm of h.matchAll(PROSE_BLOCK)) {
    // Whatever follows a link belongs to the can that link names — rule A's job.
    // On a ceiling page the "closest on caffeine" list is the case that matters: a
    // rival publishing a genuine 120 mg sits in the prose of a can whose ceiling is
    // also 120. Blank those spans and read only the page's unattributed voice.
    let inner = bm[2];
    const spans = [...inner.matchAll(PRODUCT_LINK)];
    for (let i = spans.length - 1; i >= 0; i--) {
      const from = spans[i].index;
      const to = i + 1 < spans.length ? spans[i + 1].index : inner.length;
      inner = inner.slice(0, from) + ' '.repeat(to - from) + inner.slice(to);
    }
    const base = text(inner);
    if (!base) continue;

    for (const id of qualifiedSubjects) {
      const d = PRODUCTS[id];
      // The deliberate mentions of the derived number, spelled out rather than
      // matched loosely. Adding a new phrasing is an edit here, which is the point.
      const deliberate = [
        figureFor(id),
        `${d.caffeineMg} mg midpoint`,
        `${d.caffeineMg} mg ceiling`,
        `we rank it at ${d.caffeineMg} mg`,
        `we rank it on the ${d.caffeineMg} mg`,
      ];
      let said = base;
      for (const ok of deliberate) said = said.split(ok).join(' ');
      proseClaims++;
      // The lookbehind keeps "34–255 mg" and "23.2 mg" from reading as a bare figure.
      // Character class written without backslash escapes on purpose: inside a
      // template literal `\d` collapses to a literal "d", which quietly turned this
      // lookbehind into a no-op and made "34–255 mg" read as a bare "55 mg".
      if (new RegExp(`(?<![0-9.–-])${d.caffeineMg} mg`).test(said)) {
        failures.push(
          `${where}: states a bare "${d.caffeineMg} mg" in its own voice — ${id} publishes "${figureFor(id)}", ` +
          `and the only bare mentions allowed are the ones naming it as a ${basisOf(d) === 'range' ? 'midpoint' : 'ceiling'}`,
        );
      }
    }
  }
}

/* ---- hand-written superlatives must carry a reviewed basis ------------------
 * Everything else in this file re-derives a claim from the records. This group
 * covers the text nothing re-derives: the sentences a person typed into a
 * product's `summary`, `caffeineNote` or `tastingNotes`, into the /best list copy
 * in src/lib/listContent.ts, or into a news entry in src/lib/news.ts.
 *
 * A computed sentence cannot go stale — the brand hub's "the strongest is Triple
 * Draft Latte at 230 mg" is rebuilt from the table beside it on every build, and
 * the groups above cross-check it against that table. A typed one goes stale
 * silently, and has now done so twice: the Pumpkin Spice summary crowned itself
 * "the sweetest in the line at 18 g of sugar" and stayed that way until a 20 g
 * can landed beside it and somebody happened to read the file. Nothing was
 * watching, because nothing can recompute a sentence a person wrote.
 *
 * So the rule is not "this claim is true" — no checker can know that. It is "a
 * person reviewed this claim and wrote down what it rests on". Each definite
 * superlative in hand-written copy must appear in SUPERLATIVE_CLAIMS below with
 * the basis it was checked against. Adding one is a deliberate act, the same way
 * adding an EDITION_IMAGES entry in check-data.mjs is, and the basis is what the
 * next person reads when the database moves underneath the sentence.
 *
 * What counts as a superlative here is deliberately narrow: a *definite* one —
 * "the strongest", "The sweetest", a sentence-initial "Most". The bare words do
 * not, because "16 g of sugar, only 5 g of it added" and "most are shelf-stable"
 * are a quantifier about one record and a hedge, not a crown over the database.
 * A rule that flagged those would bury the twenty claims that matter under forty
 * that do not, which is how an allowlist stops being read. FAQ question headings
 * are skipped for the same reason: "What is the strongest canned latte?" asks
 * the question the answer beneath it has to get right, and that answer is
 * scanned.
 */
const SUPERLATIVE_TERMS =
  'sweetest|strongest|highest|lowest|biggest|richest|cheapest|widest|largest|smallest|fewest|best|worst|most|least|only|first';
const DEFINITE_SUPERLATIVE = new RegExp(`\\bthe\\s+(?:${SUPERLATIVE_TERMS})\\b`, 'gi');
// Capitalised and sentence-initial: "Most of La Colombe's Draft Lattes print …".
const LEADING_SUPERLATIVE = new RegExp(`(?:^|[.!?]\\s+)(?:${SUPERLATIVE_TERMS})\\b`, 'g');

/** Reviewed hand-written superlatives.
 *
 *  `where`  the field it lives in. Checked, not decorative: an entry naming a
 *           place its claim is not in fails, so a sentence that moves file
 *           cannot leave a basis behind pointing at the old one.
 *  `claim`  the phrase as authored, verbatim. Editing the sentence breaks the
 *           match and sends the claim back for review, which is the point.
 *  `basis`  what it was checked against, and when. Written for the person who
 *           reads it after the database has moved.
 */
const SUPERLATIVE_CLAIMS = [
  // ---- product records -----------------------------------------------------
  {
    where: 'products/beekeeper-hot-honey-latte.json',
    claim: 'the only deliberately spicy can we track',
    basis: 'Checked 2026-09-23: no other record names chili, capsaicin or pepper. Recheck when a spicy can is added.',
  },
  {
    where: 'products/bones-holy-cannoli-latte.json',
    claim: 'the strongest can in our database',
    basis: 'Checked 2026-09-23: 250-260 mg is the top caffeineMg, and /best/most-caffeine sorts it first. That ranking recomputes itself; this sentence does not.',
  },
  {
    where: 'products/french-truck-lightly-sweetened-latte.json',
    claim: 'the least sweet of the three',
    basis: 'Checked 2026-09-23: French Truck has three records, at 15, 21 and 27 g of sugar. "Of the three" carries its own denominator, so a fourth flavour makes the sentence visibly wrong rather than quietly wrong.',
  },
  {
    where: 'products/french-truck-mocha-latte.json',
    claim: 'the richest of the three',
    basis: 'Checked 2026-09-23: 27 g is the highest sugar and 210 the highest calories of the three French Truck records.',
  },
  {
    where: 'products/groundwork-organic-coconut-cold-brew-latte.json',
    claim: 'the only coconut-milk can we track',
    basis: "Checked 2026-09-23: the only record with milk === 'coconut'.",
  },
  {
    where: 'products/groundwork-organic-mocha-cold-brew-latte.json',
    claim: 'the strongest can in their line',
    basis: 'Checked 2026-09-23: 91-101 mg against 75-83, 70-78 and 70-78 across the four Groundwork records.',
  },
  {
    where: 'products/groundwork-organic-mocha-cold-brew-latte.json',
    claim: 'the only one of the four that adds sugar',
    basis: 'Checked 2026-09-23: the other three Groundwork records carry addedSugar false; this one lists 7 g of date sugar.',
  },
  {
    where: 'products/groundwork-organic-mocha-cold-brew-latte.json',
    claim: 'the strongest of the four Groundwork variants',
    basis: 'The same claim as the summary above, restated in caffeineNote. Both rest on the same four figures and move together.',
  },
  {
    where: 'products/joe-coffee-honey-oat-latte.json',
    claim: 'the smallest can we track',
    basis: 'Checked 2026-09-23: 7.5 oz is the lowest sizeOz in the database.',
  },
  {
    where: 'products/la-colombe-pumpkin-spice-draft-latte.json',
    claim: 'the only one on the label',
    basis: "About this can's own ingredient list rather than the database: cane sugar is the only sweetener printed on it. A record-local claim, so no other product can make it stale.",
  },
  {
    where: 'products/projo-power-coffee-vanilla-latte.json',
    claim: 'The most protein of any can in our database',
    basis: 'Checked 2026-09-23: 25 g is the top proteinG, and /best/high-protein crowns the same figure from the same field.',
  },
  {
    where: 'products/starbucks-doubleshot-espresso-salted-caramel-cream.json',
    claim: 'The most widely available latte in a can',
    basis: 'Editorial judgement about shelf presence, not a figure we hold. Nothing here can confirm or falsify it; kept because it is true of the category, and recorded as opinion so nobody mistakes it for data.',
  },
  // ---- /best list copy -----------------------------------------------------
  {
    where: 'listContent.ts -> least-sugar',
    claim: 'The sweetest flavored dairy cans we have checked against a label carry 38 to 39 g',
    basis: 'Checked 2026-09-23: the two Bones cold brew cans at 38 and 39 g are the highest sugarG on any verified record. "We have checked against a label" is the denominator, and it is doing real work — unverified records are excluded.',
  },
  {
    where: 'listContent.ts -> least-sugar',
    claim: 'the best of the rest get down to a single gram',
    basis: 'Checked 2026-09-23: Slate Vanilla at 1 g is the lowest non-zero sugarG, above the sucralose-sweetened zeros named earlier in the same sentence.',
  },
  {
    where: 'listContent.ts -> least-sugar',
    claim: 'less than half of what the sweetest dairy cans carry',
    basis: 'Arithmetic on the 38-39 g figure earlier in the same paragraph: 15 g is under half of 38. Moves with that claim, not independently.',
  },
  {
    where: 'listContent.ts -> least-sugar',
    claim: 'the only cans we list at 0 g',
    basis: 'Checked 2026-09-23: the two Loco Coffee records are the only ones with sugarG 0.',
  },
  {
    where: 'listContent.ts -> no-added-sugar',
    claim: 'the least-sugar list',
    basis: 'The name of the page at /best/least-sugar, not a claim about a can.',
  },
  {
    where: 'listContent.ts -> most-caffeine',
    claim: 'the strongest cans on this list genuinely replace a large coffee-shop order',
    basis: 'Rests on the 140-200 mg drip figure quoted in the same sentence against the 230-260 mg top of the list. Directional, and true across a wide margin.',
  },
  {
    where: 'listContent.ts -> most-caffeine',
    claim: 'the strongest we track at the 250–260 mg of caffeine the brand publishes',
    basis: 'Checked 2026-09-23: the same leader as the Bones Holy Cannoli summary, stated in its published range rather than as a midpoint.',
  },
  {
    where: 'listContent.ts -> most-caffeine',
    claim: 'roughly two of the strongest cans on this list',
    basis: 'Arithmetic against the 400 mg daily figure in the same sentence: two cans at 250-260 mg. Moves only if the top of the list moves a long way.',
  },
  {
    where: 'listContent.ts -> cheapest-per-can',
    claim: 'The cheapest per-can path for most people',
    basis: 'Advice about how to buy, not a ranking of cans. Nothing in the database confirms or contradicts it.',
  },
  {
    where: 'listContent.ts -> cheapest-per-can',
    claim: 'the cheapest at about $2.83 per can in a 12-pack',
    basis: "Checked 2026-09-23: $2.83 is the lowest pricePerCan in the database, and /best/cheapest-per-can crowns the same figure. The S'mores can joined the La Colombe line at $2.89 as a single, which is what \"in a 12-pack\" is holding apart.",
  },
  {
    where: 'listContent.ts -> cheapest-per-can',
    claim: 'the best real-world deal',
    basis: 'Advice about where to buy, hedged with "often". Not a figure.',
  },
  {
    where: 'listContent.ts -> dairy-free',
    claim: "Most of La Colombe's reformulated Draft Lattes print",
    basis: "Checked 2026-09-23 against the label photos we hold: Caramel, Mocha, Triple, Vanilla and Pumpkin Spice print \"lactose free\" on the front band, the S'mores limited edition does not, and the same sentence names it as the exception.",
  },
];

// Where each scanned field lives, stably. A listContent string is named by the
// /best slug whose block contains it and a news string by its date, rather than
// by an index that shifts the moment a paragraph is inserted above it.
const sectionAt = (sections, at) => {
  let name = null;
  for (const s of sections) { if (s.at <= at) name = s.name; else break; }
  return name;
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
// key: 'value' where the value is long enough to be prose, or a bare string in an
// array (a paragraph). Short literals — slugs, hrefs, labels — are skipped.
const TS_STRING = /(\w+)\s*:\s*'((?:[^'\\\n]|\\.)*)'|'((?:[^'\\\n]|\\.)*)'/g;

const handWritten = [];
for (const [id, d] of Object.entries(PRODUCTS)) {
  for (const key of ['summary', 'caffeineNote', 'tastingNotes']) {
    if (typeof d[key] === 'string' && d[key].trim()) {
      handWritten.push({ where: `products/${id}.json`, key, text: d[key], question: false });
    }
  }
}
for (const [path, label, sectionRe] of [
  ['src/lib/listContent.ts', 'listContent.ts', /^ {2}'([a-z0-9-]+)':\s*\{/gm],
  ['src/lib/news.ts', 'news.ts', /date:\s*'(\d{4}-\d{2}-\d{2})'/g],
]) {
  if (!existsSync(path)) { failures.push(`${path} is missing, so its copy went unscanned for superlatives`); continue; }
  const body = stripComments(readFileSync(path, 'utf8'));
  const sections = [...body.matchAll(sectionRe)].map((m) => ({ at: m.index, name: m[1] }));
  if (!sections.length) {
    failures.push(`${label}: found no sections to key its strings by — this scanner is broken, not the copy`);
  }
  for (const m of body.matchAll(TS_STRING)) {
    const key = m[1] ?? null;
    const text = (m[2] ?? m[3] ?? '').replace(/\\'/g, "'");
    if (text.length < 30) continue;
    handWritten.push({
      where: `${label} -> ${sectionAt(sections, m.index) ?? '(top)'}`,
      key: key ?? 'paragraph',
      text,
      question: key === 'q',
    });
  }
}

let superlativeFields = 0, superlativeClaims = 0;
for (const entry of SUPERLATIVE_CLAIMS) {
  if (!entry.basis || entry.basis.trim().length < 20) {
    failures.push(`SUPERLATIVE_CLAIMS entry "${entry.claim}" has no basis written down — an allowlist without reasons is a mute button`);
  }
}
const usedClaims = new Set();
for (const field of handWritten) {
  superlativeFields++;
  // Blank out every reviewed claim that is actually in this field, then read what
  // is left. Same idiom as the qualified-figure sweep above: an exemption is a
  // listed phrase, never a loosened pattern.
  let said = field.text;
  for (const entry of SUPERLATIVE_CLAIMS) {
    if (!said.includes(entry.claim)) continue;
    if (!field.where.startsWith(entry.where)) {
      failures.push(
        `SUPERLATIVE_CLAIMS says "${entry.claim}" lives in ${entry.where}, but it was found in ${field.where} — ` +
        `move the entry or the copy, so the basis stays attached to the sentence it describes`,
      );
    }
    usedClaims.add(entry.claim);
    said = said.split(entry.claim).join(' '.repeat(entry.claim.length));
  }
  if (field.question) continue;   // a heading asks; the answer below it claims
  superlativeClaims++;
  const hits = [
    ...said.matchAll(DEFINITE_SUPERLATIVE),
    ...[...said.matchAll(LEADING_SUPERLATIVE)].filter((m) => /[A-Z]/.test(m[0])),
  ];
  for (const h of hits) {
    const a = Math.max(0, h.index - 60), b = Math.min(said.length, h.index + h[0].length + 80);
    failures.push(
      `${field.where} (${field.key}): unreviewed superlative "${h[0].trim()}" in ` +
      `"…${field.text.slice(a, b).replace(/\s+/g, ' ')}…" — nothing recomputes this sentence, so add it to ` +
      `SUPERLATIVE_CLAIMS with the basis you checked it against, or rewrite it without the crown`,
    );
  }
}
// An entry whose claim is nowhere in the copy has outlived its sentence, and the
// next person to read the allowlist would be reading a basis for writing that is
// gone. Same rule as the stale-EDITION_IMAGES check in check-data.mjs.
for (const entry of SUPERLATIVE_CLAIMS) {
  if (!usedClaims.has(entry.claim)) {
    failures.push(`stale SUPERLATIVE_CLAIMS entry: "${entry.claim}" is in no hand-written field any more (was ${entry.where})`);
  }
}

// (f) /table — "N Cans, One Table"
if (existsSync('dist/table.html')) {
  const h = readFileSync('dist/table.html', 'utf8');
  const t = titleOf(h);
  titlePages.table++;
  const n = bodyRows(h).length;
  const m = (t ?? '').match(/(\d+) Cans, One Table$/);
  titleClaims++;
  if (!m) failures.push(`table.html: title "${t}" is not in the "N Cans, One Table" form`);
  else if (parseInt(m[1], 10) !== n) failures.push(`table.html: title counts ${m[1]} cans, the table lists ${n}`);
}

totalClaims = compareClaims + caffeineClaims + guideClaims + discloseClaims + titleClaims + sweepCells + proseClaims + ratingClaims + superlativeClaims;

// ---- the zero-coverage guard ----
// The guide row counts declared guides, not discovered ones, so "no guide pages
// were found" fails here instead of skipping the row.
//
// The minimums are the real expected counts, not 1. A minimum of 1 let the compare
// group fall from 45 claims to 6 — when a <sup> marker was added inside the table
// cells its selector read — and still report a pass. A floor that only catches
// total blindness does not catch a group going nearly blind, so each is set just
// under what the group inspects today and has to be raised, deliberately, when the
// content it covers shrinks.
const groups = [
  ['compare pages', comparePages, 'compare claims', compareClaims, 40],
  // One claim per page, every page — so the floor is the page count itself rather
  // than a constant that drifts out of date as the database grows.
  ['caffeine pages', caffeinePages, 'caffeine claims', caffeineClaims, caffeinePages],
  ['brand caffeine guides', Math.max(guidePages, EXPECTED_GUIDES.length), 'brand guide claims', guideClaims, 6],
  ['compare pages', disclosePages, 'sourcing-disclosure checks', discloseClaims, 150],
  ['titled pages', Object.values(titlePages).reduce((a, b) => a + b, 0), 'title claims', titleClaims, 190],
  ['tables with a Caffeine column', sweepTables, 'swept caffeine cells', sweepCells, 200],
  ['prose blocks naming a can', proseBlocks, 'prose figure checks', proseClaims, 150],
  // Two checks land on every product page whether or not it is rated (the gate, in
  // both directions, and "an unrated page prints nothing"), so the floor is the
  // page count and does not move when the number of ratings does. A site with no
  // ratings at all still has to prove no page is claiming one.
  ['product pages', ratingPages, 'rating and schema-gate checks', ratingClaims, ratingPages],
  // An absolute floor, not one derived from the scan. Deriving it from
  // superlativeFields would make the row self-referential: a string-literal regex
  // that stopped matching listContent.ts would drop the count and the floor
  // together and still report a pass, which is the exact near-blindness the note
  // above is about. 218 fields are scanned today: 169 product records and 49
  // strings out of the two TypeScript modules. The floor sits above the products
  // alone, so losing either source trips it. The stale-entry rule below catches
  // the same failure from the other side, loudly.
  ['hand-written fields', superlativeFields, 'superlative reviews', superlativeClaims, 200],
];
for (const [pageWhat, pageN, claimWhat, claimN, min] of groups) {
  if (pageN > 0 && claimN < min) {
    failures.push(`parsed 0 ${claimWhat} across ${pageN} ${pageWhat} — the checker's selectors are broken, not the content`);
  }
}
if (totalClaims === 0) {
  failures.push('parsed 0 claims in total — refusing to report a pass');
}

if (failures.length) {
  console.error(`\n  Claim cross-check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error('   • ' + f);
  console.error('');
  process.exit(1);
}

const titled = Object.entries(titlePages).filter(([, n]) => n > 0);
console.log(
  `  Claims OK — ${totalClaims} numeric claims cross-checked against their own tables ` +
  `(${compareClaims} across ${comparePages} compare pages, ${caffeineClaims} across ${caffeinePages} caffeine pages, ` +
  `${guideClaims} across ${guidePages} brand caffeine guide${guidePages === 1 ? '' : 's'}, ` +
  `${discloseClaims} sourcing-disclosure checks across ${disclosePages} compare pages, ` +
  `${titleClaims} title claims across ${titled.reduce((a, [, n]) => a + n, 0)} pages ` +
  `[${titled.map(([k, n]) => `${k} ${n}`).join(', ')}], ` +
  `${sweepCells} caffeine cells swept across ${sweepTables} tables for a dropped qualifier, ` +
  `${proseClaims} prose figure checks across ${proseBlocks} blocks naming a can, ` +
  `${ratingClaims} rating and schema-gate checks across ${ratingPages} product pages, ` +
  `${ratedPages} of them rated; ` +
  `${superlativeClaims} hand-written field(s) read for an unreviewed superlative, against ` +
  `${SUPERLATIVE_CLAIMS.length} reviewed claim(s)).`
);
