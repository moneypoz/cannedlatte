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

// ---- caffeine pages: the headline mg must match the stat card on the page ----
let caffeineClaims = 0, caffeinePages = 0;
if (existsSync('dist/caffeine')) {
  for (const f of readdirSync('dist/caffeine')) {
    const h = readFileSync('dist/caffeine/' + f, 'utf8');
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

totalClaims = compareClaims + caffeineClaims;

// ---- the zero-coverage guard ----
const groups = [
  ['compare pages', comparePages, 'compare claims', compareClaims, 1],
  ['caffeine pages', caffeinePages, 'caffeine claims', caffeineClaims, 1],
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
  `(${compareClaims} across ${comparePages} compare pages, ${caffeineClaims} across ${caffeinePages} caffeine pages).`
);
