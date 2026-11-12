/**
 * Basket comparison: what the basket costs in each shop.
 *
 * - An exact product ("Coca-Cola 24 x 0,33 l, 2 kasser") costs quantity x the
 *   shop's price, if the shop has it.
 * - A family with an amount ("Coca-Cola, 8 liter") is filled with the pack that
 *   gives the lowest total in that shop: whole packs only, so 8 liter from
 *   7,92 l cases means 2 cases. Mixing pack sizes is not tried yet.
 * - Multi-buy deals ("3 for 174,99") are assumed: every piece is priced at the deal
 *   rate, even when the list has fewer (2 -> 2/3 of 174,99). Border shoppers buy in
 *   bulk and round up to the deal (user decision 2026-11-12). An item marked
 *   `singlePrice` on the list is priced as the till would charge exactly that
 *   quantity instead: the deal for every full group, the rest at the single price.
 * - An item a shop lacks is counted at the highest price any other shop charges
 *   for it, marked as an estimate. This can never make a shop look cheaper on that
 *   item, and it keeps totals comparable: otherwise a shop missing an expensive
 *   item would look cheapest. Newsletter shops (Fleggaard, Calle) only show part of
 *   their range, so for them "missing" mostly means "not in this issue".
 */
import type { BasketItem, LineResult, Offer, Pack, Shop, ShopResult } from "./types";

/** Shops whose prices come from a newsletter, so a missing item is likely just not in the issue. */
export const NEWSLETTER_SHOPS = new Set(["fleggaard", "calle"]);

const round = (n: number) => Math.round(n * 100) / 100;

/** Price per piece of a multi-buy deal that beats the single price ("3 for 199,99" -> 66,66), else null. */
export function dealPerPiece(offer: Offer): number | null {
  const deal = offer.multiBuy;
  if (!deal || deal.quantity < 2) return null;
  const per = deal.price / deal.quantity;
  return per < offer.price - 0.005 ? per : null;
}

/** The price per piece we assume a shopper pays: the deal rate if there is one. */
export const effectivePrice = (offer: Offer) => dealPerPiece(offer) ?? offer.price;

/** What the till charges for exactly `quantity` packs: the deal for every full group, the rest single. */
export function exactCost(offer: Offer, quantity: number): number {
  const single = quantity * offer.price;
  const deal = offer.multiBuy;
  if (!deal || quantity < deal.quantity) return single;
  const groups = Math.floor(quantity / deal.quantity);
  return Math.min(single, groups * deal.price + (quantity - groups * deal.quantity) * offer.price);
}

/**
 * Cost of `quantity` packs: at the deal rate (see above), or - with `singlePrice` -
 * exactly what the till charges. usedMultiBuy: the deal changed the price.
 */
export function costFor(offer: Offer, quantity: number, singlePrice = false): { cost: number; usedMultiBuy: boolean } {
  const per = dealPerPiece(offer);
  const cost = singlePrice || per === null ? exactCost(offer, quantity) : round(quantity * per);
  return { cost, usedMultiBuy: cost < quantity * offer.price - 0.005 };
}

/** Cheapest offer for `quantity` packs in one shop (a shop can list the same product twice). */
function offerAt(pack: Pack, shopId: string, quantity: number, singlePrice: boolean) {
  return pack.offers
    .filter((o) => o.shopId === shopId)
    .sort((a, b) => costFor(a, quantity, singlePrice).cost - costFor(b, quantity, singlePrice).cost)[0];
}

function buyLine(item: BasketItem, pack: Pack, offer: Offer, quantity: number): LineResult {
  const singlePrice = !!item.singlePrice;
  const { cost, usedMultiBuy } = costFor(offer, quantity, singlePrice);
  return {
    key: item.key,
    label: item.label,
    buy: {
      productName: pack.name,
      quantity,
      price: offer.price,
      url: offer.url,
      onOffer: offer.onOffer,
      offerEndsAt: offer.offerEndsAt,
      multiBuy: usedMultiBuy ? offer.multiBuy : null,
      deal: dealPerPiece(offer) === null ? null : offer.multiBuy,
      exactCost: round(exactCost(offer, quantity)),
      singlePrice,
      coupon: offer.coupon,
    },
    cost,
    estimate: null,
  };
}

function priceLine(item: BasketItem, packs: Pack[], shopId: string): LineResult {
  const none: LineResult = { key: item.key, label: item.label, buy: null, cost: null, estimate: null };
  if (item.kind === "product") {
    const pack = packs.find((p) => p.productId === item.productId);
    const offer = pack && offerAt(pack, shopId, item.quantity, !!item.singlePrice);
    return pack && offer ? buyLine(item, pack, offer, item.quantity) : none;
  }

  let best: LineResult | null = null;
  for (const pack of packs) {
    if (pack.familyId !== item.familyId || pack.contentUnit !== item.unit || !pack.contentAmount) continue;
    // Whole packs only; the small epsilon keeps 7,92 l / 7,92 l from becoming 2 packs.
    const quantity = Math.max(1, Math.ceil(item.amount / pack.contentAmount - 1e-9));
    const offer = offerAt(pack, shopId, quantity, !!item.singlePrice);
    if (!offer) continue;
    const line = buyLine(item, pack, offer, quantity);
    if (!best || line.cost! < best.cost!) best = line;
  }
  return best ?? none;
}

/** One result per shop, cheapest first once missing items are counted at their estimate. */
export function compareBasket(items: BasketItem[], packs: Pack[], shops: Shop[]): ShopResult[] {
  const linesPerShop = shops.map((shop) => items.map((item) => priceLine(item, packs, shop.id)));
  // Highest price per item across shops; null if no shop has it (then it's left out everywhere).
  const highest = items.map((_, i) => {
    const costs = linesPerShop.flatMap((lines) => (lines[i].cost === null ? [] : [lines[i].cost!]));
    return costs.length ? Math.max(...costs) : null;
  });
  return shops
    .map((shop, s) => {
      const lines = linesPerShop[s].map((l, i) => (l.cost === null ? { ...l, estimate: highest[i] } : l));
      const total = round(lines.reduce((sum, l) => sum + (l.cost ?? 0), 0));
      const estimated = lines.filter((l) => l.estimate !== null);
      return {
        shop,
        lines,
        total,
        missing: lines.filter((l) => l.cost === null).length,
        estimates: estimated.length,
        totalWithEstimates: round(total + estimated.reduce((sum, l) => sum + l.estimate!, 0)),
      };
    })
    .sort((a, b) => a.totalWithEstimates - b.totalWithEstimates || a.estimates - b.estimates);
}
