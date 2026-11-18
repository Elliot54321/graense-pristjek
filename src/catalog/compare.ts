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
 * - Every offer is priced at its own content (Offer.contentAmount: the smaller of the
 *   listing's and the product's, see data.ts), the same one search's price per
 *   liter/kg uses. One barcode can be shared by sizes, and pricing BorderShop's 0,25 l
 *   Hans Baer as the product's 0,75 l made it look 3x too cheap (trust audit
 *   2026-11-15). So a shop selling smaller packs needs more of them.
 */
import { packLabel } from "@/lib/format";
import type { BasketItem, LineResult, Offer, Pack, Shop, ShopResult } from "./types";

/** Shops whose prices come from a newsletter, so a missing item is likely just not in the issue. */
export const NEWSLETTER_SHOPS = new Set(["fleggaard", "calle"]);

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A total is too estimated to call cheapest when more than this share of its items, or of its
 * money, is estimates. Chosen from the audit baskets (2026-11-18): the household basket's
 * "cheapest" shop had 4 of 12 items estimated (33 %) and was not a trustworthy answer, while the
 * beer trip's winner had 2 of 15 (13 %) and the others 0-1.
 */
export const UNCERTAIN_SHARE = 0.25;

/** True when estimates make up more than UNCERTAIN_SHARE of the items or of the total. */
export function isUncertain(estimates: number, items: number, estimatedValue: number, total: number): boolean {
  if (!items || !estimates) return false;
  return estimates / items > UNCERTAIN_SHARE || (total > 0 && estimatedValue / total > UNCERTAIN_SHARE);
}

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

/** What one piece of this offer contains (set by data.ts; the product's if the offer has none). */
export function offerContent(pack: Pack, offer: Offer): { amount: number; unit: Pack["contentUnit"] } | null {
  if (offer.contentAmount && offer.contentUnit) return { amount: offer.contentAmount, unit: offer.contentUnit };
  return pack.contentAmount && pack.contentUnit ? { amount: pack.contentAmount, unit: pack.contentUnit } : null;
}

/** Whole pieces of `offer` for `amount` of `unit` (null if its content is unknown or in another unit). */
function piecesFor(pack: Pack, offer: Offer, amount: number, unit: Pack["contentUnit"]): number | null {
  const content = offerContent(pack, offer);
  if (!content || content.unit !== unit) return null;
  // The small epsilon keeps 7,92 l / 7,92 l from becoming 2 packs.
  return Math.max(1, Math.ceil(amount / content.amount - 1e-9));
}

function buyLine(item: BasketItem, pack: Pack, offer: Offer, quantity: number): LineResult {
  const singlePrice = !!item.singlePrice;
  const { cost, usedMultiBuy } = costFor(offer, quantity, singlePrice);
  // When the shop sells another size than the product, show what it actually sells.
  const own = offerContent(pack, offer);
  const otherSize = !!(own && pack.contentAmount && Math.abs(own.amount - pack.contentAmount) / pack.contentAmount > 0.02);
  return {
    key: item.key,
    label: item.label,
    buy: {
      productId: pack.productId,
      productName: otherSize ? offer.shopProductName : pack.name,
      packLabel: otherSize ? packLabel(null, null, own!.unit, own!.amount) : pack.packLabel,
      contentAmount: own?.amount ?? null,
      contentUnit: own?.unit ?? null,
      imageUrl: pack.imageUrl,
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
  let best: LineResult | null = null;
  const consider = (pack: Pack, offer: Offer, quantity: number) => {
    const line = buyLine(item, pack, offer, quantity);
    if (!best || line.cost! < best.cost!) best = line;
  };

  if (item.kind === "product") {
    const pack = packs.find((p) => p.productId === item.productId);
    for (const offer of pack?.offers.filter((o) => o.shopId === shopId) ?? []) {
      // The same amount as `quantity` of the product: more pieces where the shop's listing is
      // smaller. Within 2 % (rounding in the shops' data) it's the same pack.
      const own = offerContent(pack!, offer);
      const same = !pack!.contentAmount || !own || own.unit !== pack!.contentUnit || Math.abs(own.amount - pack!.contentAmount) / pack!.contentAmount <= 0.02;
      const quantity = same ? item.quantity : piecesFor(pack!, offer, item.quantity * pack!.contentAmount!, pack!.contentUnit) ?? item.quantity;
      consider(pack!, offer, quantity);
    }
    return best ?? none;
  }

  // A family: the offer (any pack, at its own content) with the lowest total for the amount.
  for (const pack of packs) {
    if (pack.familyId !== item.familyId) continue;
    for (const offer of pack.offers) {
      if (offer.shopId !== shopId) continue;
      const quantity = piecesFor(pack, offer, item.amount, item.unit);
      if (quantity !== null) consider(pack, offer, quantity);
    }
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
      const estimatedValue = estimated.reduce((sum, l) => sum + l.estimate!, 0);
      const totalWithEstimates = round(total + estimatedValue);
      const counted = highest.filter((h) => h !== null).length;
      return {
        shop,
        lines,
        total,
        missing: lines.filter((l) => l.cost === null).length,
        estimates: estimated.length,
        totalWithEstimates,
        items: counted,
        estimatedShare: totalWithEstimates > 0 ? round(estimatedValue / totalWithEstimates) : 0,
        uncertain: isUncertain(estimated.length, counted, estimatedValue, totalWithEstimates),
      };
    })
    .sort((a, b) => a.totalWithEstimates - b.totalWithEstimates || a.estimates - b.estimates);
}
