/**
 * Reads for the review page (secret key, server only). Two lists:
 *  - suggestions: matches the LLM run flagged with a "LLM suggests same product
 *    as #<id>" note instead of linking (price outlier, bottle vs can, ...)
 *  - LLM links: unreviewed matches the LLM run did save
 * Both are sorted by priority.ts (popular, searched, on sale first) and cut to
 * the most important REVIEW_PAGE_SIZE, so the page stays workable.
 */
import { adminClient, fetchAll } from "@/db/admin";
import { PAGES_BUCKET, pagePath } from "@/flyers/page-paths";
import { isListed } from "@/matching/groups";
import { priority, type Priority } from "./priority";

export const REVIEW_PAGE_SIZE = 50;

export const SUGGESTION_PREFIX = "LLM suggests same product as #";

export interface Listing {
  shopProductId: number;
  shopId: string;
  name: string;
  url: string;
  price: number | null;
  pricePerUnit: number | null;
  onOffer: boolean;
  contentAmount: number | null;
  contentUnit: string | null;
  /** On sale now (seen in the last 3 days, or in a current newsletter). */
  listed: boolean;
  /** Newsletter products: issue, page, printed text, and a short-lived link to the page image. */
  source: { issue: string; page: number; text: string; image: string | null } | null;
}

export interface ProductInfo {
  id: number;
  name: string;
  family: string | null;
  category: string | null;
}

export interface Suggestion {
  self: Listing;
  currentProduct: ProductInfo;
  target: ProductInfo | null; // null if the suggested product no longer exists
  targetListings: Listing[];
  reason: string;
  priority: Priority;
}

export interface LlmLink {
  self: Listing;
  product: ProductInfo;
  confidence: number;
  others: Listing[]; // other shop products linked to the same product
  priority: Priority;
}

interface MatchRow {
  shop_product_id: number;
  product_id: number;
  confidence: number;
  note: string | null;
}

interface LinkedRow {
  product_id: number;
  shop_product_id: number;
  shop_products: {
    shop_id: string;
    name: string;
    url: string;
    content_amount: number | null;
    content_unit: string | null;
    last_seen_at: string | null;
    listed_until: string | null;
    source_issue: string | null;
    source_page: number | null;
    source_text: string | null;
  };
}

interface PriceRow {
  shop_product_id: number;
  price: number;
  price_per_unit: number | null;
  on_offer: boolean;
}

/** "#6299 ("Samyang ..."), not linked: low confidence" -> 6299 and the reasons. */
export function parseSuggestion(note: string): { targetId: number; reason: string } | null {
  if (!note.startsWith(SUGGESTION_PREFIX)) return null;
  const m = note.slice(SUGGESTION_PREFIX.length).match(/^(\d+)/);
  if (!m) return null;
  const reason = note.split("not linked:")[1]?.trim() ?? "";
  return { targetId: Number(m[1]), reason };
}

function toListing(r: LinkedRow, price: PriceRow | undefined): Listing {
  const sp = r.shop_products;
  return {
    shopProductId: r.shop_product_id,
    shopId: sp.shop_id,
    name: sp.name,
    url: sp.url,
    price: price ? Number(price.price) : null,
    pricePerUnit: price?.price_per_unit == null ? null : Number(price.price_per_unit),
    onOffer: price?.on_offer ?? false,
    contentAmount: sp.content_amount === null ? null : Number(sp.content_amount),
    contentUnit: sp.content_unit,
    listed: isListed(sp),
    source:
      sp.source_issue && sp.source_page
        ? { issue: sp.source_issue, page: sp.source_page, text: sp.source_text ?? "", image: null }
        : null,
  };
}

