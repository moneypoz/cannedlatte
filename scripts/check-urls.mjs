// Canonical / og:url / sitemap guard. Runs as `postbuild`, over dist/.
//
// Exists because build.format:'file' put a .html suffix on every canonical while the
// host 308-redirected those URLs to their clean form. A canonical naming a redirect
// instead of a 200 makes the page non-indexable, so the entire site was excluded from
// search while every page looked perfectly fine locally. Nothing in a normal build
// surfaces that, hence this check.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const SITE = 'https://cannedlatte.com';
// Pages that legitimately never appear in the sitemap.
const NOT_IN_SITEMAP = new Set([`${SITE}/404`]);

const failures = [];
const warnings = [];
// Google truncates around 155-160 characters. Over-length is a quality problem, not
// a correctness one, so it warns rather than failing a deploy.
const DESC_WARN_AT = 160;
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
};

/** The public URL a built file is actually served at: dist/best/x.html -> /best/x */
const publicUrl = (file) => {
  const rel = file.replace(/^dist\//, '').replace(/\.html$/, '');
  return rel === 'index' ? `${SITE}/` : `${SITE}/${rel}`;
};

const pages = existsSync('dist') ? walk('dist') : [];
const canonicals = new Set();
let checked = 0;
let described = 0;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  const og = (html.match(/<meta property="og:url" content="([^"]*)"/) || [])[1];
  const want = publicUrl(file);

  if (!canonical) {
    failures.push(`${file}: no <link rel="canonical">`);
    continue;
  }
  checked++;
  canonicals.add(canonical);

  // The three ways this has actually gone wrong, named separately so the message
  // says what to fix rather than just "mismatch".
  if (canonical.endsWith('.html')) {
    failures.push(`${file}: canonical points at a .html URL the host redirects — ${canonical}`);
  } else if (canonical !== `${SITE}/` && canonical.endsWith('/')) {
    failures.push(`${file}: canonical has a trailing slash but trailingSlash is 'never' — ${canonical}`);
  } else if (canonical !== want) {
    failures.push(`${file}: canonical is not self-referencing — says ${canonical}, page is served at ${want}`);
  }

  if (og && og !== canonical) {
    failures.push(`${file}: og:url (${og}) disagrees with canonical (${canonical})`);
  }

  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (desc) {
    described++;
    const n = decode(desc).length;
    if (n > DESC_WARN_AT) warnings.push(`${want} — meta description is ${n} chars`);
  }
}

// ---- sitemap must agree with the canonicals ----
const sitemapFile = existsSync('dist') && readdirSync('dist').find((f) => /^sitemap-\d+\.xml$/.test(f));
let locs = [];
if (sitemapFile) {
  const xml = readFileSync(`dist/${sitemapFile}`, 'utf8');
  locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) {
    if (loc.endsWith('.html')) failures.push(`sitemap lists a .html URL: ${loc}`);
  }
  // A sitemap URL that no page claims as its canonical is a URL we are asking Google
  // to index while telling it to prefer something else.
  const norm = (u) => (u === SITE ? `${SITE}/` : u);
  for (const loc of locs) {
    if (!canonicals.has(norm(loc))) failures.push(`sitemap lists ${loc}, but no page is canonical to it`);
  }
  const inSitemap = new Set(locs.map(norm));
  for (const c of canonicals) {
    if (!inSitemap.has(c) && !NOT_IN_SITEMAP.has(c)) failures.push(`${c} is a page canonical but is missing from the sitemap`);
  }
} else {
  failures.push('no dist/sitemap-N.xml — the sitemap integration did not run');
}

// ---- the zero-coverage guard ----
// A checker that inspected nothing must never report success.
for (const [what, n] of [['pages in dist/', pages.length], ['canonical tags', checked], ['sitemap URLs', locs.length]]) {
  if (n === 0) failures.push(`checked nothing: 0 ${what} — the check itself is broken, not the output`);
}

if (failures.length) {
  console.error(`\n  URL check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures.slice(0, 25)) console.error('   • ' + f);
  if (failures.length > 25) console.error(`   … and ${failures.length - 25} more`);
  console.error('');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`
  ${warnings.length} of ${described} meta descriptions exceed ${DESC_WARN_AT} characters (warning only):
`);
  for (const w of warnings.slice(0, 15)) console.warn('   ! ' + w);
  if (warnings.length > 15) console.warn(`   … and ${warnings.length - 15} more`);
  console.warn('');
}

console.log(
  `  URLs OK — ${checked} canonicals are extensionless, self-referencing and match og:url; ` +
  `${locs.length} sitemap URLs agree with them.` +
  (warnings.length ? ` ${warnings.length} long meta description(s) — see above.` : ` All ${described} meta descriptions within ${DESC_WARN_AT} chars.`)
);
