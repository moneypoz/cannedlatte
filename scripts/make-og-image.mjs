// Renders the site-default social card from its SVG source to the PNG the meta
// tags point at. Run by hand — `npm run og:image` — not by the build, because the
// output is committed: sharp picks whatever sans-serif the rendering machine has
// when DM Sans is not installed locally, and a card that quietly changes shape on
// somebody else's laptop is worse than one that changes only when asked.
//
// Both files are checked in. The PNG is what ships; the SVG is what you edit.
import { readFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'src/assets/social/og-default.svg';
const OUT = 'public/og/default.png';
const [W, H] = [1200, 630];

mkdirSync('public/og', { recursive: true });
const png = await sharp(Buffer.from(readFileSync(SRC)), { density: 96 })
  .resize(W, H, { fit: 'contain', background: '#fffdfa' })
  .png({ compressionLevel: 9 })
  .toBuffer();

const meta = await sharp(png).metadata();
if (meta.width !== W || meta.height !== H) {
  console.error(`  og:image render is ${meta.width}x${meta.height}, not ${W}x${H}`);
  process.exit(1);
}
const { writeFileSync } = await import('node:fs');
writeFileSync(OUT, png);
console.log(`  Wrote ${OUT} — ${meta.width}x${meta.height}, ${(png.length / 1024).toFixed(0)} KB, from ${SRC}`);
