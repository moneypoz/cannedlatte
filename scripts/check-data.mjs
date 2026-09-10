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
  `${EDITION_IMAGES.size} allowed edition/news image(s).`
);
