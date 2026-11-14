/**
 * Catalog reads for the website (publishable key). Prices change once a night,
 * so results are cached for an hour.
 *
 * Only shop products seen in the last 3 days are included (the `matched_prices`
 * view filters out products a shop has removed).
 */
import { cacheLife } from "next/cache";
import { publicClient } from "@/db/public";
import { dealPerPiece, effectivePrice, NEWSLETTER_SHOPS } from "./compare";
import type { FamilyInfo } from "./import-limits";
import { COMMON_ITEMS } from "@/matching/common-items";
import { commonTier, finalScore, preScore } from "./ranking";
import { packLabel } from "@/lib/format";
import { POPULAR_PAGE, RESULTS_PAGE } from "./pages";
import type { FamilyResult, Offer, Pack, Shop, Unit } from "./types";

/** Most families rankFamilies() returns (pages are smaller; see RESULTS_PAGE and POPULAR_PAGE). */
const MAX_FAMILIES = 30;

interface ProductRow {
  id: number;
  name: string;
  family_id: number | null;
  content_amount: number | null;
  content_unit: Unit | null;
}

interface ListingShape {
  pack_count: number | null;
  unit_size_amount: number | null;
  unit_size_unit: Unit | null;
  image_url: string | null;
}

interface ListingRow {
  product_id: number;
  shop_products: ListingShape | ListingShape[] | null;
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

/** How fresh each shop's prices are: last nightly scrape, or the newsletter's end date. */
export interface Freshness {
  shop: Shop;
  /** Scraped shops: when the products were last seen. */
  lastSeen: string | null;
  /** Scraped shops not seen for a day and a half - the nightly run missed them. */
  stale: boolean;
  /** Newsletter shops: the end date most of the current issue shares (null if expired). */
  listedUntil: string | null;
}

const STALE_HOURS = 36;

export async function getFreshness(): Promise<Freshness[]> {
  "use cache";
  cacheLife("hours");
  const db = publicClient();
  const today = new Date().toISOString().slice(0, 10);
  // Read here rather than via getShops(): a cached function waiting on another cached
  // call that a page is also making at the same moment makes Next.js abort the render.
  const { data: shops, error: shopError } = await db.from("shops").select("id, name, location, website").order("id");
  if (shopError) throw shopError;
  return Promise.all(
    shops.map(async (shop): Promise<Freshness> => {
      if (NEWSLETTER_SHOPS.has(shop.id)) {
        const { data, error } = await db
          .from("shop_products")
          .select("listed_until")
          .eq("shop_id", shop.id)
          .gte("listed_until", today)
          .limit(2000);
        if (error) throw error;
        const counts = new Map<string, number>();
        for (const r of data) counts.set(r.listed_until, (counts.get(r.listed_until) ?? 0) + 1);
        const main = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
        return { shop, lastSeen: null, stale: false, listedUntil: main };
      }
      const { data, error } = await db
        .from("shop_products")
        .select("last_seen_at")
        .eq("shop_id", shop.id)
        .order("last_seen_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const lastSeen: string | null = data[0]?.last_seen_at ?? null;
      const stale = !lastSeen || Date.now() - Date.parse(lastSeen) > STALE_HOURS * 3600 * 1000;
      return { shop, lastSeen, stale, listedUntil: null };
    }),
  );
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
  // The photo is the first one a scraped shop has (newsletter listings have none).
  const { data: listings, error: listingError } = await db
    .from("product_matches")
    .select("product_id, shop_products(pack_count, unit_size_amount, unit_size_unit, image_url)")
    .in("product_id", products.map((p) => p.id));
  if (listingError) throw listingError;
  const shapes = new Map<number, Map<string, number>>();
  const images = new Map<number, string>();
  for (const l of listings as unknown as ListingRow[]) {
    const sp = Array.isArray(l.shop_products) ? l.shop_products[0] : l.shop_products;
    if (sp?.image_url && !images.has(l.product_id)) images.set(l.product_id, sp.image_url);
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
      imageUrl: images.get(p.id) ?? null,
      // Cheapest first at the price a bulk shopper pays (multi-buy rate when there is one).
      offers: (offersByProduct.get(p.id) ?? []).sort((a, b) => effectivePrice(a) - effectivePrice(b) || a.price - b.price),
    }))
    .filter((p) => p.offers.length > 0); // products no shop currently sells are left out
}


/**
 * Search: families whose name has a word starting with the query (spaces and hyphens
 * match each other), or whose search words contain every query word - all of them,
 * page by page ("rødvin" matched 727 families on 2026-11-14; it used to stop at 30).
 * The order comes from name and search words (ranking.ts); within a page, prices are
 * loaded and availability (shops, packs) breaks near-ties. Families nobody sells right
 * now are left out, so a page can have fewer than RESULTS_PAGE.
 */
