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
  const printed = (o.limit_note ?? "").match(/Pr\.\s*(?:stk|ks|fl|ps|pk|ds|gl|rl|bk|bakke|pose)\.?\s*(\d+(?:[.,]\d+)?)\s*(?:,-)?(?![^.]*merkøb)/i);
  const single = printed ? Number(printed[1].replace(".", "").replace(",", ".")) : NaN;
  return single > 0 && single < o.price ? single : Math.round((o.multi_buy.total_price / o.multi_buy.quantity) * 100) / 100;
}
