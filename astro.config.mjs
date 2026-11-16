import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';

const SITE = 'https://cannedlatte.com';
const DIST = new URL('./dist/', import.meta.url);

// <lastmod> comes from the page, not from here. Product pages, brand hubs and /best
// lists pass Base a `lastmod` — the newest `updated` stamp among the cans they render
// — which lands in the built HTML as <meta name="cl-lastmod">. The sitemap is written
// after every page, so serialize reads that tag back. Doing it this way keeps one
// definition of which cans a page holds (the page's own), instead of re-deriving
// bestPages' filters here. Pages without the tag get no <lastmod>: never a build or
// git time, which change on every deploy and teach Google to ignore the field.
const lastmodOf = (url) => {
  const rel = url === SITE || url === `${SITE}/` ? 'index' : url.slice(SITE.length + 1);
  const file = new URL(`${rel}.html`, DIST);
  if (!existsSync(file)) return null;
  return (readFileSync(file, 'utf8').match(/<meta name="cl-lastmod" content="(\d{4}-\d{2}-\d{2})"/) || [])[1] ?? null;
};

export default defineConfig({
  site: SITE,
  integrations: [
    sitemap({
      serialize(item) {
        const lastmod = lastmodOf(item.url);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
  trailingSlash: 'never',
  build: { format: 'file' },
});