export async function searchFamilies(rawQuery: string, page = 0): Promise<FamilyResult[]> {
  "use cache";
  cacheLife("hours");
  const order = await searchOrder(cleanQuery(rawQuery));
  return pageOf(order, page);
}

/** Whether a search has results after page `page` (pages can be short, so their size doesn't tell). */
export async function searchHasMore(rawQuery: string, page: number): Promise<boolean> {
  return (await searchOrder(cleanQuery(rawQuery))).length > (page + 1) * RESULTS_PAGE;
}

/** Whether a category has results after page `page`. */
export async function categoryHasMore(category: string, page: number): Promise<boolean> {
  return (await categoryOrder(category)).length > (page + 1) * RESULTS_PAGE;
}

/** Every family matching the query, best first by name and search words. */
async function searchOrder(q: string): Promise<(FamilyRow & { pre: number })[]> {
  "use cache";
  cacheLife("hours");
  if (q.length < 2) return [];
  const words = q.split(/[ -]/).filter(Boolean);
  // "_" matches any single character, so "coca cola" also finds "Coca-Cola".
  const pattern = q.replace(/[ -]/g, "_");
  const families = await readAll<FamilyRow & { search_words: string[] | null }>(
    "product_families",
    "id, name, category, search_words",
    ["id"],
    (query) => query.or(`name.ilike.${pattern}*,name.ilike.* ${pattern}*,name.ilike.*-${pattern}*,search_words.cs.{${words.join(",")}}`),
  );
  return families
    .map((f) => ({ id: f.id, name: f.name, category: f.category, pre: preScore(f.name, f.search_words ?? [], q) }))
    .sort((a, b) => b.pre - a.pre || a.name.length - b.name.length);
}

/** One page of an ordered family list, with prices; ranked by availability within the page. */
async function pageOf(order: (FamilyRow & { pre: number })[], page: number): Promise<FamilyResult[]> {
  const slice = order.slice(page * RESULTS_PAGE, (page + 1) * RESULTS_PAGE);
  return rankFamilies(slice, new Map(slice.map((f) => [f.id, f.pre])), slice.length);
}

/**
 * A category page: all its families, page by page. Without a query, "what people buy" is
 * guessed from the common-items list and from how many shops sell the family (widely
 * sold = mainstream); within a page, availability breaks near-ties.
 */
export async function categoryFamilies(category: string, page = 0): Promise<FamilyResult[]> {
  "use cache";
  cacheLife("hours");
  return pageOf(await categoryOrder(category), page);
}

async function categoryOrder(category: string): Promise<(FamilyRow & { pre: number })[]> {
  "use cache";
  cacheLife("hours");
  const [families, shops] = await Promise.all([
    readAll<FamilyRow>("product_families", "id, name, category", ["id"], (query) => query.eq("category", category)),
    familyShopCounts(),
  ]);
  return families
    .filter((f) => (shops.get(f.id) ?? 0) > 0) // nobody sells it right now
    .map((f) => ({
      ...f,
      pre: 40 * commonTier(f.name) + 12 * (shops.get(f.id) ?? 0) - 2 * Math.min(f.name.split(" ").length, 8),
    }))
    .sort((a, b) => b.pre - a.pre || a.name.length - b.name.length);
}

/**
 * A whole table or view. PostgREST returns at most 1000 rows per request, so pages are
 * fetched a few at a time (one after another took ~2.7 s for matched_prices' 17,500 rows).
 * Not all at once: every page of a view re-evaluates the view, and 18 parallel requests
 * made the database cancel one ("statement timeout") during a Vercel build, 2026-11-14.
 * No row count is asked for either - counting a view is a full extra pass - pages are
 * read until one comes back short.
 */
async function readAll<T>(
  table: string,
  columns: string,
  orderBy: string[],
  // Narrows the rows, e.g. (q) => q.eq("category", "wine"). Typed loosely: Supabase's builder types don't survive a callback.
  filter: (query: any) => any = (query) => query, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const PAGE = 1000;
  const AT_ONCE = 4;
  // orderBy must make rows unique (add a tiebreak column), or pages can overlap or skip rows.
  const page = (index: number) => {
    let q = filter(publicClient().from(table).select(columns));
    for (const column of orderBy) q = q.order(column);
    return q.range(index * PAGE, (index + 1) * PAGE - 1) as PromiseLike<{ data: T[] | null; error: Error | null }>;
  };
  const rows: T[] = [];
  for (let start = 0; ; start += AT_ONCE) {
    const batch = await Promise.all(Array.from({ length: AT_ONCE }, (_, i) => page(start + i)));
    for (const r of batch) {
      if (r.error) throw r.error;
      rows.push(...(r.data ?? []));
    }
    if (batch.some((r) => (r.data?.length ?? 0) < PAGE)) return rows;
  }
}

