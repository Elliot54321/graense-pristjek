/**
 * Catalog reads for the website (publishable key). Prices change once a night,
 * so results are cached for an hour.
 *
 * Only shop products seen in the last 3 days are included (the `matched_prices`
 * view filters out products a shop has removed).
 */
import { cacheLife } from "next/cache";
import { publicClient } from "@/db/public";
import { effectivePrice, NEWSLETTER_SHOPS } from "./compare";
import { DEFAULT_SORT, type SortId } from "./sort";
import { familyBest, relevanceOf, sortKeyOf, sortRanked, type SortKey } from "./sorting";
import type { FamilyInfo } from "./import-limits";
import { COMMON_ITEMS } from "@/matching/common-items";
import { commonTier, finalScore, preScore } from "./ranking";
import {
  compactFamily,
  indexFamily,
  indexRow,
  matchScore,
  PARTIAL_MATCH,
  prepareQuery,
  type IndexedFamily,
  type SearchFamily,
  type SearchRow,
} from "./search";
import { packLabel } from "@/lib/format";
import { POPULAR_PAGE, RESULTS_PAGE } from "./pages";
import { isSubcategoryOf } from "./categories";
import type { DisplayPer, FamilyResult, Offer, Pack, ResultPage, Shop, Unit } from "./types";

/** Most families rankFamilies() returns (pages are smaller; see RESULTS_PAGE and POPULAR_PAGE). */
const MAX_FAMILIES = 30;

interface FamilyUnitRow {
  compare_unit: Unit | null;
  piece_label: string | null;
  /** Display only (migration 20261120000000); missing until that migration is run. */
  display_per?: DisplayPer | null;
}

interface ProductRow {
  id: number;
  name: string;
  family_id: number | null;
  content_amount: number | null;
  content_unit: Unit | null;
  piece_count: number | null;
  product_families: FamilyUnitRow | FamilyUnitRow[] | null;
}

