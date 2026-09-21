// Canonical / og:url / sitemap / social-card guard. Runs as `postbuild`, over dist/.
//
// Exists because build.format:'file' put a .html suffix on every canonical while the
// host 308-redirected those URLs to their clean form. A canonical naming a redirect
// instead of a 200 makes the page non-indexable, so the entire site was excluded from
// search while every page looked perfectly fine locally. Nothing in a normal build
// surfaces that, hence this check.
//
// The social-card group below is here for the same reason. Ahrefs flagged all ~217
// pages for an incomplete Open Graph set and a missing X card, and every one of
// those tags lives in <head>: no amount of looking at the rendered page reveals a
// broken one. The tag that fails silently is og:image — a card naming a path that
// 404s looks exactly like a card that works until somebody pastes the link, and by
// then the network that scraped it has cached the miss. So the check does not stop
// at "the tag is present": it resolves the URL back to a file in dist/.
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

// ---- social-card vocabulary ----
// Every page must carry all of these. og:url is checked against the canonical
// separately above; it is listed here too so a page that lost the whole block is
// reported as one missing set rather than as eight unrelated problems.
const SOCIAL_TAGS = [
  ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:type'],
  ['property', 'og:url'], ['property', 'og:image'], ['property', 'og:image:alt'],
  ['name', 'twitter:card'], ['name', 'twitter:title'],
  ['name', 'twitter:description'], ['name', 'twitter:image'],
];
const OG_TYPES = new Set(['website', 'article']);
const TWITTER_CARDS = new Set(['summary', 'summary_large_image']);
// X refuses an image below 144x144 for either card type and crops
// summary_large_image to 1.91:1, so a card image has to clear both.
const MIN_CARD_PX = 144;

const meta = (html, attr, key) =>
  (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)) || [])[1];

/** dist/ path behind an absolute on-site URL, or null when it points off-site. */
const localFile = (url) => {
  if (!url || !url.startsWith(`${SITE}/`)) return null;
  const rel = decodeURIComponent(url.slice(SITE.length + 1)).split(/[?#]/)[0];
  return rel ? `dist/${rel}` : null;
};

/** Pixel size straight out of the file header. Deliberately not via sharp: this
 *  checker has run on nothing but node:fs since it was written, and a guard that
 *  can be disabled by an unrelated dependency going missing is not a guard. */
const imageSize = (file) => {
  const b = readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };           // PNG IHDR
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {                // JPEG: walk to an SOF
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
};

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
let socialSets = 0;        // pages carrying the full tag set
let ogImageChecks = 0;     // og:image URLs resolved to a file on disk
const cardFiles = new Set();

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

  // ---- the social card ----
  const missing = SOCIAL_TAGS.filter(([attr, key]) => !meta(html, attr, key)).map(([, key]) => key);
  if (missing.length) {
    failures.push(`${file}: social tags missing — ${missing.join(', ')}`);
  } else {
    socialSets++;
  }

  const ogType = meta(html, 'property', 'og:type');
  if (ogType && !OG_TYPES.has(ogType)) {
    failures.push(`${file}: og:type is "${ogType}" — expected one of ${[...OG_TYPES].join(', ')}`);
  }
  const card = meta(html, 'name', 'twitter:card');
  if (card && !TWITTER_CARDS.has(card)) {
    failures.push(`${file}: twitter:card is "${card}" — expected one of ${[...TWITTER_CARDS].join(', ')}`);
  }

  // The two image tags name one picture. They are emitted from one variable, so a
  // disagreement means somebody edited one of them by hand.
  const ogImage = meta(html, 'property', 'og:image');
  const twImage = meta(html, 'name', 'twitter:image');
  if (ogImage && twImage && ogImage !== twImage) {
    failures.push(`${file}: twitter:image (${twImage}) disagrees with og:image (${ogImage})`);
  }

  // og:image has to be absolute and has to be a real file. A crawler does not
  // resolve a relative src against the page, and it does not come back to re-check
  // a 404, so both of these are permanent once a link has been shared.
  if (ogImage) {
    if (!/^https?:\/\//.test(ogImage)) {
      failures.push(`${file}: og:image is not an absolute URL — ${ogImage}`);
    } else if (!ogImage.startsWith(`${SITE}/`)) {
      failures.push(`${file}: og:image is hosted off-site, so nothing here can prove it exists — ${ogImage}`);
    } else {
      const local = localFile(ogImage);
      if (!existsSync(local)) {
        failures.push(`${file}: og:image ${ogImage} is not in the build — no ${local}`);
      } else {
        ogImageChecks++;
        cardFiles.add(local);
        const size = imageSize(local);
        if (!size) {
          failures.push(`${file}: og:image ${local} is not a PNG or JPEG a card renderer will accept`);
        } else {
          if (size.w < MIN_CARD_PX || size.h < MIN_CARD_PX) {
            failures.push(`${file}: og:image ${local} is ${size.w}x${size.h} — under the ${MIN_CARD_PX}px floor X requires`);
          }
          // Declared dimensions are a promise about the file. A card renderer that
          // trusts them and finds something else reserves the wrong box.
          const dw = meta(html, 'property', 'og:image:width');
          const dh = meta(html, 'property', 'og:image:height');
          if (dw && dh && (Number(dw) !== size.w || Number(dh) !== size.h)) {
            failures.push(`${file}: og:image:width/height say ${dw}x${dh}, ${local} is ${size.w}x${size.h}`);
          }
        }
      }
    }
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
// The social group's floor is the page count, not 1. Every page emits its card from
// one layout, so anything short of "all of them" means the selectors above stopped
// matching what Base.astro renders — the same near-blindness that let a group in
// check-claims.mjs fall from 45 claims to 6 and still report a pass.
if (pages.length > 0) {
  if (socialSets < pages.length) {
    failures.push(
      `only ${socialSets} of ${pages.length} pages parsed a full social tag set — ` +
      `if the pages are fine, this checker's meta selectors are broken`,
    );
  }
  if (ogImageChecks < pages.length) {
    failures.push(
      `resolved only ${ogImageChecks} og:image URLs to files across ${pages.length} pages — ` +
      `every page is supposed to name one`,
    );
  }
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
  `${locs.length} sitemap URLs agree with them. ` +
  `${socialSets} pages carry a complete Open Graph + X card set, and their ${ogImageChecks} og:image URLs ` +
  `all resolve to one of ${cardFiles.size} real image file(s) in dist/.` +
  (warnings.length ? ` ${warnings.length} long meta description(s) — see above.` : ` All ${described} meta descriptions within ${DESC_WARN_AT} chars.`)
);