export async function loadReview(): Promise<{
  suggestions: Suggestion[];
  llmLinks: LlmLink[];
  totals: { suggestions: number; llmLinks: number };
}> {
  const db = adminClient();
  // What people searched for in the last 30 days, to rank by.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const searchRows = await fetchAll<{ id: number; query: string }>((f, t) =>
    db.from("search_log").select("id, query").gte("created_at", since).order("id").range(f, t),
  );
  const searches = new Map<string, number>();
  for (const r of searchRows) searches.set(r.query, (searches.get(r.query) ?? 0) + 1);

  const [suggestionRows, llmRows] = await Promise.all([
    fetchAll<MatchRow>((from, to) =>
      db
        .from("product_matches")
        .select("shop_product_id, product_id, confidence, note")
        .like("note", `${SUGGESTION_PREFIX}%`)
        .eq("reviewed", false)
        .order("shop_product_id")
        .range(from, to),
    ),
    fetchAll<MatchRow>((from, to) =>
      db
        .from("product_matches")
        .select("shop_product_id, product_id, confidence, note")
        .eq("method", "llm")
        .eq("reviewed", false)
        .lt("confidence", 1)
        .order("shop_product_id")
        .range(from, to),
    ),
  ]);

  const parsed = new Map(suggestionRows.map((r) => [r.shop_product_id, parseSuggestion(r.note ?? "")]));
  const productIds = [
    ...new Set([
      ...suggestionRows.map((r) => r.product_id),
      ...[...parsed.values()].flatMap((p) => (p ? [p.targetId] : [])),
      ...llmRows.map((r) => r.product_id),
    ]),
  ];

  const products = new Map<number, ProductInfo>();
  const byProduct = new Map<number, Listing[]>();
  const byShopProduct = new Map<number, Listing>();
  // Chunk the id lists so the request URL stays short.
  for (let i = 0; i < productIds.length; i += 200) {
    const ids = productIds.slice(i, i + 200);
    const { data: prodData, error: prodError } = await db
      .from("products")
      .select("id, name, product_families(name, category)")
      .in("id", ids);
    if (prodError) throw prodError;
    for (const p of prodData ?? []) {
      const fam = p.product_families as unknown as { name: string; category: string } | null;
      products.set(p.id, { id: p.id, name: p.name, family: fam?.name ?? null, category: fam?.category ?? null });
    }
    // Every shop product linked to these products. (Not via the matched_prices
    // view: the secret-key role has no grant on it.)
    const linked = await fetchAll<LinkedRow>((from, to) =>
      db
        .from("product_matches")
        .select("product_id, shop_product_id, shop_products(shop_id, name, url, content_amount, content_unit, last_seen_at, listed_until, source_issue, source_page, source_text)")
        .in("product_id", ids)
        .order("shop_product_id")
        .range(from, to)
        .overrideTypes<LinkedRow[], { merge: false }>(), // a to-one embed is an object, not an array
    );
    const prices = new Map<number, PriceRow>();
    const spIds = linked.map((r) => r.shop_product_id);
    for (let j = 0; j < spIds.length; j += 200) {
      const { data, error } = await db
        .from("current_prices")
        .select("shop_product_id, price, price_per_unit, on_offer")
        .in("shop_product_id", spIds.slice(j, j + 200));
      if (error) throw error;
      for (const p of data ?? []) prices.set(p.shop_product_id, p);
    }
    for (const r of linked) {
      const l = toListing(r, prices.get(r.shop_product_id));
      byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), l]);
      byShopProduct.set(r.shop_product_id, l);
    }
  }

  const unknownProduct = (id: number): ProductInfo => ({ id, name: "(ukendt produkt)", family: null, category: null });
  const rank = (self: Listing, products: ProductInfo[], listings: Listing[]) =>
    priority(
      [self.name, ...products.flatMap((p) => [p.name, p.family ?? ""]), ...listings.map((l) => l.name)].filter(Boolean),
      products.find((p) => p.category)?.category ?? null,
      new Set([self, ...listings].map((l) => l.shopId)).size,
      self.listed,
      searches,
    );

  const suggestions = suggestionRows.flatMap((r): Suggestion[] => {
    const p = parsed.get(r.shop_product_id);
    const self = byShopProduct.get(r.shop_product_id);
    if (!p || !self) return [];
    const currentProduct = products.get(r.product_id) ?? unknownProduct(r.product_id);
    const target = products.get(p.targetId) ?? null;
    const targetListings = byProduct.get(p.targetId) ?? [];
    return [
      {
        self,
        currentProduct,
        target,
        targetListings,
        reason: p.reason,
        priority: rank(self, [currentProduct, ...(target ? [target] : [])], targetListings),
      },
    ];
  });

  const llmLinks = llmRows.flatMap((r): LlmLink[] => {
    const self = byShopProduct.get(r.shop_product_id);
    if (!self) return [];
    const product = products.get(r.product_id) ?? unknownProduct(r.product_id);
    const others = (byProduct.get(r.product_id) ?? []).filter((l) => l.shopProductId !== r.shop_product_id);
    return [{ self, product, confidence: Number(r.confidence), others, priority: rank(self, [product], others) }];
  });

  const byPriority = (a: { priority: Priority }, b: { priority: Priority }) => b.priority.score - a.priority.score;
  const shownSuggestions = suggestions.sort(byPriority).slice(0, REVIEW_PAGE_SIZE);
  const shownLinks = llmLinks.sort(byPriority).slice(0, REVIEW_PAGE_SIZE);

  // Newsletter page images for the shown items: signed links to the private bucket, valid an hour.
  const shownListings = [
    ...shownSuggestions.flatMap((s) => [s.self, ...s.targetListings]),
    ...shownLinks.flatMap((l) => [l.self, ...l.others]),
  ].filter((l) => l.source);
  const paths = [...new Set(shownListings.map((l) => pagePath(l.source!.issue, l.source!.page)))];
  if (paths.length) {
    const { data, error } = await db.storage.from(PAGES_BUCKET).createSignedUrls(paths, 3600);
    if (error) console.error("signed page links failed:", error.message);
    const url = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    for (const l of shownListings) l.source!.image = url.get(pagePath(l.source!.issue, l.source!.page)) ?? null;
  }

  return {
    suggestions: shownSuggestions,
    llmLinks: shownLinks,
    totals: { suggestions: suggestions.length, llmLinks: llmLinks.length },
  };
}
