/**
 * Review decisions on newsletter products carry over to the next issue.
 *
 * An offer printed with the same name and pack keeps its shop product (stable id,
 * see flyers/import.ts), so its match - and the review - simply comes along. This
 * covers small rewordings on top of that: "Heineken 0.0" -> "Heineken 0,0",
 * "18-24 x" -> "18 - 24 x", "Kæmpeplade Hvid" -> "Hvid Kæmpeplade". Only the exact
 * same words (any order, case or punctuation) with the same content count, so
 * "Coca-Cola" and "Coca-Cola Zero" never share a decision. Only matches a human
 * reviewed are copied, within the same shop, and not when the price jumped more
 * than the usual safety margin. Runs at the start of `match:new`, before any API call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "../db/admin";

const NEWSLETTER_SHOPS = ["fleggaard", "calle"];
const MAX_PRICE_RATIO = 1.4; // same margin as the LLM link safety rule

interface Row {
  id: number;
  shop_id: string;
  name: string;
  content_amount: number | null;
  content_unit: string | null;
  product_matches:
    | { product_id: number; method: string; confidence: number; reviewed: boolean }
    | { product_id: number; method: string; confidence: number; reviewed: boolean }[]
    | null;
}

/** "Heineken 0,0 24 x 0,33 l." and "Heineken 0.0 24 x 0,33 l" -> the same key. */
export function wordingKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2") // decimal comma = decimal point
    .split(/[^\p{L}\p{N}.%]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, "")) // "l." -> "l"
    .filter(Boolean)
    .sort()
    .join(" ");
}

const keyOf = (r: Row) => `${r.shop_id}|${wordingKey(r.name)}|${r.content_amount === null ? "?" : Number(r.content_amount)}${r.content_unit ?? ""}`;
const matchOf = (r: Row) => (Array.isArray(r.product_matches) ? r.product_matches[0] : r.product_matches) ?? null;

/** Copy reviewed decisions onto new, unmatched newsletter products. Returns how many. */
export async function carryOverReviewed(db: SupabaseClient, dryRun: boolean): Promise<number> {
  const [rows, prices] = await Promise.all([
    fetchAll<Row>((f, t) =>
      db
        .from("shop_products")
        .select("id, shop_id, name, content_amount, content_unit, product_matches(product_id, method, confidence, reviewed)")
        .in("shop_id", NEWSLETTER_SHOPS)
        .order("id")
        .range(f, t),
    ),
    fetchAll<{ shop_product_id: number; price: number }>((f, t) =>
      db.from("current_prices").select("shop_product_id, price").in("shop_id", NEWSLETTER_SHOPS).order("shop_product_id").range(f, t),
    ),
  ]);
  const priceOf = new Map(prices.map((p) => [p.shop_product_id, Number(p.price)]));

  // Reviewed decisions by wording; a wording reviewed two different ways is ambiguous - skip it.
  const reviewed = new Map<string, { row: Row; productId: number; method: string } | null>();
  for (const r of rows) {
    const m = matchOf(r);
    if (!m?.reviewed) continue;
    const key = keyOf(r);
    const seen = reviewed.get(key);
    if (seen === undefined) reviewed.set(key, { row: r, productId: m.product_id, method: m.method });
    else if (seen && seen.productId !== m.product_id) reviewed.set(key, null);
  }

  const carried: { shop_product_id: number; product_id: number; method: string; confidence: number; reviewed: boolean; note: string }[] = [];
  for (const r of rows) {
    if (matchOf(r)) continue; // already matched (or same wording as before: same row)
    const from = reviewed.get(keyOf(r));
    if (!from) continue;
    const [a, b] = [priceOf.get(r.id), priceOf.get(from.row.id)];
    if (a && b && Math.max(a, b) / Math.min(a, b) > MAX_PRICE_RATIO) continue; // let match:new look at it
    carried.push({
      shop_product_id: r.id,
      product_id: from.productId,
      method: from.method,
      confidence: 1,
      reviewed: true,
      note: `Carried over from #${from.row.id} ("${from.row.name}"), reviewed in an earlier issue`,
    });
    console.log(`  carry over: "${from.row.name}" -> "${r.name}"`);
  }
  if (carried.length && !dryRun) {
    const { error } = await db.from("product_matches").upsert(carried, { onConflict: "shop_product_id" });
    if (error) throw error;
  }
  return carried.length;
}
