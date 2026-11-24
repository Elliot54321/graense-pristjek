/**
 * Forgiving search matching (2026-11-18): every query word on its own, in any order, ignoring
 * punctuation, accents, Danish spelling variants and simple Danish endings. Plain functions with
 * no server imports, so scripts can run them on the same data the site uses.
 *
 * Both the query and the family names go through searchKey() and stem(), so they meet halfway:
 *   "Wrigley's" / "wrigleys"           -> "wrigley"
 *   "Jägermeister" / "jaegermeister"   -> "jagermeister"
 *   "rødvin" / "rodvin" / "roedvin"    -> "rodvin"
 *   "Ålborg" / "aalborg"               -> "alborg"
 *   "karameller" / "karamel"           -> "karamel"
 * Typos ("stagertee" for "jagertee") are left to the trigram fallback in data.ts.
 */

/**
 * Lowercase, accents off, Danish/German letters and their two-letter spellings folded to one
 * letter (æ/ae/ä -> a, ø/oe/ö -> o, å/aa -> a, ü/ue -> u), apostrophes removed ("d'Or" -> "dor"),
 * other punctuation as spaces ("Coca-Cola" -> "coca cola").
 */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "a")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ä -> a, é -> e, ü -> u, ...
    .replace(/['´`’]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/aa|ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

/** Danish/English endings, longest first; a stem keeps at least 3 letters. */
const ENDINGS = ["erne", "ene", "er", "en", "et", "e", "s"];

/** "karameller" -> "karamel", "linser" -> "lins", "wrigleys" -> "wrigley". Expects a searchKey() word. */
export function stem(word: string): string {
  if (/\d/.test(word)) return word; // sizes and percentages: "0 33", "40%"
  let w = word;
  for (const end of ENDINGS) {
    if (w.endsWith(end) && w.length - end.length >= 3) {
      w = w.slice(0, -end.length);
      break;
    }
  }
  // "karamell" -> "karamel": a doubled last consonant is left by "-er".
  return w.length > 3 && w.at(-1) === w.at(-2) && !/[aeiouy]/.test(w.at(-1)!) ? w.slice(0, -1) : w;
}

export interface SearchFamily {
  id: number;
  name: string;
  category: string;
  search_words: string[] | null;
}

/** A family with its name and search words prepared once (cached with the family list). */
export interface IndexedFamily {
  id: number;
  name: string;
  category: string;
  /** searchKey() of the name. */
  key: string;
  /** Stems of the name's words. */
  words: string[];
  /** Stems of the search words. */
  searchWords: string[];
}

export function indexFamily(f: SearchFamily): IndexedFamily {
  const key = searchKey(f.name);
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    key,
    words: key.split(" ").filter(Boolean).map(stem),
    searchWords: (f.search_words ?? []).flatMap((w) => searchKey(w).split(" ").filter(Boolean).map(stem)),
  };
}

/**
 * A family as one small row for the shared remote cache (data.ts searchRows, 2026-11-23): id, name,
 * category and its search-word stems as one string - deduplicated, and without stems that are
 * already name words (those match as name words first, see wordMatch), so it matches exactly
 * like indexFamily(). The name's key and words are cheap to rebuild per server instance.
 */
export type SearchRow = [id: number, name: string, category: string, searchWords: string];

export function compactFamily(f: SearchFamily): SearchRow {
  const indexed = indexFamily(f);
  const extra = [...new Set(indexed.searchWords)].filter((w) => !indexed.words.includes(w));
  return [f.id, f.name, f.category, extra.join(" ")];
}

export function indexRow([id, name, category, searchWords]: SearchRow): IndexedFamily {
  const key = searchKey(name);
  return { id, name, category, key, words: key.split(" ").filter(Boolean).map(stem), searchWords: searchWords ? searchWords.split(" ") : [] };
}

/** How one query word matches: 3 = a name word, 2 = a search word, 1 = the start of a name word, 0 = not. */
function wordMatch(q: string, f: IndexedFamily): 0 | 1 | 2 | 3 {
  if (f.words.includes(q)) return 3;
  if (f.searchWords.includes(q)) return 2;
  // Short words only as whole words: "øl" (-> "ol") must not match "olivenolie".
  if (q.length >= 3 && f.words.some((w) => w.startsWith(q))) return 1;
  return 0;
}

/** The query prepared once: its key and the stems of its words. */
export function prepareQuery(query: string): { key: string; words: string[] } {
  const key = searchKey(query);
  return { key, words: [...new Set(key.split(" ").filter(Boolean).map(stem))] };
}

/**
 * How well a family matches, or null if it doesn't:
 *   100 the whole name, 60 the name starts with the query ("faxe" -> "Faxe Kondi"),
 *   45 every word is a name word, 35 ... or a search word ("øl"), 15 some only as the start of a
 *   word ("kaffe" in "kaffebæger"), 5 all but one word of a 3+ word query
 *   ("toms pariser linser karameller" -> "Toms Pariser Linser").
 */
/** matchScore() for a match missing one query word; data.ts ranks these after every full match. */
export const PARTIAL_MATCH = 5;

export function matchScore(f: IndexedFamily, q: { key: string; words: string[] }): number | null {
  if (!q.words.length) return null;
  if (f.key === q.key) return 100;
  if (f.key.startsWith(`${q.key} `)) return 60;
  const matches = q.words.map((w) => wordMatch(w, f));
  const missed = matches.filter((m) => m === 0).length;
  if (missed === 0) {
    if (matches.every((m) => m === 3)) return 45;
    if (matches.every((m) => m >= 2)) return 35;
    return 15;
  }
  if (missed === 1 && q.words.length >= 3) return PARTIAL_MATCH;
  return null;
}
