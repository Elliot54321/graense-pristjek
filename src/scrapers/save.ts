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
  multi_buy_quantity: number | null;
  multi_buy_price: number | null;
  saving_vs_dk_percent: number | null;
  coupon: boolean;
}

/** Latest price of every product in a shop, keyed by shop_products.id. */
async function currentPrices(db: SupabaseClient, shop: string): Promise<Map<number, PriceRow>> {
  const rows = await fetchAll<PriceRow>((from, to) =>
    db
      .from("current_prices")
      .select(
        "shop_product_id, price, price_per_unit, on_offer, regular_price, offer_ends_at, pfand, multi_buy_quantity, multi_buy_price, saving_vs_dk_percent, coupon",
      )
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
    multi_buy_quantity: p.multiBuy?.quantity ?? null,
    multi_buy_price: p.multiBuy?.price ?? null,
    saving_vs_dk_percent: p.savingVsDkPercent ?? null,
    coupon: p.coupon ?? false,
  };
}

function hasChanged(prev: PriceRow, next: PriceRow): boolean {
  return (
    money(prev.price) !== money(next.price) ||
    money(prev.price_per_unit) !== money(next.price_per_unit) ||
    prev.on_offer !== next.on_offer ||
    money(prev.regular_price) !== money(next.regular_price) ||
    prev.offer_ends_at !== next.offer_ends_at ||
    money(prev.pfand) !== money(next.pfand) ||
    (prev.multi_buy_quantity ?? null) !== (next.multi_buy_quantity ?? null) ||
    money(prev.multi_buy_price) !== money(next.multi_buy_price) ||
    money(prev.saving_vs_dk_percent) !== money(next.saving_vs_dk_percent) ||
    (prev.coupon ?? false) !== next.coupon
  );
}

/**
 * Whether shop_products has piece_count yet (migration 20261119000000_piece_units.sql, run by
 * hand): until it does, piece counts are left out so saving keeps working.
 */
async function hasPieceCount(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("shop_products").select("piece_count").limit(1);
  if (!error) return true;
  if (error.code === "42703") return false;
  throw error;
}

/**
 * Where a newsletter listing comes from (issue, page, printed text, Tjek's crop) lives in the
 * private shop_product_sources table (migration 20261125000000_private_listing_sources.sql),
 * secret key only: it's Tjek-derived and must not be readable with the publishable key.
 * Without the table a newsletter import fails: the nightly step finds imported issues there.
 */
export const SOURCES = "shop_product_sources";

type SourceRow = { shop_product_id: number; source_issue: string; source_page: number; source_text: string; source_image_url?: string | null; updated_at: string };

async function saveSources(db: SupabaseClient, rows: SourceRow[]) {
  // Rows without a crop (PDF imports) must not clear one: upsert them apart, without the column
  // (a mixed batch would send null for the rows missing it).
  for (const part of [rows.filter((r) => r.source_image_url !== undefined), rows.filter((r) => r.source_image_url === undefined)]) {
    if (!part.length) continue;
    const { error } = await db.from(SOURCES).upsert(part, { onConflict: "shop_product_id" });
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      throw new Error(`${SOURCES} doesn't exist yet - run supabase/migrations/20261125000000_private_listing_sources.sql first`);
    }
    if (error) throw error;
  }
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
  const pieces = await hasPieceCount(db);

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
          ...(pieces && p.pieceCount !== undefined ? { piece_count: p.pieceCount } : {}),
          last_seen_at: now,
          listed_until: p.listedUntil ?? null,
          ...(p.imageUrl !== undefined ? { image_url: p.imageUrl } : {}),
        })),
        { onConflict: "shop_id,shop_product_id" },
      )
      .select("id, shop_product_id");
    if (error) throw error;

    // Only newsletter products carry a source; it goes to the private table, never to
    // shop_products (public). Scraped rows leave it alone.
    const sources: SourceRow[] = data.flatMap(({ id, shop_product_id }) => {
      const s = byShopId.get(shop_product_id)!.source;
      if (!s) return [];
      return [{
        shop_product_id: id,
        source_issue: s.issue,
        source_page: s.page,
        source_text: s.text,
        ...(s.imageUrl !== undefined ? { source_image_url: s.imageUrl } : {}),
        updated_at: now,
      }];
    });
    if (sources.length) await saveSources(db, sources);

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
