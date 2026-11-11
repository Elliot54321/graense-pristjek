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
/** Unreviewed LLM links below this are held back from the site (migration 20261111000000). */
const SHOWN_CONFIDENCE = 0.8;

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

/**
 * Fleggaard and Calle are one company and print the same offers. When both issues are
 * imported the same day, `match:new` can't link one new product to the other (it only
 * offers existing products as candidates), so twin offers got a product each. Offers
 * with the same wording and content at both shops become one product: the side a human
 * decided wins, else the side linked to another shop's product (a link shown on the
 * site, 0.8+), else the side with its own product (a weak link is hidden anyway, so it
 * shouldn't hide its twin too), else Fleggaard's. The
 * moved twin takes over the winner's method, confidence and review, so one review
 * covers both. Twins reviewed two different ways are left alone and listed.
 */
export async function linkNewsletterTwins(db: SupabaseClient, dryRun: boolean): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, prices] = await Promise.all([
    fetchAll<Row & { listed_until: string | null }>((f, t) =>
      db
        .from("shop_products")
        .select("id, shop_id, name, content_amount, content_unit, listed_until, product_matches(product_id, method, confidence, reviewed)")
        .in("shop_id", NEWSLETTER_SHOPS)
        .gte("listed_until", today)
        .order("id")
        .range(f, t),
    ),
    fetchAll<{ shop_product_id: number; price: number }>((f, t) =>
      db.from("current_prices").select("shop_product_id, price").in("shop_id", NEWSLETTER_SHOPS).order("shop_product_id").range(f, t),
    ),
  ]);
  const priceOf = new Map(prices.map((p) => [p.shop_product_id, Number(p.price)]));
  const wording = (r: Row) => keyOf({ ...r, shop_id: "" });
  const byShop = (shop: string) => {
    const map = new Map<string, Row[]>();
    for (const r of rows) if (r.shop_id === shop && matchOf(r)) map.set(wording(r), [...(map.get(wording(r)) ?? []), r]);
    return map;
  };
  const [fleggaard, calle] = [byShop("fleggaard"), byShop("calle")];

  const updates: { shop_product_id: number; product_id: number; method: string; confidence: number; reviewed: boolean; note: string }[] = [];
  for (const [key, fs] of fleggaard) {
    const cs = calle.get(key);
    if (!cs || fs.length !== 1 || cs.length !== 1) continue; // only unambiguous pairs
    const [f, c] = [fs[0], cs[0]];
    const [mf, mc] = [matchOf(f)!, matchOf(c)!];
    if (mf.product_id === mc.product_id) continue;
    const [pf, pc] = [priceOf.get(f.id), priceOf.get(c.id)];
    if (pf && pc && Math.max(pf, pc) / Math.min(pf, pc) > MAX_PRICE_RATIO) continue;
    const isHuman = (m: NonNullable<ReturnType<typeof matchOf>>) => m.reviewed || m.method === "manual";
    if (isHuman(mf) && isHuman(mc)) {
      console.log(`  twins decided two ways, left alone: "${f.name}" fleggaard #${mf.product_id} / calle #${mc.product_id}`);
      continue;
    }
    // Winner: human 3, shown link 2, own product 1, weak link (held back from the site) 0; tie: Fleggaard.
    const score = (m: NonNullable<ReturnType<typeof matchOf>>) =>
      isHuman(m) ? 3 : Number(m.confidence) >= 1 ? 1 : Number(m.confidence) >= SHOWN_CONFIDENCE ? 2 : 0;
    const fleggaardWins = score(mf) >= score(mc);
    const [win, lose, winRow] = fleggaardWins ? [mf, c, f] : [mc, f, c];
    updates.push({
      shop_product_id: lose.id,
      product_id: win.product_id,
      method: win.method,
      confidence: Number(win.confidence),
      reviewed: isHuman(win),
      note: `Same newsletter offer as ${winRow.shop_id} #${winRow.id} ("${winRow.name}")`,
    });
    console.log(`  twin: "${lose.name}" ${lose.shop_id} #${matchOf(lose)!.product_id} -> #${win.product_id} (${win.method}${isHuman(win) ? ", reviewed" : ""})`);
  }
  if (updates.length && !dryRun) {
    const { error } = await db.from("product_matches").upsert(updates, { onConflict: "shop_product_id" });
    if (error) throw error;
  }
  return updates.length;
}
