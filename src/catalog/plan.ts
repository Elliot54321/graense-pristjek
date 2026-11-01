/**
 * Shopping plans per trip, from the per-shop basket prices: the best single shop
 * in the area, and - when the area has several shops - the cheapest split, buying
 * each item where it's cheapest. A split is used when it covers items the single
 * shop lacks, or else when it saves at least MIN_SPLIT_SAVING, since every extra
 * stop takes time.
 *
 * Items a trip lacks are counted at the highest price found in any other shop and
 * marked as estimates, so trips stay comparable: otherwise a trip missing an
 * expensive item would look cheapest just because its total leaves it out.
 */
import { AREAS, type Area } from "./trips";
import type { ShopResult } from "./types";

export const MIN_SPLIT_SAVING = 50;

export interface SplitStop {
  shopId: string;
  shopName: string;
  /** Basket item labels bought here. */
  items: string[];
  cost: number;
}

export interface TripPlan {
  area: Area;
  /** The best single shop: lowest total with missing items at their estimate. */
  single: ShopResult;
  /** Cheapest split across the area's shops, when it beats the single shop by MIN_SPLIT_SAVING. */
  split: { total: number; saving: number; stops: SplitStop[] } | null;
  /** Total for the plan we recommend (split if suggested, else the single shop). */
  total: number;
  /** Basket items no shop in the area has, with the estimate used (null if no shop anywhere has it). */
  missing: { label: string; estimate: number | null }[];
  /** Plan total plus the estimates for missing items - what trips are ranked by. */
  totalWithEstimates: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function planTrips(results: ShopResult[]): TripPlan[] {
  // Highest price per basket item across all shops, for estimating missing items.
  const highest = (results[0]?.lines ?? []).map((_, i) => {
    const costs = results.flatMap((r) => (r.lines[i].cost === null ? [] : [r.lines[i].cost!]));
    return costs.length ? Math.max(...costs) : null;
  });
  const plans: TripPlan[] = [];
  for (const area of AREAS) {
    const shops = results.filter((r) => area.shops.includes(r.shop.id));
    if (!shops.length) continue;
    // Best single shop: lowest total once its missing items are counted at the estimate.
    const shopFull = (r: ShopResult) => r.total + r.lines.reduce((sum, l, i) => sum + (l.cost === null ? (highest[i] ?? 0) : 0), 0);
    const single = [...shops].sort((a, b) => shopFull(a) - shopFull(b))[0];

    // Each item from the shop where it's cheapest (lines are in basket order in every shop).
    const stops = new Map<string, SplitStop>();
    const missing: TripPlan["missing"] = [];
    single.lines.forEach((line, i) => {
      const offers = shops
        .map((s) => ({ shop: s.shop, cost: s.lines[i].cost }))
        .filter((o): o is { shop: ShopResult["shop"]; cost: number } => o.cost !== null)
        .sort((a, b) => a.cost - b.cost);
      if (!offers.length) return missing.push({ label: line.label, estimate: highest[i] });
      const best = offers[0];
      const stop = stops.get(best.shop.id) ?? { shopId: best.shop.id, shopName: best.shop.name, items: [], cost: 0 };
      stop.items.push(line.label);
      stop.cost = round(stop.cost + best.cost);
      stops.set(best.shop.id, stop);
    });
    const splitTotal = round([...stops.values()].reduce((sum, s) => sum + s.cost, 0));

    // Compare like with like: both sides count their missing items at the estimate.
    const singleMissing = single.lines.flatMap((l, i) => (l.cost === null ? [{ label: l.label, estimate: highest[i] }] : []));
    const withEstimates = (total: number, m: TripPlan["missing"]) => round(total + m.reduce((sum, x) => sum + (x.estimate ?? 0), 0));
    const singleFull = withEstimates(single.total, singleMissing);
    const splitFull = withEstimates(splitTotal, missing);
    const saving = round(singleFull - splitFull);
    // An item another shop here sells is bought there, not estimated - so a split
    // that covers more items is always used; otherwise only when it saves enough.
    const coversMore = missing.length < singleMissing.length;
    const split =
      stops.size > 1 && (coversMore || saving >= MIN_SPLIT_SAVING)
        ? { total: splitTotal, saving: coversMore ? 0 : saving, stops: [...stops.values()].sort((a, b) => b.cost - a.cost) }
        : null;

    const total = split ? split.total : single.total;
    const planMissing = split ? missing : singleMissing;
    plans.push({ area, single, split, total, missing: planMissing, totalWithEstimates: split ? splitFull : singleFull });
  }
  return plans;
}
