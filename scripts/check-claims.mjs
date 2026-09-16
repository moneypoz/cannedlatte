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
    for (const [re, label] of COMPARE_TESTS) {
      const r = rowVal(h, label);
      if (!r) continue;
      const x = num(r[0]), y = num(r[1]);
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
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
    // The direct answer, first sentence: "<name> has about N mg of caffeine", or
    // "<name> has N–M mg of caffeine" where the source published a range. Either
    // way it must match the headline stat card beside it.
    const claim = body.match(/has (?:about )?(\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg of caffeine/);
    const stat = h.match(/<div class="n"[^>]*>(\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg<\/div>/);
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

/** Records whose source published a range rather than a figure, by product id.
 *  Read from the JSONs so the rule is anchored to the data, not to whatever the
 *  page happened to render: a title may state the range and never the midpoint
 *  alone, on the product page and the caffeine page alike. */
const RANGES = Object.fromEntries(
  Object.entries(PRODUCTS)
    .filter(([, d]) => d.caffeineMinMg != null && d.caffeineMaxMg != null)
    .map(([id, d]) => [id, { min: d.caffeineMinMg, max: d.caffeineMaxMg, mid: d.caffeineMg }]),
);

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
  const want = RANGES[id];
  const statMg = h.match(/<div class="n"[^>]*>(\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg<\/div>/);
  titleClaims++;
  if (/^How much caffeine is in /.test(t)) {
    // The pre-numbers fallback. Legitimate only for a page with no figure at all,
    // and this route builds only pages that have one, so it should never fire.
    if (statMg) failures.push(`caffeine/${f}: title fell back to the question form though the page states ${statMg[1]} mg`);
    continue;
  }
  const m = t.match(/ Caffeine: (\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg per Can$/);
  if (!m) { failures.push(`caffeine/${f}: title "${t}" is not in the "<name> Caffeine: N mg per Can" form`); continue; }
  if (want) {
    titleClaims++;
    const range = `${want.min}–${want.max}`;
    if (m[1] !== range) {
      failures.push(
        `caffeine/${f}: source publishes ${range} mg, but the title states "${m[1]} mg per Can"` +
        `${m[1] === String(want.mid) ? ' — the midpoint alone, asserting a precision the source never gave' : ''}`,
      );
    }
  } else if (/–/.test(m[1])) {
    failures.push(`caffeine/${f}: title states a ${m[1]} mg range, but the record carries no caffeineMinMg/caffeineMaxMg`);
  }
  if (!statMg) failures.push(`caffeine/${f}: title states ${m[1]} mg but the page has no mg stat card to check it against`);
  else if (m[1] !== statMg[1]) failures.push(`caffeine/${f}: title says ${m[1]} mg, stat card shows ${statMg[1]} mg`);
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

  // Range-sourced cans state the range here too. The midpoint alone in a title is
  // the false precision these fields exist to prevent, wherever the title renders.
  const want = RANGES[f.replace(/\.html$/, '')];
  if (want) {
    titleClaims++;
    const range = `${want.min}–${want.max}`;
    const stated = t.match(/(\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?) mg Caffeine/);
    if (!stated) {
      failures.push(`latte/${f}: source publishes ${range} mg but the title states no caffeine figure`);
    } else if (stated[1] !== range) {
      failures.push(
        `latte/${f}: source publishes ${range} mg, but the title states "${stated[1]} mg Caffeine"` +
        `${stated[1] === String(want.mid) ? ' — the midpoint alone' : ''}`,
      );
    }
  }

  for (const [re, label, unit] of [
    [/(\d+(?:\.\d+)?) mg Caffeine/, 'caffeine', 'mg'],
    [/(\d+(?:\.\d+)?) g Sugar/, 'sugar', 'g'],
  ]) {
    // The caffeine half is checked against the range above for range-sourced cans;
    // its stat card still shows the midpoint, so skip the equality test here.
    if (want && label === 'caffeine') continue;
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
    return { unverified: /tag warn/.test(c[0] ?? ''), metric: num(text(c[1] ?? '')) };
  });
  if (!rows.length) { failures.push(`best/${slug}: parsed 0 rows`); continue; }

  const cfg = BEST_CONFIG[slug];
  const vals = rows.filter((r) => !Number.isNaN(r.metric));
  let expect, why;
  if (cfg && vals.length) {
    // The same leader the page's own sort puts first: the first row at the extreme.
    const extreme = vals.reduce((x, y) => ((cfg.lowerWins ? y.metric < x.metric : y.metric > x.metric) ? y : x)).metric;
    const holder = vals.find((r) => r.metric === extreme);
    if (holder.unverified) { expect = rows.length; why = `the row count, because the ${extreme} leader is unverified and Gate 1 bars crowning it`; }
    else { expect = extreme; why = `the crowned leader, which is label-verified`; }
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
  const r = rowVal(h, 'Caffeine');
  if (!r) { failures.push(`compare/${f}: no Caffeine row to check the title against`); continue; }
  const x = num(r[0]), y = num(r[1]);
  const m = t.match(/: (\d+(?:\.\d+)?) vs (\d+(?:\.\d+)?) mg$/);
  titleClaims++;
  if (m) {
    if (parseFloat(m[1]) !== x || parseFloat(m[2]) !== y) {
      failures.push(`compare/${f}: title says ${m[1]} vs ${m[2]} mg, the table shows ${r[0]} / ${r[1]}`);
    }
  } else if (/ Compared$/.test(t)) {
    // The numberless form is only right when one of the cans publishes no figure.
    if (!Number.isNaN(x) && !Number.isNaN(y)) {
      failures.push(`compare/${f}: title omits the figures though both cans publish one (${r[0]} / ${r[1]})`);
    }
  } else {
    failures.push(`compare/${f}: title "${t}" matches neither compare form`);
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

totalClaims = compareClaims + caffeineClaims + guideClaims + discloseClaims + titleClaims;

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
  ['caffeine pages', caffeinePages, 'caffeine claims', caffeineClaims, 60],
  ['brand caffeine guides', Math.max(guidePages, EXPECTED_GUIDES.length), 'brand guide claims', guideClaims, 6],
  ['compare pages', disclosePages, 'sourcing-disclosure checks', discloseClaims, 150],
  ['titled pages', Object.values(titlePages).reduce((a, b) => a + b, 0), 'title claims', titleClaims, 190],
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
  `[${titled.map(([k, n]) => `${k} ${n}`).join(', ')}]).`
);
