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

/** The last quantity in a product name, e.g. "Cava, 0,75L" or "Haribo ... 225g". */
export function quantityFromName(name: string): Quantity | null {
  return quantities(name).at(-1) ?? null;
}

/** All number + known unit pairs in a text, skipping things like "24 x". */
function quantities(text: string): Quantity[] {
  return [...text.replace(/\u00a0/g, " ").matchAll(QUANTITY)]
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
