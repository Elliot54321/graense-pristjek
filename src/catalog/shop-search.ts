/**
 * Links to a shop's own search, for items we have no price for there ("estimated").
 * We can't link to the product page - we don't know it - but the shop's search usually
 * finds it. Addresses checked by hand in a browser on 2026-11-13. Fleggaard and Calle
 * search only through JavaScript (no search address), so they get their front page.
 */
const SEARCH: Record<string, (q: string) => string> = {
  poetzsch: (q) => `https://www.poetzsch-padborg.dk/search?search=${q}`,
  bordershop: (q) => `https://www.bordershop.com/da/puttgarden/search?text=${q}`,
  "bordershop-rostock": (q) => `https://www.bordershop.com/da/rostock/search?text=${q}`,
  scandipark: (q) => `https://clickandcollect.scandipark.dk/?qs=${q}`,
};

/** Words that narrow a shop search too much ("i bøtte", "dåse"). */
const NOISE = new Set(["i", "med", "og", "på", "dåse", "dåser", "flaske", "flasker", "bøtte", "pose", "kasse", "pet", "export", "dpg"]);

/**
 * A short search term from our item name: the first two words without digits or noise
 * ("Haribo Matador i bøtte, 1000g" -> "Haribo Matador"). Shops word sizes differently,
 * so a short term finds more.
 */
export function searchTerm(label: string): string {
  const words = label
    .split(",")[0]
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !NOISE.has(w.toLowerCase()));
  return words.slice(0, 2).join(" ") || label;
}

/** The shop's search for the item, or null when the shop has no search address. */
export function shopSearchUrl(shopId: string, label: string): string | null {
  const make = SEARCH[shopId];
  return make ? make(encodeURIComponent(searchTerm(label))) : null;
}
