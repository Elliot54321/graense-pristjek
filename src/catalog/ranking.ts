/**
 * Search ranking. Without real search data yet, "what people mean" is guessed from:
 *  - how the query matches (exact name > brand word first > whole word > search word > word prefix;
 *    search.ts), then fuzzy (typo) matches below all of them (data.ts)
 *  - whether the family is on the hand-made list of common border items
 *  - how generic the name is (fewer extra words), and whether it's a variant
 *    (alcohol-free, sugar-free) the user didn't ask for
 *  - availability: shops selling it and number of packs
 * Replace the guesses with real search/click data in Phase 5.
 */
import { COMMON_ITEMS } from "@/matching/common-items";
import type { IndexedFamily } from "./search";

const VARIANT = /\b(alkoholfri|alcohol ?free|0 0|sukkerfri|sugar ?free|light|zero|0 kalorier|0 kal)\b/;

/** 0 = not on the common list, 1 = common item, 2 = bestseller. */
export function commonTier(name: string): 0 | 1 | 2 {
  const hits = COMMON_ITEMS.filter((item) => item.include.test(name) && !item.exclude?.test(name));
  return hits.some((h) => h.bestseller) ? 2 : hits.length ? 1 : 0;
}

const TIER_BONUS = [0, 40, 65] as const;

/**
 * Cheap first pass on name and search words only, before prices are loaded. `text` is how the
 * query matches (matchScore() in search.ts); both sides are searchKey()-folded.
 */
export function preScore(f: IndexedFamily, q: { key: string; words: string[] }, text: number): number {
  const extraWords = Math.max(0, f.words.length - q.words.length);
  const variant = VARIANT.test(f.key) && !VARIANT.test(q.key) ? -12 : 0;
  return text + TIER_BONUS[commonTier(f.name)] - 4 * Math.min(extraWords, 5) + variant;
}

/** Final score: the first pass plus availability. */
export function finalScore(pre: number, shopCount: number, packCount: number): number {
  return pre + 8 * shopCount + 2 * Math.min(packCount, 5);
}