/** Number of shops currently selling each family (any pack). */
async function familyShopCounts(): Promise<Map<number, number>> {
  "use cache";
  cacheLife("hours");
  const [prices, products] = await Promise.all([
    readAll<{ product_id: number; shop_id: string }>("matched_prices", "product_id, shop_id", ["product_id", "shop_id"]),
    readAll<{ id: number; family_id: number | null }>("products", "id, family_id", ["id"]),
  ]);
  const familyOf = new Map(products.map((p) => [p.id, p.family_id]));
  const shops = new Map<number, Set<string>>();
  for (const p of prices) {
    const family = familyOf.get(p.product_id);
    if (family) shops.set(family, (shops.get(family) ?? new Set()).add(p.shop_id));
  }
  return new Map([...shops].map(([id, set]) => [id, set.size]));
}

type FamilyRow = { id: number; name: string; category: string };


/**
 * The front page's popular items, page by page, in this order:
 * 1. for each bestseller on the hand-made common-items list, the matching family sold
 *    in the most shops;
 * 2. then every other family sold in at least two shops (worth comparing), common items
 *    first, then by number of shops.
 * Categories take turns (a soda, a beer, a spirit, ...) so a page isn't all cola.
 * Replace the guessed bestsellers with real search counts (search_log) once there's data.
 */
export async function popularFamilies(page = 0): Promise<FamilyResult[]> {
  "use cache";
  cacheLife("hours");
  const order = await popularOrder();
  const slice = order.slice(page * POPULAR_PAGE, (page + 1) * POPULAR_PAGE);
  // A large gap per position keeps this order; availability only breaks near-ties.
  const pre = new Map(slice.map((f, i) => [f.id, 10_000 - 100 * i]));
  return rankFamilies(slice, pre, slice.length);
}

/** The whole popular order (ids and names only; prices are loaded per page). */
async function popularOrder(): Promise<FamilyRow[]> {
  "use cache";
  cacheLife("hours");
  // Families and shop counts are independent, so both load at once.
  const [families, shops] = await Promise.all([
    readAll<FamilyRow>("product_families", "id, name, category", ["id"]),
    familyShopCounts(),
  ]);
  const count = (f: FamilyRow) => shops.get(f.id) ?? 0;

  const bestsellers: FamilyRow[] = [];
  for (const item of COMMON_ITEMS.filter((i) => i.bestseller)) {
    const best = families
      .filter((f) => item.include.test(f.name) && !item.exclude?.test(f.name) && !bestsellers.includes(f))
      .sort((a, b) => count(b) - count(a) || a.name.length - b.name.length)[0];
    if (best && count(best) > 0) bestsellers.push(best);
  }
  const rest = families
    .filter((f) => !bestsellers.includes(f) && count(f) >= 2)
    .sort((a, b) => commonTier(b.name) - commonTier(a.name) || count(b) - count(a) || a.name.length - b.name.length);
  return [...mixCategories(bestsellers), ...mixCategories(rest)];
}

/** Round-robin over categories, keeping the order within each. */
function mixCategories(list: FamilyRow[]): FamilyRow[] {
  const queues = [...Map.groupBy(list, (f) => f.category).values()];
  const mixed: FamilyRow[] = [];
  while (mixed.length < list.length) {
    for (const q of queues) if (q.length) mixed.push(q.shift()!);
  }
  return mixed;
}

/** Loads prices for the best `shortlist` families by `pre`, then ranks them with availability. */
async function rankFamilies(
  families: { id: number; name: string; category: string }[],
  pre: Map<number, number>,
  shortlistSize: number,
): Promise<FamilyResult[]> {
  const shortlist = [...families].sort((a, b) => pre.get(b.id)! - pre.get(a.id)!).slice(0, shortlistSize);
  if (!shortlist.length) return [];

  const packs = await loadPacks([], shortlist.map((f) => f.id));
  const results = shortlist.map((f) => {
    const own = packs.filter((p) => p.familyId === f.id);
    let best: FamilyResult["best"] = null;
    for (const pack of own) {
      for (const o of pack.offers) {
        if (o.pricePerUnit === null || !pack.contentUnit) continue;
        // At the multi-buy rate when there is one, like the basket (compare.ts).
        const perUnit = (o.pricePerUnit * effectivePrice(o)) / o.price;
        if (!best || perUnit < best.pricePerUnit) {
          const deal = dealPerPiece(o) === null ? null : o.multiBuy;
          best = { pricePerUnit: perUnit, unit: pack.contentUnit, shopId: o.shopId, productName: pack.name, coupon: o.coupon, deal };
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
