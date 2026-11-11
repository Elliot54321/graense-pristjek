/**
 * Shared rules for when an LLM link between shop products is safe to save.
 * A wrong link gives a wrong "cheapest" answer, so any doubt turns a link into a
 * suggestion for the review page instead.
 */

/** Highest/lowest price above this ratio across shops -> doubt. */
export const PRICE_OUTLIER = 1.4;
/** Contents further apart than this (as a fraction) are a different pack. */
export const SIZE_TOLERANCE = 0.05;
const BOTTLE = /flask|flaske|\bfl\b|\bpet\b|bottle/i;
const GIFT_BOX = /gaveæske|gave-?pakning|gift ?box|geschenk/i;
const PERCENT = /(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?)\s*)?%/;
const num = (s: string) => Number(s.replace(",", "."));
/** "0,7-1 l." - a newsletter price for several bottle sizes; unclear which one the price is for. */
const SIZE_RANGE = /\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*(?:l|cl|ml|kg|g)\b/i;

/**
 * Alcohol strength printed in a name, as a range: "40%" -> 40-40. Newsletters print
 * one price for several drinks with a range ("Baileys 1 l. 17-37,5%"), which fits any
 * strength inside it.
 */
function strength(name: string): { lo: number; hi: number } | null {
  const m = name.match(PERCENT);
  if (!m) return null;
  const a = num(m[1]);
  const b = m[2] ? num(m[2]) : a;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

/**
 * Family names that group unrelated products ("Andre spiritus A-F" once lumped
 * bourbon, vodka and port together - nonsense for price per liter).
 */
const CATCH_ALL = /^(andre|anden|diverse|øvrige|blandede? varer|forskellige|misc|other|various)\b|\b[a-zæøå]-[a-zæøå]$/i;

export function isCatchAllFamilyName(name: string): boolean {
  return CATCH_ALL.test(name.trim());
}

export interface LinkCandidate {
  shopId: string;
  name: string;
  contentAmount: number | null;
  contentUnit: string | null;
  price: number | undefined;
}

/** Reasons not to trust a link between these shop products; empty = safe. */
export function linkDoubts(items: LinkCandidate[], confidence: "high" | "medium" | "low"): string[] {
  const doubts: string[] = [];
  if (confidence === "low") doubts.push("low confidence");

  const shops = new Set(items.map((i) => i.shopId));
  const prices = items.map((i) => i.price).filter((p): p is number => p !== undefined);
  const ratio = prices.length > 1 ? Math.max(...prices) / Math.min(...prices) : 1;
  if (shops.size > 1 && ratio > PRICE_OUTLIER) doubts.push(`price differs ${Math.round((ratio - 1) * 100)}%`);

  const bottles = items.filter((i) => BOTTLE.test(i.name)).length;
  if (bottles && bottles < items.length) doubts.push("bottle vs can");
  const gifts = items.filter((i) => GIFT_BOX.test(i.name)).length;
  if (gifts && gifts < items.length) doubts.push("gift box vs plain");

  // Strengths that can't all be the same drink: the highest lower bound is above the lowest upper bound.
  const strengths = items.map((i) => strength(i.name)).filter((s): s is { lo: number; hi: number } => s !== null);
  if (strengths.length > 1 && Math.max(...strengths.map((s) => s.lo)) - Math.min(...strengths.map((s) => s.hi)) > 0.5) {
    doubts.push("alcohol % differs");
  }

  if (items.some((i) => SIZE_RANGE.test(i.name))) doubts.push("size range in offer");

  const sized = items.filter((i) => i.contentAmount !== null && Number(i.contentAmount) > 0);
  const units = new Set(sized.map((i) => i.contentUnit));
  const amounts = sized.map((i) => Number(i.contentAmount));
  if (units.size > 1 || (amounts.length > 1 && Math.max(...amounts) / Math.min(...amounts) > 1 + SIZE_TOLERANCE)) {
    doubts.push("size differs");
  }
  return doubts;
}
