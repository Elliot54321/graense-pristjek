/**
 * Basket comparison: what the basket costs in each shop.
 *
 * - An exact product ("Coca-Cola 24 x 0,33 l, 2 kasser") costs quantity x the
 *   shop's price, if the shop has it.
 * - A family with an amount ("Coca-Cola, 8 liter") is filled with the pack that
 *   gives the lowest total in that shop: whole packs only, so 8 liter from
 *   7,92 l cases means 2 cases. Mixing pack sizes is not tried yet.
 */
import type { BasketItem, LineResult, Pack, Shop, ShopResult } from "./types";

/** Cheapest offer for a product in one shop (a shop can list the same product twice). */
function offerAt(pack: Pack, shopId: string) {
  return pack.offers.filter((o) => o.shopId === shopId).sort((a, b) => a.price - b.price)[0];
}

function priceLine(item: BasketItem, packs: Pack[], shopId: string): LineResult {
  if (item.kind === "product") {
    const pack = packs.find((p) => p.productId === item.productId);
    const offer = pack && offerAt(pack, shopId);
    if (!pack || !offer) return { key: item.key, label: item.label, buy: null, cost: null };
    return {
      key: item.key,
      label: item.label,
      buy: { productName: pack.name, quantity: item.quantity, price: offer.price, url: offer.url, onOffer: offer.onOffer, offerEndsAt: offer.offerEndsAt },
      cost: item.quantity * offer.price,
    };
  }

  let best: LineResult | null = null;
  for (const pack of packs) {
    if (pack.familyId !== item.familyId || pack.contentUnit !== item.unit || !pack.contentAmount) continue;
    const offer = offerAt(pack, shopId);
    if (!offer) continue;
    // Whole packs only; the small epsilon keeps 7,92 l / 7,92 l from becoming 2 packs.
    const quantity = Math.max(1, Math.ceil(item.amount / pack.contentAmount - 1e-9));
    const cost = quantity * offer.price;
    if (!best || cost < best.cost!) {
      best = {
        key: item.key,
        label: item.label,
        buy: { productName: pack.name, quantity, price: offer.price, url: offer.url, onOffer: offer.onOffer, offerEndsAt: offer.offerEndsAt },
        cost,
      };
    }
  }
  return best ?? { key: item.key, label: item.label, buy: null, cost: null };
}

/** One result per shop, cheapest complete basket first; shops missing items after that. */
export function compareBasket(items: BasketItem[], packs: Pack[], shops: Shop[]): ShopResult[] {
  return shops
    .map((shop) => {
      const lines = items.map((item) => priceLine(item, packs, shop.id));
      return {
        shop,
        lines,
        total: Math.round(lines.reduce((sum, l) => sum + (l.cost ?? 0), 0) * 100) / 100,
        missing: lines.filter((l) => l.cost === null).length,
      };
    })
    .sort((a, b) => a.missing - b.missing || a.total - b.total);
}
