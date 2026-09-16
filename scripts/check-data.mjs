// Data-integrity guard. Runs as `prebuild`, so `npm run build` cannot ship a
// database that has drifted from the image files on disk.
//
// Exists because a rewrite script once omitted "image" from its key-order array
// and silently deleted the field from every product: the photos stayed on disk,
// nothing referenced them, and the build succeeded with no hero images at all.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const PRODUCTS = 'src/content/products';
const PUBLIC_IMG = 'public/images/products';
const ASSET_IMG = 'src/assets/products';

const jpgs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : []);
const failures = [];

// Images that are on disk on purpose without being any product's `image`:
// alternate-edition artwork and pictures used by editorial entries on /new.
// The orphan rule below exists to catch a renamed slug leaving a dead file
// behind, and it must keep doing that — so this is a named allowlist with a
// reason per file, never a pattern. Adding a file here is a deliberate act.
//
// These filenames are also referenced from src/lib/editions.ts and
// src/lib/news.ts, which this script cannot import (it is plain node, they are
// TypeScript). The reason strings below say which page renders each file, so a
// file that stops being used is findable by reading them.
const EDITION_IMAGES = new Map([
  [
    'happy-chocolatey-chip-tates-edition.jpg',
    "Tate's Bake Shop limited-edition artwork of happy-chocolatey-chip-latte — same SKU, same UPC, identical panel. Rendered on that product page as a secondary image.",
  ],
  [
    'happy-chocolatey-chip-tates-edition-card.png',
    "Cutout of the same can, used as the thumbnail on the Category news entry on /new.",
  ],
]);

const products = readdirSync(PRODUCTS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(`${PRODUCTS}/${f}`, 'utf8')) }));

const publicFiles = jpgs(PUBLIC_IMG);
const assetFiles = jpgs(ASSET_IMG);
const referenced = new Map(); // basename -> [product ids]

for (const { id, data } of products) {
  if (!data.image) continue;
  const base = data.image.split('/').pop();
  referenced.set(base, [...(referenced.get(base) ?? []), id]);
}

// (a) every referenced image must exist in both places: public/ backs the absolute
// JSON-LD URL, src/assets/ is what Astro processes into WebP.
for (const [base, ids] of referenced) {
  for (const [dir, files] of [[PUBLIC_IMG, publicFiles], [ASSET_IMG, assetFiles]]) {
    if (!files.includes(base)) {
      failures.push(`missing image: ${dir}/${base} — referenced by ${ids.join(', ')}`);
    }
  }
}

// (b) no photo may sit on disk unreferenced — this is the orphan check
for (const [dir, files] of [[PUBLIC_IMG, publicFiles], [ASSET_IMG, assetFiles]]) {
  for (const f of files) {
    if (!referenced.has(f) && !EDITION_IMAGES.has(f)) {
      failures.push(`orphaned image: ${dir}/${f} — referenced by no product, and not in EDITION_IMAGES`);
    }
  }
}

// (b2) card cutouts are optional, but one that matches no photographed product is
// dead weight and usually means a slug was renamed.
const CARD_IMG = 'src/assets/products/cards';
for (const f of jpgs(CARD_IMG)) {
  const base = f.replace(/-card\.(png|jpe?g|webp)$/i, '');
  if (EDITION_IMAGES.has(f)) continue;
  if (![...referenced.keys()].some((r) => r.replace(/\.[a-z]+$/i, '') === base)) {
    failures.push(`orphaned card crop: ${CARD_IMG}/${f} — no photographed product named ${base}, and not in EDITION_IMAGES`);
  }
}

// (b3) the allowlist itself must not rot. An entry naming a file that no longer
// exists means the exception outlived the image, and the next person to add an
// orphan would find a list they cannot trust.
const onDisk = new Set([...publicFiles, ...assetFiles, ...jpgs(CARD_IMG)]);
for (const [f, why] of EDITION_IMAGES) {
  if (!onDisk.has(f)) failures.push(`stale EDITION_IMAGES entry: ${f} is on no disk path — ${why}`);
}

// (c) a verified product must cite where the figures came from
for (const { id, data } of products) {
  if (data.verified && !(data.sources?.length > 0)) {
    failures.push(`verified but no sources: ${id}`);
  }
}

