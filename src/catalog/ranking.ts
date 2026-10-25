/**
 * Search ranking. Without real search data yet, "what people mean" is guessed from:
 *  - how the query matches (exact name > brand word first > whole word > search word > word prefix)
 *  - whether the family is on the hand-made list of common border items
 *  - how generic the name is (fewer extra words), and whether it's a variant
 *    (alcohol-free, sugar-free) the user didn't ask for
 *  - availability: shops selling it and number of packs
 * Replace the guesses with real search/click data in Phase 5.
 */
import { COMMON_ITEMS } from "@/matching/common-items";

/** Lowercase, hyphens and punctuation as spaces: "Coca-Cola" -> "coca cola". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[-–/&.,'´`’()]+/g, " ").replace(/\s+/g, " ").trim();
}

const VARIANT = /\b(alkoholfri|alcohol ?free|0[ ,.]0|sukkerfri|sugar ?free|light|zero|0 kalorier|0 kal)\b/;

/** 0 = not on the common list, 1 = common item, 2 = bestseller. */
export function commonTier(name: string): 0 | 1 | 2 {
  const hits = COMMON_ITEMS.filter((item) => item.include.test(name) && !item.exclude?.test(name));
  return hits.some((h) => h.bestseller) ? 2 : hits.length ? 1 : 0;
}

const TIER_BONUS = [0, 40, 65] as const;

/** How well the query matches the family's name and search words. */
export function textScore(familyName: string, searchWords: string[], query: string): number {
  const name = normalize(familyName);
  const q = normalize(query);
  const qWords = q.split(" ");
  const nameWords = name.split(" ");
  if (name === q) return 100;
  if (name.startsWith(`${q} `)) return 60; // the brand: "faxe" -> "Faxe Kondi ..."
  if (qWords.every((w) => nameWords.includes(w))) return 45; // "cola" in "Coca-Cola"
  const words = new Set(searchWords.map(normalize));
  if (qWords.every((w) => words.has(w))) return 35; // "øl" as a search word
  return 15; // only the start of a word, e.g. "kaffe" in "kaffebæger"
}

/** Cheap first pass on name and search words only, before prices are loaded. */
export function preScore(familyName: string, searchWords: string[], query: string): number {
  const name = normalize(familyName);
  const extraWords = Math.max(0, name.split(" ").length - normalize(query).split(" ").length);
  const variant = VARIANT.test(name) && !VARIANT.test(normalize(query)) ? -12 : 0;
  return textScore(familyName, searchWords, query) + TIER_BONUS[commonTier(familyName)] - 4 * Math.min(extraWords, 5) + variant;
}

/** Final score: the first pass plus availability. */
export function finalScore(pre: number, shopCount: number, packCount: number): number {
  return pre + 8 * shopCount + 2 * Math.min(packCount, 5);
}
