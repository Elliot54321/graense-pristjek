/** Price helpers for newsletter offers (kept apart from import.ts so they can be tested). */

export interface PricedOffer {
  price: number;
  multi_buy: { quantity: number; total_price: number } | null;
  limit_note?: string | null;
}

/**
 * Price of ONE unit. When the big printed price is a multi-buy ("6 stk. 100,-"), older
 * extractions stored the total as the price, so one 170 g bar cost 100 kr. (588 kr./kg).
 * Then the single price is the small print ("Pr. stk. 22,22", not "Pr. kg v/merkøb"),
 * or else the total divided by the quantity.
 */
export function singlePrice(o: PricedOffer): number {
  if (!o.multi_buy || Math.abs(o.price - o.multi_buy.total_price) > 0.005) return o.price;
  return printedSingle(o) ?? Math.round((o.multi_buy.total_price / o.multi_buy.quantity) * 100) / 100;
}

/**
 * The small-print single price of a multi-buy offer ("Pr. fl. 59,99"), or null. When it's
 * missing, singlePrice falls back to the deal price per item - too cheap if the shop does
 * print a higher single price that the extraction missed (Fleggaard's Omo, Nov 2026), so
 * the import warns about those offers.
 */
export function printedSingle(o: PricedOffer): number | null {
  const printed = (o.limit_note ?? "").match(/Pr\.\s*(?:stk|ks|fl|ps|pk|ds|gl|rl|bk|bakke|pose)\.?\s*(\d+(?:[.,]\d+)?)\s*(?:,-)?(?![^.]*merkøb)/i);
  const single = printed ? Number(printed[1].replace(".", "").replace(",", ".")) : NaN;
  return single > 0 && single < o.price ? single : null;
}

export interface PackOffer extends PricedOffer {
  unit_count: number | null;
  unit_size: number | null;
  unit: "l" | "kg" | "stk" | null;
  price_per_liter_or_kg: number | null;
  price_per_is_max: boolean;
}

/** Within 3 % of each other. */
const near = (a: number, b: number) => Math.abs(a - b) / b < 0.03;

/**
 * Price of the whole pack. Some offers print the price of ONE item of a multipack:
 * "Coca Cola 6 x 1,25 l. – 6,66 pr. fl. (Pr. pk. 39,99)" was stored as 6,66 kr. for
 * the 6-pack (0,89 kr./l). The labels can't be trusted ("Pr. stk." can be the whole
 * pack), so the printed price per liter/kg decides: if it fits one item rather than
 * the pack, the pack price is the printed "Pr. pk./ks." or the item price x count.
 */
export function packPrice(o: PackOffer, price: number): number {
  const per = o.price_per_liter_or_kg;
  if (!o.unit_count || o.unit_count < 2 || !o.unit_size || (o.unit !== "l" && o.unit !== "kg") || !per || o.price_per_is_max) {
    return price;
  }
  const perIfPack = price / (o.unit_count * o.unit_size);
  const perIfItem = price / o.unit_size;
  if (near(perIfPack, per) || !near(perIfItem, per)) return price;
  const printed = (o.limit_note ?? "").match(/Pr\.\s*(?:pk|ks)\.?\s*(\d+(?:[.,]\d+)?)/i);
  const pack = printed ? Number(printed[1].replace(".", "").replace(",", ".")) : NaN;
  return pack > price ? pack : Math.round(price * o.unit_count * 100) / 100;
}
