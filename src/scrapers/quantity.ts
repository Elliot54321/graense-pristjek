import type { Quantity } from "./types";

/** Parse a Danish/German decimal like "0,33" or "7.92". */
export function parseDecimal(text: string): number | null {
  const n = Number(text.trim().replace(/\s/g, "").replace(",", "."));
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
