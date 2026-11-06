/**
 * Shopping options for a basket: every shop on its own, plus - per trip - the best
 * way to split the basket over several stores. One list, ranked by price.
 *
 * Price = basket + the extra driving between stores + the ferry, if the trip needs one.
 * The drive from home to the border is left out: it depends on where you live and is
 * the same whichever stores you pick on a trip, so it's shown as information only.
 * The ferry is the same for everyone, so its estimate is included (user decisions,
 * 2026-11-06).
 *
 * Items a store lacks keep the estimate from compare.ts (the highest price in any
 * other shop), so options stay comparable.
 */
import { AREAS, type Area, betweenStoresKm, ferryReturnDkk, storeName } from "./trips";
import type { LineResult, ShopResult } from "./types";

/** A split is only suggested when it saves at least this per extra store, after driving. */
export const MIN_SAVING_PER_EXTRA_STORE = 25;

export interface Stop {
  shopId: string;
  name: string;
  /** What to buy here (the shop's own lines; for a single shop also its estimated lines). */
  lines: LineResult[];
  cost: number;
}

export interface ShoppingOption {
  key: string;
  area: Area;
  stops: Stop[];
  /** Items no store in this option has, counted at their estimate (null: no shop has it). */
  missing: { label: string; estimate: number | null }[];
  /** Basket price, missing items at their estimate. */
  basket: number;
  betweenKm: number;
  betweenCost: number;
  /** Estimated same-day ferry return, 0 on trips without a ferry. */
  ferryCost: number;
  total: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** All subsets of at least two shops (a trip has at most four). */
function combinations<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << list.length; mask++) {
    const pick = list.filter((_, i) => mask & (1 << i));
    if (pick.length >= 2) out.push(pick);
  }
  return out;
}

/** Buy each item at the cheapest of these shops. */
function split(area: Area, shops: ShopResult[], krPerKm: number, ferryCost: number): Omit<ShoppingOption, "key"> {
  const stops = new Map<string, Stop>();
  const missing: ShoppingOption["missing"] = [];
  shops[0].lines.forEach((line, i) => {
    const best = shops
      .map((s) => ({ shop: s.shop, line: s.lines[i] }))
      .filter((o) => o.line.cost !== null)
      .sort((a, b) => a.line.cost! - b.line.cost!)[0];
    // No store here has it: every line carries the same estimate.
    if (!best) return missing.push({ label: line.label, estimate: line.estimate });
    const stop = stops.get(best.shop.id) ?? { shopId: best.shop.id, name: storeName(area, best.shop), lines: [], cost: 0 };
    stop.lines.push(best.line);
    stop.cost = round(stop.cost + best.line.cost!);
    stops.set(best.shop.id, stop);
  });
  const used = [...stops.values()].sort((a, b) => b.cost - a.cost);
  const betweenKm = betweenStoresKm(area, used.map((s) => s.shopId));
  const betweenCost = round(betweenKm * krPerKm);
  const basket = round(used.reduce((sum, s) => sum + s.cost, 0) + missing.reduce((sum, m) => sum + (m.estimate ?? 0), 0));
  return { area, stops: used, missing, basket, betweenKm, betweenCost, ferryCost, total: round(basket + betweenCost + ferryCost) };
}

export function shoppingOptions(results: ShopResult[], krPerKm: number): ShoppingOption[] {
  const options: ShoppingOption[] = [];
  for (const area of AREAS) {
    const shops = results.filter((r) => area.shops.includes(r.shop.id));
    if (!shops.length) continue;
    const ferryCost = area.ferry ? ferryReturnDkk(area.ferry) : 0;

    // Every shop on its own.
    const singles: ShoppingOption[] = shops.map((r) => ({
      key: `${area.id}-${r.shop.id}`,
      area,
      stops: [{ shopId: r.shop.id, name: storeName(area, r.shop), lines: r.lines, cost: r.totalWithEstimates }],
      missing: [],
      basket: r.totalWithEstimates,
      betweenKm: 0,
      betweenCost: 0,
      ferryCost,
      total: round(r.totalWithEstimates + ferryCost),
    }));
    options.push(...singles);

    // The best split on this trip, if it beats the best single store by enough per extra store.
    const bestSingle = Math.min(...singles.map((o) => o.total));
    const splits = combinations(shops)
      .map((combo) => split(area, combo, krPerKm, ferryCost))
      .filter((o) => o.stops.length >= 2 && bestSingle - o.total >= MIN_SAVING_PER_EXTRA_STORE * (o.stops.length - 1))
      .sort((a, b) => a.total - b.total);
    if (splits[0]) options.push({ ...splits[0], key: `${area.id}-split` });
  }
  return options.sort((a, b) => a.total - b.total);
}
