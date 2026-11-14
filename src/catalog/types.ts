/** Shared shapes for search, basket and comparison (plain data, safe to send to the browser). */

export type Unit = "l" | "kg" | "piece";

export interface Shop {
  id: string;
  name: string;
  location: string | null;
  website: string;
}

/** One shop's current price for an exact product. */
export interface Offer {
  productId: number;
  shopId: string;
  shopProductName: string;
  price: number;
  pricePerUnit: number | null;
  onOffer: boolean;
  regularPrice: number | null;
  offerEndsAt: string | null;
  url: string;
  observedAt: string;
  /** Multi-buy deal from a newsletter, e.g. 3 for 174,99. */
  multiBuy: { quantity: number; price: number } | null;
  /** The shop's own "SPAR x% ift. DK" claim. */
  savingVsDkPercent: number | null;
  /** Calle "KUPONTILBUD": only with the newsletter's coupon - always say so. */
  coupon: boolean;
}

/** An exact product (one pack), with every shop's price. */
export interface Pack {
  productId: number;
  name: string;
  familyId: number | null;
  contentAmount: number | null;
  contentUnit: Unit | null;
  /** "24 x 0,33 l" - how the shops sell it; contentAmount (7,92 l) is for comparing per liter. */
  packLabel: string | null;
  /** Product photo on a shop's own site (og:image); null for newsletter-only products. */
  imageUrl: string | null;
  offers: Offer[];
}

export interface FamilyResult {
  id: number;
  name: string;
  category: string;
  /** Cheapest price per liter/kg/piece across all packs and shops. */
  /** deal: set when the price is a multi-buy rate ("ved 3 stk."). */
  best: {
    pricePerUnit: number;
    unit: Unit;
    shopId: string;
    productName: string;
    coupon: boolean;
    deal: { quantity: number; price: number } | null;
  } | null;
  packs: Pack[];
}

/** A page of search or category results; `next` is where the following page starts (null: the end). */
export interface ResultPage {
  families: FamilyResult[];
  next: number | null;
}

/** What the browser keeps in its basket. */
export type BasketItem =
  /** step = how much one "+" adds: the pack size the family was added with. */
  /** packLabel: the pack one step is ("24 x 0,33 l"), shown instead of liters; missing in older baskets. */
  /** singlePrice: price the exact quantity at the till instead of assuming the multi-buy rate (see compare.ts). */
  | { key: string; kind: "family"; familyId: number; label: string; amount: number; step: number; unit: Unit; packLabel?: string; singlePrice?: boolean }
  | { key: string; kind: "product"; productId: number; label: string; quantity: number; singlePrice?: boolean };

export interface LineResult {
  key: string;
  label: string;
  /** What to buy at this shop, or null if the shop doesn't have it. */
  buy: {
    productName: string;
    quantity: number;
    price: number;
    url: string;
    onOffer: boolean;
    offerEndsAt: string | null;
    /** Set when a multi-buy deal lowered the price (at the deal rate, or for full groups with singlePrice). */
    multiBuy: { quantity: number; price: number } | null;
    /** The shop's multi-buy deal if it beats the single price, used or not. */
    deal: { quantity: number; price: number } | null;
    /** What the till charges for exactly this quantity (differs from cost when the deal rate is assumed). */
    exactCost: number;
    /** The item is marked "Brug stk.-pris" on the list. */
    singlePrice: boolean;
    coupon: boolean;
  } | null;
  cost: number | null;
  /** When the shop lacks the item: the highest price another shop charges (null if none has it). */
  estimate: number | null;
}

export interface ShopResult {
  shop: Shop;
  /** Sum of the items this shop has. */
  total: number;
  lines: LineResult[];
  missing: number;
  /** Missing items counted at their estimate, and the total including them - what shops are ranked by. */
  estimates: number;
  totalWithEstimates: number;
}
