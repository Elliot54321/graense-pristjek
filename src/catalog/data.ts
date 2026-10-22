/**
 * Catalog reads for the website (publishable key). Prices change once a night,
 * so results are cached for an hour.
 *
 * Only shop products seen in the last 3 days are included (the `matched_prices`
 * view filters out products a shop has removed).
 */
import { cacheLife } from "next/cache";
import { publicClient } from "@/db/public";
import type { FamilyResult, Offer, Pack, Shop, Unit } from "./types";

const MAX_FAMILIES = 30;

interface ProductRow {
  id: number;
  name: string;
  family_id: number | null;
  content_amount: number | null;
  content_unit: Unit | null;
}

interface PriceRow {
  product_id: number;
  shop_id: string;
  name: string;
  price: number;
  price_per_unit: number | null;
  on_offer: boolean;
  regular_price: number | null;
  offer_ends_at: string | null;
  url: string;
  observed_at: string;
}

export async function getShops(): Promise<Shop[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await publicClient().from("shops").select("id, name, location, website").order("id");
  if (error) throw error;
  return data;
}

/** Characters with a meaning in PostgREST filters are removed from user input. */
function cleanQuery(q: string): string {
  return q.toLowerCase().replace(/[,()*{}"'\\%:]/g, " ").replace(/\s+/g, " ").trim();
}

async function loadPacks(productIds: number[], familyIds: number[]): Promise<Pack[]> {
  const db = publicClient();
  const filters: string[] = [];
  if (familyIds.length) filters.push(`family_id.in.(${familyIds.join(",")})`);
  if (productIds.length) filters.push(`id.in.(${productIds.join(",")})`);
  if (!filters.length) return [];

  const { data: products, error } = await db
    .from("products")
    .select("id, name, family_id, content_amount, content_unit")
    .or(filters.join(","));
  if (error) throw error;
  if (!products.length) return [];

  const { data: prices, error: priceError } = await db
    .from("matched_prices")
    .select("product_id, shop_id, name, price, price_per_unit, on_offer, regular_price, offer_ends_at, url, observed_at")
    .in("product_id", products.map((p) => p.id));
  if (priceError) throw priceError;

  const offersByProduct = new Map<number, Offer[]>();
  for (const r of prices as PriceRow[]) {
    const offer: Offer = {
      productId: r.product_id,
      shopId: r.shop_id,
      shopProductName: r.name,
      price: Number(r.price),
      pricePerUnit: r.price_per_unit === null ? null : Number(r.price_per_unit),
      onOffer: r.on_offer,
      regularPrice: r.regular_price === null ? null : Number(r.regular_price),
      offerEndsAt: r.offer_ends_at,
      url: r.url,
      observedAt: r.observed_at,
    };
    offersByProduct.set(r.product_id, [...(offersByProduct.get(r.product_id) ?? []), offer]);
  }

  return (products as ProductRow[])
    .map((p) => ({
      productId: p.id,
      name: p.name,
      familyId: p.family_id,
      contentAmount: p.content_amount === null ? null : Number(p.content_amount),
      contentUnit: p.content_unit,
      offers: (offersByProduct.get(p.id) ?? []).sort((a, b) => a.price - b.price),
    }))
    .filter((p) => p.offers.length > 0); // products no shop currently sells are left out
}

/**
 * Families whose name has a word starting with the query, or whose search words
 * contain every word of the query ("pepsi max" -> {pepsi, max}).
 */
export async function searchFamilies(rawQuery: string): Promise<FamilyResult[]> {
  "use cache";
  cacheLife("hours");
  const q = cleanQuery(rawQuery);
  if (q.length < 2) return [];

  const words = q.split(" ");
  const { data: families, error } = await publicClient()
    .from("product_families")
    .select("id, name, category")
    .or(`name.ilike.${q}*,name.ilike.* ${q}*,search_words.cs.{${words.join(",")}}`)
    .limit(MAX_FAMILIES * 2);
  if (error) throw error;
  if (!families.length) return [];

  const packs = await loadPacks([], families.map((f) => f.id));
  const results: FamilyResult[] = families.map((f) => {
    const own = packs.filter((p) => p.familyId === f.id);
    let best: FamilyResult["best"] = null;
    for (const pack of own) {
      for (const o of pack.offers) {
        if (o.pricePerUnit === null || !pack.contentUnit) continue;
        if (!best || o.pricePerUnit < best.pricePerUnit) {
          best = { pricePerUnit: o.pricePerUnit, unit: pack.contentUnit, shopId: o.shopId, productName: pack.name };
        }
      }
    }
    return { id: f.id, name: f.name, category: f.category, best, packs: own };
  });

  // Families nobody sells right now are dropped. Ranking stands in for "how common":
  // sold in more shops first, then more pack sizes, then names starting with the query.
  const shopCount = (r: FamilyResult) => new Set(r.packs.flatMap((p) => p.offers.map((o) => o.shopId))).size;
  const starts = (r: FamilyResult) => (r.name.toLowerCase().startsWith(q) ? 0 : 1);
  return results
    .filter((r) => r.packs.length > 0)
    .sort((a, b) => shopCount(b) - shopCount(a) || b.packs.length - a.packs.length || starts(a) - starts(b))
    .slice(0, MAX_FAMILIES);
}

/** Everything the basket comparison needs: the basket's exact products and all packs of its families. */
export async function packsForBasket(productIds: number[], familyIds: number[]): Promise<Pack[]> {
  "use cache";
  cacheLife("hours");
  return loadPacks([...new Set(productIds)].sort(), [...new Set(familyIds)].sort());
}
