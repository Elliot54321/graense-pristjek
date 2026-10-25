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
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/;

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

  const percents = new Set(
    items.map((i) => i.name.match(PERCENT)?.[1]).filter(Boolean).map((p) => Number(p!.replace(",", "."))),
  );
  if (percents.size > 1 && Math.max(...percents) - Math.min(...percents) > 0.5) doubts.push("alcohol % differs");

  const sized = items.filter((i) => i.contentAmount !== null && Number(i.contentAmount) > 0);
  const units = new Set(sized.map((i) => i.contentUnit));
  const amounts = sized.map((i) => Number(i.contentAmount));
  if (units.size > 1 || (amounts.length > 1 && Math.max(...amounts) / Math.min(...amounts) > 1 + SIZE_TOLERANCE)) {
    doubts.push("size differs");
  }
  return doubts;
}
