/**
 * Catalog reads for the website (publishable key). Prices change once a night,
 * so results are cached for an hour.
 *
 * Only shop products seen in the last 3 days are included (the `matched_prices`
 * view filters out products a shop has removed).
 */
import { cacheLife } from "next/cache";
import { publicClient } from "@/db/public";
import type { FamilyInfo } from "./import-limits";
import { finalScore, preScore } from "./ranking";
import { packLabel } from "@/lib/format";
import type { FamilyResult, Offer, Pack, Shop, Unit } from "./types";

const MAX_FAMILIES = 30;
/** Families fetched for a query before ranking (broad words like "øl" match hundreds). */
const MAX_CANDIDATES = 400;

interface ProductRow {
  id: number;
  name: string;
  family_id: number | null;
  content_amount: number | null;
  content_unit: Unit | null;
}

interface ListingRow {
  product_id: number;
  shop_products:
    | { pack_count: number | null; unit_size_amount: number | null; unit_size_unit: Unit | null }
    | { pack_count: number | null; unit_size_amount: number | null; unit_size_unit: Unit | null }[]
    | null;
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
  multi_buy_quantity: number | null;
  multi_buy_price: number | null;
  saving_vs_dk_percent: number | null;
  coupon: boolean;
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
    .select(
      "product_id, shop_id, name, price, price_per_unit, on_offer, regular_price, offer_ends_at, url, observed_at, multi_buy_quantity, multi_buy_price, saving_vs_dk_percent, coupon",
    )
    .in("product_id", products.map((p) => p.id));
  if (priceError) throw priceError;

  // Pack shape ("24 x 0,33 l") from the shops' listings; the most common one wins.
  const { data: listings, error: listingError } = await db
    .from("product_matches")
    .select("product_id, shop_products(pack_count, unit_size_amount, unit_size_unit)")
    .in("product_id", products.map((p) => p.id));
  if (listingError) throw listingError;
  const shapes = new Map<number, Map<string, number>>();
  for (const l of listings as unknown as ListingRow[]) {
    const sp = Array.isArray(l.shop_products) ? l.shop_products[0] : l.shop_products;
    if (!sp?.unit_size_amount || !sp.unit_size_unit) continue;
    const key = `${sp.pack_count ?? 1}|${Number(sp.unit_size_amount)}|${sp.unit_size_unit}`;
    const counts = shapes.get(l.product_id) ?? new Map<string, number>();
    shapes.set(l.product_id, counts.set(key, (counts.get(key) ?? 0) + 1));
  }
  const shapeOf = (id: number) => {
    const best = [...(shapes.get(id) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) return null;
    const [count, size, unit] = best.split("|");
    return { count: Number(count), size: Number(size), unit: unit as Unit };
  };

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
      multiBuy:
        r.multi_buy_quantity && r.multi_buy_price !== null
          ? { quantity: r.multi_buy_quantity, price: Number(r.multi_buy_price) }
          : null,
      savingVsDkPercent: r.saving_vs_dk_percent === null ? null : Number(r.saving_vs_dk_percent),
      coupon: r.coupon,
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
      packLabel: (() => {
        const shape = shapeOf(p.id);
        const content = p.content_amount === null ? null : Number(p.content_amount);
        // Only trust the shape if it adds up to the product's content (7,92 = 24 x 0,33).
        const fits = shape && content && shape.unit === p.content_unit && Math.abs(shape.count * shape.size - content) / content < 0.02;
        return fits ? packLabel(shape.count, shape.size, shape.unit, content) : packLabel(null, null, p.content_unit, content);
      })(),
      offers: (offersByProduct.get(p.id) ?? []).sort((a, b) => a.price - b.price),
    }))
    .filter((p) => p.offers.length > 0); // products no shop currently sells are left out
}

/**
 * Families whose name has a word starting with the query (spaces and hyphens
 * match each other), or whose search words contain every query word. Many
 * families can match a broad word like "øl", so up to MAX_CANDIDATES are
 * pre-ranked on name and search words, and only the best get prices loaded.
 * Ranking: see ranking.ts.
 */
export async function searchFamilies(rawQuery: string): Promise<FamilyResult[]> {
  "use cache";
  cacheLife("hours");
  const q = cleanQuery(rawQuery);
  if (q.length < 2) return [];

  const words = q.split(/[ -]/).filter(Boolean);
  // "_" matches any single character, so "coca cola" also finds "Coca-Cola".
  const pattern = q.replace(/[ -]/g, "_");
  const { data: families, error } = await publicClient()
    .from("product_families")
    .select("id, name, category, search_words")
    .or(`name.ilike.${pattern}*,name.ilike.* ${pattern}*,name.ilike.*-${pattern}*,search_words.cs.{${words.join(",")}}`)
    .limit(MAX_CANDIDATES);
  if (error) throw error;
  if (!families.length) return [];

  const pre = new Map(families.map((f) => [f.id, preScore(f.name, f.search_words ?? [], q)]));
  const shortlist = [...families].sort((a, b) => pre.get(b.id)! - pre.get(a.id)!).slice(0, MAX_FAMILIES * 2);

  const packs = await loadPacks([], shortlist.map((f) => f.id));
  const results = shortlist.map((f) => {
    const own = packs.filter((p) => p.familyId === f.id);
    let best: FamilyResult["best"] = null;
    for (const pack of own) {
      for (const o of pack.offers) {
        if (o.pricePerUnit === null || !pack.contentUnit) continue;
        if (!best || o.pricePerUnit < best.pricePerUnit) {
          best = { pricePerUnit: o.pricePerUnit, unit: pack.contentUnit, shopId: o.shopId, productName: pack.name, coupon: o.coupon };
        }
      }
    }
    const shops = new Set(own.flatMap((p) => p.offers.map((o) => o.shopId))).size;
    const result: FamilyResult = { id: f.id, name: f.name, category: f.category, best, packs: own };
    return { result, score: finalScore(pre.get(f.id)!, shops, own.length) };
  });

  // Families nobody sells right now are dropped.
  return results
    .filter((r) => r.result.packs.length > 0)
    .sort((a, b) => b.score - a.score || a.result.name.length - b.result.name.length)
    .slice(0, MAX_FAMILIES)
    .map((r) => r.result);
}

/** Everything the basket comparison needs: the basket's exact products and all packs of its families. */
/** Name and category of the given families (for the import-limit check). */
export async function familiesById(ids: number[]): Promise<FamilyInfo[]> {
  "use cache";
  cacheLife("hours");
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return [];
  const { data, error } = await publicClient().from("product_families").select("id, name, category").in("id", unique);
  if (error) throw error;
  return data as FamilyInfo[];
}

export async function packsForBasket(productIds: number[], familyIds: number[]): Promise<Pack[]> {
  "use cache";
  cacheLife("hours");
  return loadPacks([...new Set(productIds)].sort(), [...new Set(familyIds)].sort());
}