interface ListingShape {
  id: number;
  piece_count: number | null;
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
  shop_product_id: number;
  shop_id: string;
  name: string;
  content_amount: number | null;
  content_unit: Unit | null;
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

/**
 * What one piece of a shop's offer contains, for its price per l/kg (search) and how many
 * pieces the list buys. Usually the listing and its product agree. When they don't, one of
 * them is wrong and we can't tell which: one barcode shared by sizes (BorderShop's 0,25 l Hans
 * Baer linked to a 0,75 l product), or a misread listing (ScandiPark's "7er Pack 98g" stored
 * as 686 g) or product ("24x40g" stored as 40 g). The smaller content is taken, so a
 * disagreement can only make that shop look dearer, never falsely cheapest (trust audit
 * 2026-11-15). Different units: the product's, so the family compares in one unit.
 */
function offerContent(
  listing: { content_amount: number | null; content_unit: Unit | null },
  product: ProductRow | undefined,
): { amount: number; unit: Unit } | null {
  const sized = (r: { content_amount: number | null; content_unit: Unit | null } | undefined) =>
    r && Number(r.content_amount) > 0 && r.content_unit ? { amount: Number(r.content_amount), unit: r.content_unit } : null;
  const own = sized(listing);
  const theirs = sized(product);
  if (!own || !theirs) return own ?? theirs;
  if (own.unit !== theirs.unit) return theirs;
  return own.amount < theirs.amount ? own : theirs;
}

/**
 * Pieces in one offer of a 'piece' family: the smaller of the listing's count and the product's
 * when both are known (the content rule above, for the same reason), else whichever is known.
 */
function offerPieces(listing: number | null | undefined, product: number | null): number | null {
  const counts = [listing, product].filter((n): n is number => Number(n) > 0).map(Number);
  return counts.length ? Math.min(...counts) : null;
}

const PRICE_COLUMNS =
  "product_id, shop_product_id, shop_id, name, content_amount, content_unit, price, price_per_unit, on_offer, regular_price, offer_ends_at, url, observed_at, multi_buy_quantity, multi_buy_price, saving_vs_dk_percent, coupon";

/** PRICE_COLUMNS without the text and dates the sort keys never look at (sortKeyTable). */
const SORT_PRICE_COLUMNS =
  "product_id, shop_product_id, shop_id, content_amount, content_unit, price, price_per_unit, on_offer, regular_price, multi_buy_quantity, multi_buy_price, saving_vs_dk_percent, coupon";

async function loadPacks(productIds: number[], familyIds: number[]): Promise<Pack[]> {
  const db = publicClient();
  const filters: string[] = [];
  if (familyIds.length) filters.push(`family_id.in.(${familyIds.join(",")})`);
  if (productIds.length) filters.push(`id.in.(${productIds.join(",")})`);
  if (!filters.length) return [];

  const readProducts = (familyColumns: string) =>
    db
      .from("products")
      .select(`id, name, family_id, content_amount, content_unit, piece_count, product_families(${familyColumns})` as string)
      .or(filters.join(","))
      .returns<ProductRow[]>();
  let { data: products, error } = await readProducts("compare_unit, piece_label, display_per");
  // 42703 = column doesn't exist yet: display_per until its migration is run - prices still work.
  if (error?.code === "42703") ({ data: products, error } = await readProducts("compare_unit, piece_label"));
  if (error) throw error;
  if (!products) return [];
  if (!products.length) return [];

  const { data: prices, error: priceError } = await db
    .from("matched_prices")
    .select(PRICE_COLUMNS)
    .in("product_id", products.map((p) => p.id))
    .returns<PriceRow[]>();
  if (priceError) throw priceError;

  // Pack shape ("24 x 0,33 l") from the shops' listings; the most common one wins.
  // The photo is the first one a scraped shop has (newsletter listings have none).
  const { data: listings, error: listingError } = await db
    .from("product_matches")
    .select("product_id, shop_products(id, piece_count, pack_count, unit_size_amount, unit_size_unit, image_url)")
    .in("product_id", products.map((p) => p.id));
  if (listingError) throw listingError;
  const shapes = new Map<number, Map<string, number>>();
  const images = new Map<number, string>();
  const listingPieces = new Map<number, number | null>();
  for (const l of listings as unknown as ListingRow[]) {
    const sp = Array.isArray(l.shop_products) ? l.shop_products[0] : l.shop_products;
    if (sp) listingPieces.set(sp.id, sp.piece_count);
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
    return { count: Number(count), size: Number(size), unit: unit as Unit } satisfies PackShape;
  };

  return buildPacks(products, prices as PriceRow[], listingPieces, shapeOf, images);
}

type PackShape = { count: number; size: number; unit: Unit };

/**
 * Packs with their offers from the raw rows - shared by loadPacks (cards and the list) and
 * allPacks (sort keys), so a sorted price is always the one the card shows. `listingPieces`:
 * piece_count per shop product id; `shapeOf` and `images` only affect labels and photos.
 */
function buildPacks(
  products: ProductRow[],
  prices: PriceRow[],
  listingPieces: Map<number, number | null>,
  shapeOf: (productId: number) => PackShape | null,
  images: Map<number, string>,
): Pack[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const unitOf = (p: ProductRow | undefined): FamilyUnitRow | null =>
    (Array.isArray(p?.product_families) ? p.product_families[0] : p?.product_families) ?? null;
  // A 'piece' family is priced per piece only, never per l/kg: an offer's "content" is its piece
  // count (unit 'piece'), or unknown - then it has no price per unit and the list buys it by pack.
  const isPieceFamily = (p: ProductRow | undefined) => unitOf(p)?.compare_unit === "piece";
  const offersByProduct = new Map<number, Offer[]>();
  for (const r of prices) {
    const product = productById.get(r.product_id);
    let content: { amount: number; unit: Unit } | null;
    if (isPieceFamily(product)) {
      const pieces = offerPieces(listingPieces.get(r.shop_product_id), product!.piece_count);
      content = pieces ? { amount: pieces, unit: "piece" } : null;
    } else content = offerContent(r, product);
    const offer: Offer = {
      productId: r.product_id,
      shopId: r.shop_id,
      shopProductName: r.name,
      contentAmount: content?.amount ?? null,
      contentUnit: content?.unit ?? null,
      price: Number(r.price),
      pricePerUnit: content
        ? Number(r.price) / content.amount
        : r.price_per_unit === null || isPieceFamily(product)
          ? null
          : Number(r.price_per_unit),
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

  return products
    .map((p): Pack => {
      const offers = (offersByProduct.get(p.id) ?? []).sort((a, b) => effectivePrice(a) - effectivePrice(b) || a.price - b.price);
      const family = unitOf(p);
      const common = {
        productId: p.id,
        name: p.name,
        familyId: p.family_id,
        compareUnit: family?.compare_unit ?? null,
        pieceLabel: family?.compare_unit === "piece" ? family.piece_label || "stk." : null,
        displayPer: family?.display_per ?? null,
        imageUrl: images.get(p.id) ?? null,
        // Cheapest first at the price a bulk shopper pays (multi-buy rate when there is one).
        offers,
      };
      if (common.compareUnit === "piece") {
        // The pack's piece count: the product's, else the smallest its offers know - only when every
        // offer knows one (a pack whose count is unknown somewhere is compared per pack).
        const counts = offers.map((o) => o.contentAmount);
        const pieces = Number(p.piece_count) > 0 ? Number(p.piece_count) : counts.length && counts.every((c) => c !== null) ? Math.min(...(counts as number[])) : null;
        // Without a count the label still says what the pack is ("1,2 kg"), just never a price per kg.
        const label = pieces ? `${pieces} stk.` : packLabel(null, null, p.content_unit, p.content_amount === null ? null : Number(p.content_amount));
        return { ...common, contentAmount: pieces, contentUnit: pieces ? "piece" : null, packLabel: label };
      }
      return {
        ...common,
        contentAmount: p.content_amount === null ? null : Number(p.content_amount),
        contentUnit: p.content_unit,
        packLabel: (() => {
          const shape = shapeOf(p.id);
          const content = p.content_amount === null ? null : Number(p.content_amount);
          // Only trust the shape if it adds up to the product's content (7,92 = 24 x 0,33).
          const fits = shape && content && shape.unit === p.content_unit && Math.abs(shape.count * shape.size - content) / content < 0.02;
          return fits ? packLabel(shape.count, shape.size, shape.unit, content) : packLabel(null, null, p.content_unit, content);
        })(),
      };
    })
    .filter((p) => p.offers.length > 0); // products no shop currently sells are left out
}


/**
 * Search: families matching every query word in any order, forgiving punctuation, accents, Danish
 * spellings and endings ("wrigleys" finds "Wrigley's", "jagermeister" "Jägermeister"; search.ts),
 * page by page. The order comes from name and search words (ranking.ts); within a page, prices
 * are loaded and availability (shops, packs) breaks near-ties. Families nobody sells right now are
 * left out, so a page can have fewer than RESULTS_PAGE.
 *
 * When fewer than FEW_RESULTS families on sale match, typo matches from the database
 * (`search_families_fuzzy`, pg_trgm) follow, ranked below every exact match. If the first result
 * is such a typo match, `suggestion` names it ("Mente du: Stroh Jagertee?").
 */
export async function searchFamilies(rawQuery: string, from = 0, sort: SortId = DEFAULT_SORT): Promise<ResultPage> {
  "use cache";
  cacheLife("hours");
  const { order, fuzzy, firstPage } = await searchOrder(rawQuery);
  if (sort !== DEFAULT_SORT) {
    const [page, keys] = await Promise.all([sortedPage(order, from, sort), familySortKeys()]);
    // The typo hint goes by relevance, not the chosen order: the most relevant family on sale is a
    // typo match, i.e. none on sale matched as typed (typo matches come after every word match).
    const top = order.find((f) => keys.has(f.id));
    return { ...page, suggestion: from === 0 && top && fuzzy.includes(top.id) ? top.name : null };
  }
  const page = from === 0 && firstPage ? firstPage : await pageFrom(order, from);
  const first = page.families[0];
  return { ...page, suggestion: from === 0 && first && fuzzy.includes(first.id) ? first.name : null };
}

/** Below this many families on sale, typo matches are added. */
const FEW_RESULTS = 3;
/** Exact matches beyond this are assumed to include enough on sale (pricing them all would be slow). */
const CHECK_SOLD_UP_TO = 20;
/**
 * Typo matches this much less similar than the best one are dropped: "gamel dansk" finds Gammel
 * Dansk (0.79-0.92) but not "Dänische Rote Grütze" (0.58) or "Rexim Dansk Peber" (0.50).
 */
const FUZZY_SPREAD = 0.2;

/**
 * Every family matching the query, best first by name and search words; then typo matches.
 * `firstPage`: page 1 when it was already priced to decide on typo matches (and none were added).
 */
async function searchOrder(
  rawQuery: string,
): Promise<{ order: Ranked[]; fuzzy: number[]; firstPage?: ResultPage }> {
  "use cache";
  cacheLife("hours");
  const q = prepareQuery(rawQuery.slice(0, 100));
  if (q.key.length < 2) return { order: [], fuzzy: [] };
  const exact = (await searchIndex())
    .flatMap((f) => {
      const text = matchScore(f, q);
      if (text === null) return [];
      // A match missing one word (text 5) comes after every full match. `strong`: every word is
      // a whole name or search word (matchScore 35+) - the results a price sort applies to.
      const pre = preScore(f, q, text) - (text === PARTIAL_MATCH ? 200 : 0);
      return [{ id: f.id, name: f.name, category: f.category, pre, strong: text >= STRONG_MATCH }];
    })
    .sort((a, b) => b.pre - a.pre || a.name.length - b.name.length);
  if (exact.length > CHECK_SOLD_UP_TO) return { order: exact, fuzzy: [] };
  const firstPage = await pageFrom(exact, 0);
  // Very short queries are too loose for typo matching ("ab" is similar to too much).
  if (firstPage.families.length >= FEW_RESULTS || q.key.length < 3) return { order: exact, fuzzy: [], firstPage };

  const seen = new Set(exact.map((f) => f.id));
  const hits = (await fuzzyFamilies(q.key)).filter((f) => !seen.has(f.id));
  const best = Math.max(0, ...hits.map((f) => f.similarity));
  // Similarity 0..1 -> -3000..-1000: below every word match, and steep enough that 0.05 more
  // similarity (100) outweighs being sold in more shops (8 per shop, see finalScore), so
  // "redbull" lists Red Bull (0.55) before Redbreast (0.50).
  const fuzzy = hits
    .filter((f) => f.similarity >= best - FUZZY_SPREAD)
    .map((f) => ({ ...f, pre: -3000 + 2000 * f.similarity }));
  if (!fuzzy.length) return { order: exact, fuzzy: [], firstPage };
  return { order: [...exact, ...fuzzy.map(({ id, name, category, pre }) => ({ id, name, category, pre }))], fuzzy: fuzzy.map((f) => f.id) };
}

/** All families with their name and search words prepared for matching (search.ts). */
async function searchIndex(): Promise<IndexedFamily[]> {
  "use cache";
  cacheLife("hours");
  try {
    return (await searchRows()).map(indexRow);
  } catch (error) {
    // The shared cache must never break search: build the index here instead.
    console.error("searchRows (remote cache) failed, building in memory:", error);
    return (await readSearchFamilies()).map(indexFamily);
  }
}

/**
 * Every family as a compact row (search.ts SearchRow) in the shared remote cache, so a cold
 * server instance doesn't read all ~9,600 families per search (~0,7 s; searches took 1,0-1,6 s
 * live, 2026-11-23). Vercel's runtime cache takes items up to 2 MB (its docs don't say what happens
 * above): the prepared index is 1,9 MB and the raw rows 1,2 MB, these rows 0,53 MB. Checked to
 * match identically: 83 queries x 9,586 families, 0 differences.
 */
async function searchRows(): Promise<SearchRow[]> {
  "use cache: remote";
  cacheLife("hours");
  return (await readSearchFamilies()).map(compactFamily);
}

const readSearchFamilies = () => readAll<SearchFamily>("product_families", "id, name, category, search_words", ["id"]);

/**
 * Typo matches from the database (pg_trgm word similarity on name + search words; migration
 * 20261118000000). Until that migration is run the function doesn't exist, and search simply has
 * no typo matches.
 */
async function fuzzyFamilies(key: string): Promise<(FamilyRow & { similarity: number })[]> {
  const { data, error } = await publicClient().rpc("search_families_fuzzy", { q: key });
  if (error) {
    if (error.code !== "PGRST202" && error.code !== "42883") console.error("search_families_fuzzy failed:", error.message);
    return [];
  }
  return (data as (FamilyRow & { similarity: number })[]).map((f) => ({ ...f, similarity: Number(f.similarity) }));
}

/**
 * One page of an ordered family list, starting at position `from`: the next RESULTS_PAGE
 * families someone sells right now (unsold ones are skipped, so every page but the last is
 * full), ranked by availability within the page. `next` is where the following page starts,
 * or null at the end - "Vis flere resultater" passes it back.
 */
async function pageFrom(
  order: (FamilyRow & { pre: number })[],
  from: number,
  sorted?: { sort: SortId; keys: Map<number, SortKey>; tail?: Set<number> },
): Promise<ResultPage> {
  const pre = new Map(order.map((f) => [f.id, f.pre]));
  const taken: Scored[] = [];
  let pos = from;
  while (taken.length < RESULTS_PAGE && pos < order.length) {
    // Twice what's missing per round: some families aren't sold right now.
    const window = order.slice(pos, pos + Math.max(6, 2 * (RESULTS_PAGE - taken.length)));
    for (const r of await priceFamilies(window, pre)) {
      pos++;
      if (r.result.packs.length) taken.push(r);
      if (taken.length === RESULTS_PAGE) break;
    }
  }
  const next = pos < order.length ? pos : null;
  // A chosen sort keeps its order; the popular one lets availability break near-ties per page.
  if (!sorted) return { families: taken.sort(byScore).map((r) => r.result), next };
  const families = taken.map((r) => r.result);
  if (sorted.sort === "forskel") {
    for (const f of families) {
      const saving = sorted.keys.get(f.id)?.saving;
      if (saving && !sorted.tail?.has(f.id)) f.saving = saving;
    }
  }
  return { families, next };
}

/**
 * The whole ranked list in a chosen order (sort.ts), families nobody sells left out - sorted
 * before it's cut into pages, so "Vis flere" continues the same order.
 */
async function sortedPage(order: Ranked[], from: number, sort: SortId): Promise<ResultPage> {
  const keys = await familySortKeys();
  const sortable = order.flatMap((f) => {
    const key = keys.get(f.id);
    return key ? [{ ...f, key }] : [];
  });
  const sorted = sortRanked(sortable, sort).map(({ key: _key, ...f }) => f); // eslint-disable-line @typescript-eslint/no-unused-vars
  // The weak tail of a search follows in popular order, so it shows no "spar" amount out of order.
  const relevant = relevanceOf(sortable);
  const tail = new Set(sortable.filter((f) => !relevant(f)).map((f) => f.id));
  return pageFrom(sorted, from, { sort, keys, tail });
}

/** Sort keys for every family on sale (sorting.ts), from the shared table below. */
async function familySortKeys(): Promise<Map<number, SortKey>> {
  "use cache";
  cacheLife("hours");
  return new Map((await sortKeyTable()).map(unpackKey));
}

/**
 * One family's SortKey as a flat row, so the whole table stays small in the remote cache (~0,4 MB
 * instead of 0,9 MB as objects): id, per unit, unit group, pack price, saving kr., vs shop,
 * on offer (1/0), offer %, offer per unit. Prices are rounded to 0,0001 kr. - no order changes.
 */
type KeyRow = [number, number | null, string | null, number, number | null, string | null, 0 | 1, number | null, number | null];
const r4 = (n: number | null) => (n === null ? null : Math.round(n * 1e4) / 1e4);
const packKey = (id: number, k: SortKey): KeyRow => [
  id,
  r4(k.unit?.perUnit ?? null),
  k.unit?.group ?? null,
  r4(k.packPrice)!,
  k.saving?.kr ?? null,
  k.saving?.vsShop ?? null,
  k.offer ? 1 : 0,
  r4(k.offer?.percent ?? null),
  r4(k.offer?.perUnit ?? null),
];
const unpackKey = ([id, perUnit, group, packPrice, kr, vsShop, offer, percent, offerPerUnit]: KeyRow): [number, SortKey] => [
  id,
  {
    unit: perUnit !== null && group !== null ? { perUnit, group } : null,
    packPrice,
    saving: kr !== null && vsShop !== null ? { kr, vsShop } : null,
    offer: offer ? { percent, perUnit: offerPerUnit } : null,
  },
];

/**
 * The sort keys of every family on sale, from one read of all prices - cheaper than pricing a
 * whole category's cards - in the shared remote cache, since every sorted request needs it and
 * on Vercel the in-memory cache rarely survives between requests (it took 5-7 s per request,
 * 2026-11-23). Built with the cards' own code (buildPacks), so the order matches the prices
 * shown; labels and photos aren't read here.
 */
async function sortKeyTable(): Promise<KeyRow[]> {
  "use cache: remote";
  cacheLife("hours");
  const productColumns = "id, name, family_id, content_amount, content_unit, piece_count, product_families";
  const [products, prices, listings] = await Promise.all([
    readAll<ProductRow>("products", `${productColumns}(compare_unit, piece_label, display_per)`, ["id"]).catch((error) => {
      if (error?.code !== "42703") throw error; // display_per before its migration is run
      return readAll<ProductRow>("products", `${productColumns}(compare_unit, piece_label)`, ["id"]);
    }),
    // Only what the sort keys use: names, URLs and dates are ~20 % of the read time (2026-11-23).
    readAll<PriceRow>("matched_prices", SORT_PRICE_COLUMNS, ["shop_product_id"]).then((rows) =>
      rows.map((r) => ({ ...r, name: "", url: "", observed_at: "", offer_ends_at: null })),
    ),
    readAll<{ id: number; piece_count: number }>("shop_products", "id, piece_count", ["id"], (q) => q.not("piece_count", "is", null)),
  ]);
  const packs = buildPacks(products, prices, new Map(listings.map((l) => [l.id, l.piece_count])), () => null, new Map());
  const rows: KeyRow[] = [];
  for (const [family, own] of Map.groupBy(packs, (p) => p.familyId)) {
    const key = family === null ? null : sortKeyOf(own);
    if (key) rows.push(packKey(family!, key));
  }
  return rows;
}

/**
 * A category page: all its families, page by page - of a top category (`category` is
 * `product_families.category`), or of one of its subcategories (`subcategory` is a
 * `product_families.subcategory` id from categories.ts). Without a query, "what people
 * buy" is guessed from the common-items list and from how many shops sell the family
 * (widely sold = mainstream); within a page, availability breaks near-ties.
 */
export async function categoryFamilies(
  category: string,
  from = 0,
  subcategory?: string,
  sort: SortId = DEFAULT_SORT,
): Promise<ResultPage> {
  "use cache";
  cacheLife("hours");
  const order = await categoryOrder(category, subcategory);
  return sort === DEFAULT_SORT ? pageFrom(order, from) : sortedPage(order, from, sort);
}

async function categoryOrder(category: string, subcategory?: string): Promise<(FamilyRow & { pre: number })[]> {
  "use cache";
  cacheLife("hours");
  const [families, shops] = await Promise.all([
    // A top category reads no subcategory column, so its pages work before the migration is run.
    readAll<FamilyRow>("product_families", "id, name, category", ["id"], (query) =>
      subcategory ? query.eq("category", category).eq("subcategory", subcategory) : query.eq("category", category),
    ),
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

/** Families on sale right now per top category, split by subcategory. */
export interface CategoryCount {
  /** All families on sale in the top category (what its page lists). */
  total: number;
  /** Per subcategory id from categories.ts; ids with no families are left out. */
  subcategories: Record<string, number>;
  /** Families with no subcategory or an id categories.ts doesn't list ("Øvrige"). */
  other: number;
}

/**
 * How many families on sale each category and subcategory has (keyed by id), so the UI
 * can hide empty ones. Cheap: shares familyShopCounts() with the category pages. Before
 * the subcategory migration is run, everything counts as "other".
 */
export async function categoryCounts(): Promise<Record<string, CategoryCount>> {
  "use cache";
  cacheLife("hours");
  type Row = { id: number; category: string; subcategory: string | null };
  const [families, shops] = await Promise.all([
    readAll<Row>("product_families", "id, category, subcategory", ["id"]).catch(async (error) => {
      if (error?.code !== "42703") throw error; // 42703 = column doesn't exist yet
      const rows = await readAll<Omit<Row, "subcategory">>("product_families", "id, category", ["id"]);
      return rows.map((r) => ({ ...r, subcategory: null }));
    }),
    familyShopCounts(),
  ]);
  const counts: Record<string, CategoryCount> = {};
  for (const f of families) {
    if (!shops.get(f.id)) continue; // nobody sells it right now
    const c = (counts[f.category] ??= { total: 0, subcategories: {}, other: 0 });
    c.total++;
    if (isSubcategoryOf(f.category, f.subcategory)) c.subcategories[f.subcategory!] = (c.subcategories[f.subcategory!] ?? 0) + 1;
    else c.other++;
  }
  return counts;
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
  // Shared remote cache (~80 KB): category pages, popular items and categoryCounts all need it,
  // and it reads all of matched_prices.
  "use cache: remote";
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
/** A family in a ranked list; `strong` only on search results (see sortRanked in sorting.ts). */
type Ranked = FamilyRow & { pre: number; strong?: boolean };
/** matchScore() from here up: every query word is a whole word of the name or a search word. */
const STRONG_MATCH = 35;


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
  const results = await priceFamilies(shortlist, pre);

  // Families nobody sells right now are dropped.
  return results
    .filter((r) => r.result.packs.length > 0)
    .sort(byScore)
    .slice(0, MAX_FAMILIES)
    .map((r) => r.result);
}

type Scored = { result: FamilyResult; score: number };
const byScore = (a: Scored, b: Scored) => b.score - a.score || a.result.name.length - b.result.name.length;

/**
 * Prices and the cheapest price per liter/kg for each family, in the given order, with a
 * score (pre + availability). A family nobody sells right now comes back with no packs.
 */
async function priceFamilies(families: FamilyRow[], pre: Map<number, number>): Promise<Scored[]> {
  if (!families.length) return [];
  const packs = await loadPacks([], families.map((f) => f.id));
  return families.map((f) => {
    const own = packs.filter((p) => p.familyId === f.id);
    const compareUnit = own[0]?.compareUnit ?? null;
    const best = familyBest(own)?.best ?? null;
    const shops = new Set(own.flatMap((p) => p.offers.map((o) => o.shopId))).size;
    const result: FamilyResult = {
      id: f.id,
      name: f.name,
      category: f.category,
      compareUnit,
      pieceLabel: own[0]?.pieceLabel ?? null,
      displayPer: own[0]?.displayPer ?? null,
      best,
      packs: own,
    };
    // Nothing to compare per liter/kg: the list takes an exact pack instead (see FamilyResult.listPack).
    if (!best && own.length) {
      const pack = [...own].sort(
        (a, b) => new Set(b.offers.map((o) => o.shopId)).size - new Set(a.offers.map((o) => o.shopId)).size || effectivePrice(a.offers[0]) - effectivePrice(b.offers[0]),
      )[0];
      result.listPack = { productId: pack.productId, name: pack.name, imageUrl: pack.imageUrl ?? own.find((p) => p.imageUrl)?.imageUrl ?? null };
    }
    return { result, score: finalScore(pre.get(f.id)!, shops, own.length) };
  });
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
