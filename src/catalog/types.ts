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
  /**
   * What one piece of this offer contains, used for its price per l/kg in search and for the
   * list: the smaller of the shop's own content and the product's (see offerContent() in
   * data.ts); null if neither is known. Usually both agree.
   */
  contentAmount: number | null;
  contentUnit: Unit | null;
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
  /**
   * Only when `best` is null (no pack has a liter/kg content, e.g. household items sold per
   * piece): the exact pack to put on the list instead of an amount of the family - the one sold
   * in the most shops, then the cheapest. The list compares it as that product in every shop.
   */
  listPack?: { productId: number; name: string; imageUrl: string | null } | null;
}

/** A page of search or category results; `next` is where the following page starts (null: the end). */
export interface ResultPage {
  families: FamilyResult[];
  next: number | null;
  /**
   * Search only, first page: the name of the first result when it's a typo match (no family on
   * sale matched the query as typed) - for "Mente du: ...?". null otherwise.
   */
  suggestion?: string | null;
}

/** What the browser keeps in its basket. */
export type BasketItem =
  /** step = how much one "+" adds: the pack size the family was added with. */
  /** packLabel: the pack one step is ("24 x 0,33 l"), shown instead of liters; missing in older baskets. */
  /** singlePrice: price the exact quantity at the till instead of assuming the multi-buy rate (see compare.ts). */
  /** imageUrl: photo of the pack it was added from, shown on the list; missing in older baskets. */
  /** productId (family items): the pack it was added from; missing in older baskets. */
  | { key: string; kind: "family"; familyId: number; label: string; amount: number; step: number; unit: Unit; packLabel?: string; singlePrice?: boolean; imageUrl?: string; productId?: number }
  | { key: string; kind: "product"; productId: number; label: string; quantity: number; singlePrice?: boolean; imageUrl?: string };

export interface LineResult {
  key: string;
  label: string;
  /** What to buy at this shop, or null if the shop doesn't have it. */
  buy: {
    /** The product (pack) bought; compare with the item's productId to see if another pack was picked. */
    productId: number;
    productName: string;
    /** What the shop sells: "24 x 0,33 l", or the offer's own size when it differs from the pack's. */
    packLabel: string | null;
    /** One piece of the offer (its own content, see offerContent() in compare.ts); null if unknown. */
    contentAmount: number | null;
    contentUnit: Unit | null;
    /** The pack's photo (null for newsletter-only products). */
    imageUrl: string | null;
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
  /** Items at least one shop has (the ones that count; items no shop has are left out everywhere). */
  items: number;
  /** Share of totalWithEstimates that is estimates, 0-1. */
  estimatedShare: number;
  /**
   * Too much of this total is estimated to call it cheapest: more than UNCERTAIN_SHARE of the
   * items, or of the money (compare.ts). Ranking is unchanged; it's about what the page claims.
   */
  uncertain: boolean;
}
