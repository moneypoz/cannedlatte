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
    if (!referenced.has(f)) failures.push(`orphaned image: ${dir}/${f} — referenced by no product`);
  }
}

// (b2) card cutouts are optional, but one that matches no photographed product is
// dead weight and usually means a slug was renamed.
const CARD_IMG = 'src/assets/products/cards';
for (const f of jpgs(CARD_IMG)) {
  const base = f.replace(/-card\.(png|jpe?g|webp)$/i, '');
  if (![...referenced.keys()].some((r) => r.replace(/\.[a-z]+$/i, '') === base)) {
    failures.push(`orphaned card crop: ${CARD_IMG}/${f} — no photographed product named ${base}`);
  }
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

if (failures.length) {
  console.error(`\n  Data integrity check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error('   • ' + f);
  console.error('');
  process.exit(1);
}

console.log(
  `  Data integrity OK — ${products.length} products, ${referenced.size} photos referenced, ` +
  `${publicFiles.length} on disk in each location.`
);
