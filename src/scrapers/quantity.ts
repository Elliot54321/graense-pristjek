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

/** Parse "0,33 liter", "500 g", "7.92 liter" into a normalized quantity. */
export function parseQuantity(text: string | null | undefined): Quantity | null {
  if (!text) return null;
  const m = text.replace(/ /g, " ").match(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/);
  if (!m) return null;
  const amount = parseDecimal(m[1]);
  const unit = UNIT_FACTORS[m[2].toLowerCase()];
  if (amount === null || !unit) return null;
  // Round away float noise such as 0.33 * 0.01.
  return { amount: Math.round(amount * unit[1] * 1e6) / 1e6, unit: unit[0] };
}
