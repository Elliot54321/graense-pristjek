/**
 * Newsletter offers that currently win: unreviewed (LLM-matched) Fleggaard/Calle
 * products that are the cheapest per liter/kg in their family. These decide the
 * site's "cheapest" answer, so a wrong match here is the costly kind - one that
 * isn't the cheapest rarely changes what the site recommends. Reviewing just these
 * keeps the monthly newsletter review small.
 *
 * Read from matched_prices, i.e. exactly what the website compares (listed products,
 * weak links held back).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEWSLETTER_SHOPS } from "@/catalog/compare";
import { fetchAll } from "@/db/admin";

const RIVALS_SHOWN = 3;

export interface Winner {
  shopProductId: number;
  productId: number;
  confidence: number;
  /**
   * Other shops' listings to compare with, cheapest first: for an exact link the same
   * product (so a can isn't shown next to the family's bottles), else the family's
   * cheapest per shop.
   */
  rivalIds: number[];
  sameProduct: boolean;
  /** How much cheaper per liter/kg than the next shop, 0.25 = 25 %. */
  saving: number;
}

interface PriceRow {
  product_id: number;
  shop_product_id: number;
  shop_id: string;
  content_unit: string | null;
  price_per_unit: number | null;
}

export async function findWinners(db: SupabaseClient): Promise<Winner[]> {
  const [rows, products, unreviewed] = await Promise.all([
    fetchAll<PriceRow>((f, t) =>
      db.from("matched_prices").select("product_id, shop_product_id, shop_id, content_unit, price_per_unit").order("shop_product_id").range(f, t),
    ),
    fetchAll<{ id: number; family_id: number | null }>((f, t) => db.from("products").select("id, family_id").order("id").range(f, t)),
    fetchAll<{ shop_product_id: number; confidence: number }>((f, t) =>
      db
        .from("product_matches")
        .select("shop_product_id, confidence")
        .eq("method", "llm")
        .eq("reviewed", false)
        .order("shop_product_id")
        .range(f, t),
    ),
  ]);
  const familyOf = new Map(products.map((p) => [p.id, p.family_id]));
  const confidenceOf = new Map(unreviewed.map((m) => [m.shop_product_id, Number(m.confidence)]));

  // Compared like the site does: per family (or the product alone without one), per unit.
  const groups = new Map<string, PriceRow[]>();
  for (const r of rows) {
    if (r.price_per_unit === null || !r.content_unit) continue;
    const family = familyOf.get(r.product_id);
    const key = `${family == null ? `p${r.product_id}` : `f${family}`}|${r.content_unit}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const winners: Winner[] = [];
  for (const group of groups.values()) {
    for (const r of group) {
      const confidence = confidenceOf.get(r.shop_product_id);
      if (confidence === undefined || !NEWSLETTER_SHOPS.has(r.shop_id)) continue;
      const others = group.filter((o) => o.shop_id !== r.shop_id);
      if (!others.length) continue;
      // Exact link: show the linked product in the other shops (falls back to the family).
      const linked = confidence < 1 ? others.filter((o) => o.product_id === r.product_id) : [];
      const sameProduct = linked.length > 0;
      const shown = sameProduct ? linked : others;
      const cheapestPerShop = new Map<string, PriceRow>();
      for (const o of shown) {
        const best = cheapestPerShop.get(o.shop_id);
        if (!best || Number(o.price_per_unit) < Number(best.price_per_unit)) cheapestPerShop.set(o.shop_id, o);
      }
      const rivals = [...cheapestPerShop.values()].sort((a, b) => Number(a.price_per_unit) - Number(b.price_per_unit));
      // Winning is judged on the whole family, like the site's answer.
      const byPrice = [...others].sort((a, b) => Number(a.price_per_unit) - Number(b.price_per_unit));
      if (Number(r.price_per_unit) > Number(byPrice[0].price_per_unit)) continue;
      // Fleggaard and Calle print the same prices, so measure the lead against the other shops.
      const next = Number((byPrice.find((o) => !NEWSLETTER_SHOPS.has(o.shop_id)) ?? byPrice[0]).price_per_unit);
      winners.push({
        shopProductId: r.shop_product_id,
        productId: r.product_id,
        confidence,
        rivalIds: rivals.slice(0, RIVALS_SHOWN).map((o) => o.shop_product_id),
        sameProduct,
        saving: next > 0 ? 1 - Number(r.price_per_unit) / next : 0,
      });
    }
  }
  return winners;
}
