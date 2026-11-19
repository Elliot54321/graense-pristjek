import type { Quantity } from "./types";

/**
 * Regex source for a price in shop text: "5,68", "7.92" or "1.142,79"
 * (a dot as thousands separator when a decimal comma follows).
 */
export const PRICE_NUMBER = String.raw`\d{1,3}(?:\.\d{3})+,\d+|\d+(?:[.,]\d+)?`;

/** Parse a Danish/German decimal like "0,33", "7.92" or "1.142,79". */
export function parseDecimal(text: string): number | null {
  let s = text.trim().replace(/\s/g, "");
  // With a decimal comma present, dots are thousands separators.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Unit spelling -> [base unit, factor to convert into it]. */
const UNIT_FACTORS: Record<string, [Quantity["unit"], number]> = {
  l: ["l", 1],
  liter: ["l", 1],
  ltr: ["l", 1],
  cl: ["l", 0.01],
  ml: ["l", 0.001],
  kg: ["kg", 1],
  g: ["kg", 0.001],
  gram: ["kg", 0.001],
  gr: ["kg", 0.001],
  stk: ["piece", 1],
};

const QUANTITY = new RegExp(`(${PRICE_NUMBER})\\s*([a-zA-Z]+)`, "g");

/** Parse "0,33 liter", "500 g", "7.92 liter", "1.250 gram" into a normalized quantity. */
export function parseQuantity(text: string | null | undefined): Quantity | null {
  return text ? quantities(text)[0] ?? null : null;
}

/**
 * Non-breaking spaces become spaces, and a stray space before a decimal comma is dropped:
 * BorderShop's "0 ,75 L" is 0,75 l, not 75 l (trust audit 2026-11-15).
 */
const tidy = (text: string) => text.replace(/\u00a0/g, " ").replace(/(\d) +([.,])(\d)/g, "$1$2$3");

const BONUS = new RegExp(`(${PRICE_NUMBER})\\s*([a-zA-Z]+)\\s*\\+\\s*(${PRICE_NUMBER})\\s*([a-zA-Z]+)`);

/**
 * The last quantity in a product name, e.g. "Cava, 0,75L" or "Haribo ... 225g". A bonus on
 * top counts too: "Nutella 450g +50g gratis" holds 500 g (not the last figure, 50 g).
 */
export function quantityFromName(name: string): Quantity | null {
  if (isCapacity(name)) return null;
  const bonus = tidy(name).match(BONUS);
  if (bonus) {
    const [main, extra] = [toQuantity(bonus[1], bonus[2]), toQuantity(bonus[3], bonus[4])];
    if (main && extra && main.unit === extra.unit) {
      return { amount: Math.round((main.amount + extra.amount) * 1e6) / 1e6, unit: main.unit };
    }
  }
  return quantities(name).at(-1) ?? null;
}

/** All number + known unit pairs in a text, skipping things like "24 x". */
function quantities(text: string): Quantity[] {
  return [...tidy(text).matchAll(QUANTITY)]
    .map((m) => toQuantity(m[1], m[2]))
    .filter((q): q is Quantity => q !== null);
}

function toQuantity(number: string, unitText: string): Quantity | null {
  const unit = UNIT_FACTORS[unitText.toLowerCase()];
  if (!unit) return null;
  // "1.250 gram" uses a dot as thousands separator; for g/ml a decimal with
  // exactly three digits after the dot would make no sense, so treat it as one.
  const thousands = unit[1] < 1 && /^\d{1,3}(?:\.\d{3})+$/.test(number);
  const amount = parseDecimal(thousands ? number.replace(/\./g, "") : number);
  if (amount === null) return null;
  // Round away float noise such as 0.33 * 0.01.
  return { amount: Math.round(amount * unit[1] * 1e6) / 1e6, unit: unit[0] };
}

/**
 * Price per liter / kg / piece, calculated from price and content. Shops'
 * own unit prices are sometimes missing or wrong, so we only fall back to
 * the shop's figure when the content is unknown.
 */
export function unitPrice(
  price: number,
  content: Quantity | null,
  shopUnitPrice: number | null,
): number | null {
  if (!content || content.amount <= 0) return shopUnitPrice;
  return Math.round((price / content.amount) * 100) / 100;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
// "18 - 24 x 0,33 l", "40 - 65 x 20 ml": a range of counts, one size.
const COUNT_RANGE = new RegExp(`(?:^|\\s)(${NUM})\\s*-\\s*(${NUM})\\s*[x×]\\s*(${NUM})\\s*(l|cl|ml|kg|g)\\b`, "i");
// "312-378 g.", "0,7-1 l.", "8 x 80-90 g.": a range of sizes (not "17-37,5%").
const SIZE_RANGE = new RegExp(`(?:^|\\s)(?:(\\d+)\\s*[x×]\\s*)?(${NUM})\\s*-\\s*(${NUM})\\s*(l|cl|ml|kg|g)\\b`, "i");

/**
 * The size range printed with a newsletter offer ("Kahlua 0,7-1 l. 16-30%" -> 0,7-1 l), as
 * whole-pack contents in l/kg; null without one. One price on a range means every size in it
 * sells at that price, so a matched product's size inside the range is a safe content for the
 * offer; outside it, the offer is another size and should be left to the estimate.
 * "Either/or" packs ("24 stk. el. 750-1000 ml.") give null.
 */
export function sizeRange(text: string): { min: number; max: number; unit: Quantity["unit"] } | null {
  const t = tidy(text);
  if (/\bel\./i.test(t)) return null;
  const counts = t.match(COUNT_RANGE);
  const sizes = counts ? null : t.match(SIZE_RANGE);
  const m = counts ?? sizes;
  if (!m) return null;
  const unit = UNIT_FACTORS[m[4].toLowerCase()];
  const n = (x: string) => parseDecimal(x)!;
  const [min, max] = counts
    ? [n(m[1]) * n(m[3]) * unit[1], n(m[2]) * n(m[3]) * unit[1]]
    : [Number(m[1] ?? 1) * n(m[2]) * unit[1], Number(m[1] ?? 1) * n(m[3]) * unit[1]];
  const r = (x: number) => Math.round(x * 1e6) / 1e6;
  return min > 0 && max >= min ? { min: r(min), max: r(max), unit: unit[0] } : null;
}

// ---------------------------------------------------------------------------------------
// Piece counts (shop_products.piece_count, 2026-11-19)

/** Words that count the pieces themselves: "70 stk.", "90tabs", "8 ruller", "25 vaske". */
// Singular and plural forms: "71 vasker", "1 rulle", "40 Wäschen", "30 Waschladungen".
const PIECE_WORDS = [
  String.raw`stk|styk|stykker|stück|stuck|st\.|pcs`,
  "ruller|rulle|roller|rolle|rollen|rl",
  "kapsler|kapsel|kapseln|caps|tabs|tabletter|tablet|tabl",
  "vasker|vaske|vask|wäschen|waschladungen|WL",
  "poser|pose|beutel|breve|brev|bind|bleer|ble|bleier|windeln",
  "tücher|servietter|serviet|klude|klud|pads|ark|stikker|sticks|æg|lys|sække|sæk|bags",
].join("|");
/** Words that count packs within the sold pack: "4 pakker", "10-pack", "Mentos 3er", "8-pk.". */
const PACK_WORDS = String.raw`pakker|pakke|pack|pak|pk|(?<=\d-?)er`;
/** Sheets or blades: the count only when nothing else is printed (razor blades), not "200 Blade" on toilet paper. */
const SHEET_WORDS = String.raw`blade|blatt`;

const counted = (words: string, flags = "gi") =>
  new RegExp(String.raw`(?<![\d,.])(?:(\d+)\s*[x×]\s*)?(\d{1,3}(?:\.\d{3})+|\d+)\s*-?\s*(?:${words})(?![a-zæøåäöü])\.?`, flags);
/** "16-60 stk.", "6-12 rl.": a range of counts. */
const COUNT_RANGE_BEFORE = /\d\s*-\s*$/;

function countsOf(text: string, words: string, flags?: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(counted(words, flags))) {
    if (COUNT_RANGE_BEFORE.test(text.slice(0, m.index))) return [NaN];
    // "1.200 Stk." uses a dot as thousands separator.
    const n = Number(m[2].replace(/\./g, "")) * (m[1] ? Number(m[1]) : 1);
    out.push(n);
  }
  return out;
}

/**
 * Pieces in one sold pack, from a name or printed pack text, or null when unknown or unsure:
 * "70 stk." 70, "4x56stk" 224, "6 x 8 ruller" 48, "70 vaske" 70 (washes count as pieces),
 * "Mentos 3er" 3, "24x85g" 24. Ranges ("16-60 stk."), either/or ("1 stk. el. 300 ml") and
 * two different counts of the same kind give null - a wrong count is worse than none.
 * Sizes are never counts ("Affaldssæk 50L 20styk" is 20; "3-lags" is not 3).
 */
export function pieceCount(text: string | null | undefined): number | null {
  if (!text) return null;
  // "3-lags" (ply) and "All-in-1" / "3-i-1" are no counts.
  const t = tidy(text).replace(/(\d+)\s*-\s*lags?\b/gi, " ").replace(/(?:\d+\s*-\s*)?\b(?:in|i)\s*-\s*\d+\b/gi, " ");
  if (/\sel\.\s/i.test(t)) return null;
  const pick = (ns: number[]) => {
    if (!ns.length) return undefined;
    const distinct = [...new Set(ns)];
    return distinct.length === 1 && Number.isInteger(distinct[0]) && distinct[0] > 0 && distinct[0] <= 10000 ? distinct[0] : null;
  };
  // Pieces first, then packs ("1er Cru" is a wine, so a pack word needs 2+), then "N x size".
  // "150St" with a capital S; "1st Edition" is not a count.
  const pieces = pick([...countsOf(t, PIECE_WORDS), ...countsOf(t, "St", "g")]);
  if (pieces !== undefined) return pieces;
  const packs = pick(countsOf(t, PACK_WORDS).filter((n) => n >= 2 || Number.isNaN(n)));
  if (packs !== undefined) return packs;
  const multi = [...t.matchAll(/(?<![\d,.])(\d+)\s*[x×]\s*(?:(\d+)\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|cl|ml)\b/gi)].map(
    (m) => Number(m[1]) * (m[2] ? Number(m[2]) : 1),
  );
  const fromMulti = pick(multi);
  if (fromMulti !== undefined) return fromMulti;
  return pick(countsOf(t, SHEET_WORDS)) ?? null;
}

/**
 * A listing's piece count: from its name, then other printed texts (a spec line), then a
 * content the shop gives in pieces ("Indhold: 70 stk.").
 */
export function listingPieces(name: string, content: Quantity | null, ...texts: (string | null | undefined)[]): number | null {
  for (const t of [name, ...texts]) {
    const n = pieceCount(t);
    if (n) return n;
  }
  return content?.unit === "piece" && Number.isInteger(content.amount) && content.amount > 0 ? content.amount : null;
}

/**
 * Bags and sacks print their capacity ("Affaldssæk 50L 20styk", "fryseposer 100er 1l"),
 * which is not the content of the pack.
 */
export function isCapacity(name: string): boolean {
  return /affald|skrald|fryse?pose|frostbeutel|müllbeutel|müllsäcke?|müllsack|sæk\b|sække\b/i.test(name) && !/bag[- ]?in[- ]?box/i.test(name);
}
