import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "../db/admin";
import type { ScrapedProduct } from "./types";

export { adminClient } from "../db/admin";

const BATCH_SIZE = 500;
/** A price change bigger than this (as a fraction) is reported as a warning. */
const BIG_CHANGE = 0.5;

export interface RunSummary {
  urlsFound: number;
  productsScraped: number;
  productsFailed: number;
  priceChanges: number;
  warnings: string[];
}

export async function startRun(db: SupabaseClient, shop: string): Promise<number> {
  const { data, error } = await db.from("scrape_runs").insert({ shop_id: shop }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function finishRun(
  db: SupabaseClient,
  runId: number,
  summary: RunSummary,
  failure?: string,
) {
  const status = failure ? "failed" : summary.warnings.length ? "warning" : "ok";
  const notes = [failure, ...summary.warnings].filter(Boolean).join("\n") || null;
  const { error } = await db
    .from("scrape_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      urls_found: summary.urlsFound,
      products_scraped: summary.productsScraped,
      products_failed: summary.productsFailed,
      price_changes: summary.priceChanges,
      notes,
    })
    .eq("id", runId);
  if (error) throw error;
}

interface PriceRow {
  shop_product_id: number;
  price: number;
  price_per_unit: number | null;
  on_offer: boolean;
  regular_price: number | null;
  offer_ends_at: string | null;
  pfand: number | null;
}

/** Latest price of every product in a shop, keyed by shop_products.id. */
async function currentPrices(db: SupabaseClient, shop: string): Promise<Map<number, PriceRow>> {
  const rows = await fetchAll<PriceRow>((from, to) =>
    db
      .from("current_prices")
      .select("shop_product_id, price, price_per_unit, on_offer, regular_price, offer_ends_at, pfand")
      .eq("shop_id", shop)
      .order("shop_product_id")
      .range(from, to),
  );
  return new Map(rows.map((row) => [row.shop_product_id, row]));
}

// Compare money as fixed 2-decimal strings so 5.68 vs "5.68" vs 5.680001 count as equal.
const money = (n: number | null) => (n === null ? null : Number(n).toFixed(2));

function priceRow(id: number, p: ScrapedProduct): PriceRow {
  return {
    shop_product_id: id,
    price: p.price,
    price_per_unit: p.pricePerUnit,
    on_offer: p.onOffer,
    regular_price: p.regularPrice,
    offer_ends_at: p.offerEndsAt,
    pfand: p.pfand,
  };
}

function hasChanged(prev: PriceRow, next: PriceRow): boolean {
  return (
    money(prev.price) !== money(next.price) ||
    money(prev.price_per_unit) !== money(next.price_per_unit) ||
    prev.on_offer !== next.on_offer ||
    money(prev.regular_price) !== money(next.regular_price) ||
    prev.offer_ends_at !== next.offer_ends_at ||
    money(prev.pfand) !== money(next.pfand)
  );
}

/**
 * Upsert the products and add a price row for every product whose price or
 * offer changed since the last run. Returns the number of price rows added and
 * warnings for suspicious price jumps.
 */
export async function saveProducts(
  db: SupabaseClient,
  shop: string,
  products: ScrapedProduct[],
): Promise<{ priceChanges: number; warnings: string[] }> {
  const now = new Date().toISOString();
  const byShopId = new Map(products.map((p) => [p.shopProductId, p]));
  const previous = await currentPrices(db, shop);

  const newPrices: PriceRow[] = [];
  const warnings: string[] = [];
  const unique = [...byShopId.values()];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const { data, error } = await db
      .from("shop_products")
      .upsert(
        batch.map((p) => ({
          shop_id: shop,
          shop_product_id: p.shopProductId,
          url: p.url,
          name: p.name,
          brand: p.brand,
          ean: p.ean,
          categories: p.categories,
          pack_count: p.packCount,
          unit_size_amount: p.unitSize?.amount ?? null,
          unit_size_unit: p.unitSize?.unit ?? null,
          content_amount: p.totalContent?.amount ?? null,
          content_unit: p.totalContent?.unit ?? null,
          last_seen_at: now,
        })),
        { onConflict: "shop_id,shop_product_id" },
      )
      .select("id, shop_product_id");
    if (error) throw error;

    for (const { id, shop_product_id } of data) {
      const product = byShopId.get(shop_product_id)!;
      const next = priceRow(id, product);
      const prev = previous.get(id);
      if (prev && !hasChanged(prev, next)) continue;
      if (prev && Math.abs(next.price - prev.price) / prev.price > BIG_CHANGE) {
        warnings.push(`Price jump ${prev.price} -> ${next.price} DKK: ${product.name} (${product.url})`);
      }
      newPrices.push(next);
    }
  }

  for (let i = 0; i < newPrices.length; i += BATCH_SIZE) {
    const { error } = await db.from("prices").insert(newPrices.slice(i, i + BATCH_SIZE));
    if (error) throw error;
  }
  return { priceChanges: newPrices.length, warnings };
}
