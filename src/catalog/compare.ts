/**
 * Basket comparison: what the basket costs in each shop.
 *
 * - An exact product ("Coca-Cola 24 x 0,33 l, 2 kasser") costs quantity x the
 *   shop's price, if the shop has it.
 * - A family with an amount ("Coca-Cola, 8 liter") is filled with the pack that
 *   gives the lowest total in that shop: whole packs only, so 8 liter from
 *   7,92 l cases means 2 cases. Mixing pack sizes is not tried yet.
 * - Multi-buy deals ("3 for 174,99") are used for every full group of that size;
 *   the rest is charged at the single price.
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

/** Cost of `quantity` packs, using a multi-buy deal for every full group when it's cheaper. */
export function costFor(offer: Offer, quantity: number): { cost: number; usedMultiBuy: boolean } {
  const single = quantity * offer.price;
  const deal = offer.multiBuy;
  if (!deal || quantity < deal.quantity) return { cost: single, usedMultiBuy: false };
  const groups = Math.floor(quantity / deal.quantity);
  const withDeal = groups * deal.price + (quantity - groups * deal.quantity) * offer.price;
  return withDeal < single ? { cost: withDeal, usedMultiBuy: true } : { cost: single, usedMultiBuy: false };
}

/** Cheapest offer for a product in one shop (a shop can list the same product twice). */
function offerAt(pack: Pack, shopId: string) {
  return pack.offers.filter((o) => o.shopId === shopId).sort((a, b) => a.price - b.price)[0];
}

function priceLine(item: BasketItem, packs: Pack[], shopId: string): LineResult {
  if (item.kind === "product") {
    const pack = packs.find((p) => p.productId === item.productId);
    const offer = pack && offerAt(pack, shopId);
    if (!pack || !offer) return { key: item.key, label: item.label, buy: null, cost: null, estimate: null };
    const { cost, usedMultiBuy } = costFor(offer, item.quantity);
    return {
      key: item.key,
      label: item.label,
      buy: {
        productName: pack.name,
        quantity: item.quantity,
        price: offer.price,
        url: offer.url,
        onOffer: offer.onOffer,
        offerEndsAt: offer.offerEndsAt,
        multiBuy: usedMultiBuy ? offer.multiBuy : null,
        deal: offer.multiBuy,
        coupon: offer.coupon,
      },
      cost,
      estimate: null,
    };
  }

  let best: LineResult | null = null;
  for (const pack of packs) {
    if (pack.familyId !== item.familyId || pack.contentUnit !== item.unit || !pack.contentAmount) continue;
    const offer = offerAt(pack, shopId);
    if (!offer) continue;
    // Whole packs only; the small epsilon keeps 7,92 l / 7,92 l from becoming 2 packs.
    const quantity = Math.max(1, Math.ceil(item.amount / pack.contentAmount - 1e-9));
    const { cost, usedMultiBuy } = costFor(offer, quantity);
    if (!best || cost < best.cost!) {
      best = {
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
          deal: offer.multiBuy,
          coupon: offer.coupon,
        },
        cost,
        estimate: null,
      };
    }
  }
  return best ?? { key: item.key, label: item.label, buy: null, cost: null, estimate: null };
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
