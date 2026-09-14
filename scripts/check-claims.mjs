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

/** Read a two-column spec row, tolerating Astro's data-astro-cid attributes. */
const rowVal = (html, label) => {
  const m = html.match(new RegExp(`<th[^>]*>${label}<\\/th>\\s*<td[^>]*>([^<]*)<\\/td>\\s*<td[^>]*>([^<]*)<\\/td>`));
  return m ? [m[1].trim(), m[2].trim()] : null;
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
    // "<name> has about N mg of caffeine" — the direct answer, first sentence.
    const claim = body.match(/has about (\d+) mg of caffeine/);
    const stat = h.match(/<div class="n"[^>]*>(\d+) mg<\/div>/);
    if (claim && stat) {
      caffeineClaims++;
      if (parseInt(claim[1], 10) !== parseInt(stat[1], 10)) {
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

totalClaims = compareClaims + caffeineClaims + guideClaims;

// ---- the zero-coverage guard ----
// The guide row counts declared guides, not discovered ones, so "no guide pages
// were found" fails here instead of skipping the row.
const groups = [
  ['compare pages', comparePages, 'compare claims', compareClaims, 1],
  ['caffeine pages', caffeinePages, 'caffeine claims', caffeineClaims, 1],
  ['brand caffeine guides', Math.max(guidePages, EXPECTED_GUIDES.length), 'brand guide claims', guideClaims, 6],
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

console.log(
  `  Claims OK — ${totalClaims} numeric claims cross-checked against their own tables ` +
  `(${compareClaims} across ${comparePages} compare pages, ${caffeineClaims} across ${caffeinePages} caffeine pages, ` +
  `${guideClaims} across ${guidePages} brand caffeine guide${guidePages === 1 ? '' : 's'}).`
);
