/**
 * Alternate artwork for a can we already track: a collab wrap, a seasonal
 * sleeve, a retailer exclusive. These are NOT products. Each one here has been
 * checked against the standard can's label and carries the same panel and the
 * same UPC, which is exactly why it gets a picture on the existing product page
 * instead of a record of its own — a second record would duplicate a row in
 * every table and ranking while describing the same liquid.
 *
 * If a wrap ever turns out to have its own panel, it stops belonging here and
 * becomes a normal product file.
 *
 * `image` is a filename in src/assets/products/ (and public/images/products/,
 * per the usual two-copy rule). Because no product's `image` field points at it,
 * it must also be listed in EDITION_IMAGES in scripts/check-data.mjs.
 */
export type Edition = {
  /** Product id this artwork belongs to, i.e. the JSON filename without .json. */
  productId: string;
  /** Composite filename in src/assets/products/. */
  image: string;
  /** Shown under the picture. Say plainly that the drink is unchanged. */
  caption: string;
};

export const editions: Edition[] = [
  {
    productId: 'happy-chocolatey-chip-latte',
    image: 'happy-chocolatey-chip-tates-edition.jpg',
    caption: "Limited-edition Tate's Bake Shop can (same product, same label).",
  },
];

export const editionsFor = (productId: string) => editions.filter((e) => e.productId === productId);
