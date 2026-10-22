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
}

/** An exact product (one pack), with every shop's price. */
export interface Pack {
  productId: number;
  name: string;
  familyId: number | null;
  contentAmount: number | null;
  contentUnit: Unit | null;
  offers: Offer[];
}

export interface FamilyResult {
  id: number;
  name: string;
  category: string;
  /** Cheapest price per liter/kg/piece across all packs and shops. */
  best: { pricePerUnit: number; unit: Unit; shopId: string; productName: string } | null;
  packs: Pack[];
}

/** What the browser keeps in its basket. */
export type BasketItem =
  /** step = how much one "+" adds: the pack size the family was added with. */
  | { key: string; kind: "family"; familyId: number; label: string; amount: number; step: number; unit: Unit }
  | { key: string; kind: "product"; productId: number; label: string; quantity: number };

export interface LineResult {
  key: string;
  label: string;
  /** What to buy at this shop, or null if the shop doesn't have it. */
  buy: { productName: string; quantity: number; price: number; url: string; onOffer: boolean; offerEndsAt: string | null } | null;
  cost: number | null;
}

export interface ShopResult {
  shop: Shop;
  total: number;
  lines: LineResult[];
  missing: number;
}