// (c1) published ranges.
//
// A source that publishes "70–80 mg" gives no single figure. The record stores the
// midpoint in caffeineMg, because rankings and per-ounce maths need one number per
// can, and stores both ends so the page and its <title> can state what was actually
// published. The failure this guards against is the half-populated state: a note
// that describes a range while the structured fields are absent renders a title
// asserting the midpoint as though it were printed — the false precision that
// prompted these fields. That must stop a build rather than sit unnoticed.
const RANGE_IN_NOTE = /(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*mg/;
let rangeRecords = 0;
for (const { id, data } of products) {
  const lo = data.caffeineMinMg ?? null;
  const hi = data.caffeineMaxMg ?? null;
  const noted = data.caffeineNote ? RANGE_IN_NOTE.exec(data.caffeineNote) : null;

  if ((lo == null) !== (hi == null)) {
    failures.push(`half a range: ${id} has ${lo == null ? 'caffeineMaxMg' : 'caffeineMinMg'} only — populate both or neither`);
    continue;
  }
  if (lo == null) {
    // The loud failure: the note talks about a range, the fields to render it are missing.
    if (noted) {
      failures.push(
        `${id}: caffeineNote states a ${noted[1]}–${noted[2]} mg range but caffeineMinMg/caffeineMaxMg are unset, ` +
        `so its title would assert the ${data.caffeineMg} mg midpoint as a published figure`,
      );
    }
    continue;
  }

  rangeRecords++;
  if (!(lo < hi)) failures.push(`${id}: caffeineMinMg ${lo} is not below caffeineMaxMg ${hi}`);
  if (data.caffeineMg == null) {
    failures.push(`${id}: has a ${lo}–${hi} mg range but no caffeineMg midpoint for rankings to sort on`);
  } else if (!(lo <= data.caffeineMg && data.caffeineMg <= hi)) {
    failures.push(`${id}: caffeineMg ${data.caffeineMg} sits outside its own ${lo}–${hi} mg range`);
  }
  // The range has to be the one the note cites, or one of the two is out of date.
  if (noted && (parseFloat(noted[1]) !== lo || parseFloat(noted[2]) !== hi)) {
    failures.push(`${id}: fields say ${lo}–${hi} mg, caffeineNote says ${noted[1]}–${noted[2]} mg`);
  }
}

// (c2) every brand caffeine guide declared in src/lib/products.ts must have a page.
// The map is read out of the TypeScript by regex because this script is plain node
// and cannot import it. An entry with no src/pages/caffeine/<slug>.astro behind it
// puts a dead link on that brand's hub, on each of its product pages and on each of
// its per-flavor caffeine pages at once — the one failure mode worth a build stop.
const PRODUCTS_TS = 'src/lib/products.ts';
const productsTs = existsSync(PRODUCTS_TS) ? readFileSync(PRODUCTS_TS, 'utf8') : '';
const guideBlock = (productsTs.match(/brandCaffeineGuides[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] ?? '';
if (productsTs && !guideBlock) {
  failures.push(`could not read brandCaffeineGuides out of ${PRODUCTS_TS} — this check is broken, not the data`);
}
for (const [, slug] of guideBlock.matchAll(/slug:\s*'([^']+)'/g)) {
  if (!existsSync(`src/pages/caffeine/${slug}.astro`)) {
    failures.push(`brandCaffeineGuides lists "${slug}" but src/pages/caffeine/${slug}.astro does not exist`);
  }
}

// (d) the two image directories must stay in lockstep
if (publicFiles.length !== assetFiles.length) {
  failures.push(`image count drift: ${PUBLIC_IMG} has ${publicFiles.length}, ${ASSET_IMG} has ${assetFiles.length}`);
}

// A checker that inspected nothing must never report success. Without this, an
// empty glob or a renamed directory reads as "no problems found".
const coverage = [
  ['products parsed', products.length],
  ['photos referenced by a product', referenced.size],
  ['images on disk in public/', publicFiles.length],
  ['images on disk in src/assets/', assetFiles.length],
  ['range-sourced records inspected', rangeRecords],
];
for (const [what, n] of coverage) {
  if (n === 0) failures.push(`checked nothing: 0 ${what} — the check itself is broken, not the data`);
}

if (failures.length) {
  console.error(`\n  Data integrity check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error('   • ' + f);
  console.error('');
  process.exit(1);
}

console.log(
  `  Data integrity OK — ${products.length} products, ${referenced.size} photos referenced, ` +
  `${publicFiles.length} on disk in each location, ` +
  `${EDITION_IMAGES.size} allowed edition/news image(s), ` +
  `${rangeRecords} range-sourced record(s) with min <= midpoint <= max.`
);
