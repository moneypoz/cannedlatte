// Display-name helpers. Deliberately free of astro:content imports so tests and
// build-time checks can import this module directly under plain node.

/** Anything with a brand and a product name — avoids depending on the collection type. */
type Named = { brand: string; name: string };

/** Collapse an adjacent repeated word. The brand and the product name are stored
 *  separately and are each correct on their own, but concatenating "Throne Sport
 *  Coffee" with "Coffee Latte" reads as a typo. Case-insensitive, keeps the first
 *  spelling. Only one product in the database currently trips this. */
export const dedupeWords = (s: string) => s.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');

export const fullName = (p: Named) => dedupeWords(`${p.brand} ${p.name}`);

// Compact display name for tight UI (homepage tiles, matchup cards). Drops
// corporate suffixes and a trailing product-type word, but only while something
// meaningful is left — the full name still belongs in titles and on /latte.
export const shortName = (p: Named) => {
  const full = fullName(p);
  const s = full.replace(/\s+Coffee\s+(Company|Co\.)/i, '');
  const trimmed = s.replace(/\s+(Cold Brew Latte|Latte)$/i, '');
  // Deduped again: dropping a suffix from the middle can bring two identical
  // words together that weren't adjacent in the full name.
  const deduped = dedupeWords(trimmed);
  return deduped.split(/\s+/).length >= 2 ? deduped : s;
};
