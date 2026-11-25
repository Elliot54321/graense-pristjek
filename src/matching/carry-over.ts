/**
 * Decisions on newsletter products carry over to the next issue.
 *
 * An offer printed with the same name and pack keeps its shop product (stable id,
 * see flyers/import.ts), so its match - and the review - simply comes along. This
 * covers small rewordings on top of that: "Heineken 0.0" -> "Heineken 0,0",
 * "18-24 x" -> "18 - 24 x", "Kæmpeplade Hvid" -> "Hvid Kæmpeplade" (same words in any
 * order: wordingKey), and "Hvid Kål" -> "Hvidkål", "5,8x24cm" -> "5,8x24 cm",
 * "Jerry's" -> "Jerry’s" (same letters and digits in the same order: looseWordingKey).
 * Either key must match, with the same content, so "Coca-Cola" and "Coca-Cola Zero"
 * never share a decision. Copied are links a human reviewed and links shown on the site
 * (0.8+, including an offer's own product), within the same shop, and not when the price
 * jumped more than the usual safety margin. A copy keeps the source's method, confidence
 * and review, so an unreviewed link stays unreviewed. Runs at the start of `match:new`,
 * before any API call.
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

/** "Sønderjydsk Hvid Kål" and "Sønderjydsk Hvidkål" -> the same key (order kept, spacing ignored). */
export function looseWordingKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents: "rosé" = "rose", "kål" = "kal" (æ, ø and ß stay)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const contentOf = (r: Row) => `${r.content_amount === null ? "?" : Number(r.content_amount)}${r.content_unit ?? ""}`;
const keyOf = (r: Row) => `${r.shop_id}|${wordingKey(r.name)}|${contentOf(r)}`;
const looseKeyOf = (r: Row) => `${r.shop_id}|${looseWordingKey(r.name)}|${contentOf(r)}`;
const matchOf = (r: Row) => (Array.isArray(r.product_matches) ? r.product_matches[0] : r.product_matches) ?? null;

/** Copy reviewed and shown decisions onto new, unmatched newsletter products. Returns how many. */
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

  // Earlier decisions by wording (both keys). A reviewed one beats an unreviewed one; a wording
  // decided two different ways at the same level is ambiguous - skip it.
  type Source = { row: Row; match: NonNullable<ReturnType<typeof matchOf>> } | null;
  const sources = new Map<string, Source>();
  const rank = (m: NonNullable<ReturnType<typeof matchOf>>) => (m.reviewed ? 2 : 1);
  for (const r of rows) {
    const m = matchOf(r);
    if (!m || (!m.reviewed && Number(m.confidence) < SHOWN_CONFIDENCE)) continue; // weak links aren't on the site
    for (const key of new Set([keyOf(r), looseKeyOf(r)])) {
      const seen = sources.get(key);
      if (seen === undefined || (seen && rank(m) > rank(seen.match))) sources.set(key, { row: r, match: m });
      else if (seen && rank(m) === rank(seen.match) && seen.match.product_id !== m.product_id) sources.set(key, null);
    }
  }

  const carried: { shop_product_id: number; product_id: number; method: string; confidence: number; reviewed: boolean; note: string }[] = [];
  for (const r of rows) {
    if (matchOf(r)) continue; // already matched (or same wording as before: same row)
    // Both keys must agree when both have a source; otherwise use the one that has.
    const [a, b] = [sources.get(keyOf(r)), sources.get(looseKeyOf(r))];
    if (a === null || b === null || (a && b && a.match.product_id !== b.match.product_id)) continue;
    const from = a && b ? (rank(b.match) > rank(a.match) ? b : a) : (a ?? b);
    if (!from) continue;
    const [pa, pb] = [priceOf.get(r.id), priceOf.get(from.row.id)];
    if (pa && pb && Math.max(pa, pb) / Math.min(pa, pb) > MAX_PRICE_RATIO) continue; // let match:new look at it
    const m = from.match;
    carried.push({
      shop_product_id: r.id,
      product_id: m.product_id,
      method: m.method,
      confidence: m.reviewed ? 1 : Number(m.confidence),
      reviewed: m.reviewed,
      note: `Carried over from #${from.row.id} ("${from.row.name}")${m.reviewed ? ", reviewed in an earlier issue" : ", earlier issue"}`,
    });
    console.log(`  carry over${m.reviewed ? " (reviewed)" : ""}: "${from.row.name}" -> "${r.name}"`);
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
 * covers both. A new, unmatched offer whose twin is matched simply joins it (no API call). Twins reviewed two different ways are left alone and listed.
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
    for (const r of rows) if (r.shop_id === shop) map.set(wording(r), [...(map.get(wording(r)) ?? []), r]);
    return map;
  };
  const [fleggaard, calle] = [byShop("fleggaard"), byShop("calle")];

  const updates: { shop_product_id: number; product_id: number; method: string; confidence: number; reviewed: boolean; note: string }[] = [];
  for (const [key, fs] of fleggaard) {
    const cs = calle.get(key);
    if (!cs || fs.length !== 1 || cs.length !== 1) continue; // only unambiguous pairs
    const [f, c] = [fs[0], cs[0]];
    const [pf, pc] = [priceOf.get(f.id), priceOf.get(c.id)];
    if (pf && pc && Math.max(pf, pc) / Math.min(pf, pc) > MAX_PRICE_RATIO) continue;
    const isHuman = (m: NonNullable<ReturnType<typeof matchOf>>) => m.reviewed || m.method === "manual";
    const [mf, mc] = [matchOf(f), matchOf(c)];
    if (!mf || !mc) {
      // One side is new: it joins its matched twin.
      if (!mf && !mc) continue;
      const [win, lose, winRow] = mf ? [mf, c, f] : [mc!, f, c];
      updates.push({
        shop_product_id: lose.id,
        product_id: win.product_id,
        method: win.method,
        confidence: Number(win.confidence),
        reviewed: isHuman(win),
        note: `Same newsletter offer as ${winRow.shop_id} #${winRow.id} ("${winRow.name}")`,
      });
      console.log(`  twin (new): "${lose.name}" ${lose.shop_id} -> #${win.product_id} (${win.method}${isHuman(win) ? ", reviewed" : ""})`);
      continue;
    }
    if (mf.product_id === mc.product_id) continue;
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
