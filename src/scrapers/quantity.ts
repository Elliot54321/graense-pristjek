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
