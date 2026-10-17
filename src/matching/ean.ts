/**
 * EAN matching: every barcode becomes one row in `products`, and every shop
 * product with that barcode is linked to it in `product_matches`.
 *
 *   npm run match:ean
 *
 * Safe to run again: existing products are reused and shop products that are
 * already matched (by any method, including manual) are left alone.
 *
 * Products with the same EAN but clearly different content (e.g. a bottle vs.
 * the same bottle in a gift box with glasses) get a lower confidence so they
 * show up for review instead of silently comparing different things.
 */
import { adminClient, fetchAll } from "../db/admin";

const BATCH_SIZE = 500;
/** Contents differing more than this (as a fraction) lower the confidence. */
const CONTENT_TOLERANCE = 0.05;
const CONFIDENT = 1;
const NEEDS_REVIEW = 0.6;
/** Shop whose names/categories we prefer: Danish and short (BorderShop's are long). */
const PREFERRED_SHOP = "poetzsch";

interface ProductRow {
  id: number;
  ean: string;
  brand: string | null;
  content_amount: number | null;
  content_unit: string | null;
  category: string | null;
}

interface MatchRow {
  shop_product_id: number;
  method: string;
  confidence: number;
  reviewed: boolean;
}

interface ShopProductRow {
  id: number;
  shop_id: string;
  name: string;
  brand: string | null;
  ean: string;
  categories: string[];
  content_amount: number | null;
  content_unit: string | null;
}

function contentsAgree(rows: ShopProductRow[]): boolean {
  const known = rows.filter((r) => r.content_amount !== null);
  if (known.length < 2) return true;
  const [first, ...rest] = known;
  return rest.every(
    (r) =>
      r.content_unit === first.content_unit &&
      Math.abs(r.content_amount! - first.content_amount!) / first.content_amount! <= CONTENT_TOLERANCE,
  );
}

async function main() {
  const db = adminClient();

  const shopProducts = await fetchAll<ShopProductRow>((from, to) =>
    db
      .from("shop_products")
      .select("id, shop_id, name, brand, ean, categories, content_amount, content_unit")
      .not("ean", "is", null)
      .order("id")
      .range(from, to),
  );
  const alreadyMatched = new Map(
    (
      await fetchAll<MatchRow>((from, to) =>
        db
          .from("product_matches")
          .select("shop_product_id, method, confidence, reviewed")
          .order("shop_product_id")
          .range(from, to),
      )
    ).map((m) => [m.shop_product_id, m]),
  );

  const byEan = new Map<string, ShopProductRow[]>();
  for (const sp of shopProducts) byEan.set(sp.ean, [...(byEan.get(sp.ean) ?? []), sp]);

  // One product per EAN, described from the preferred shop when it has the item.
  const productRows = [...byEan.entries()].map(([ean, rows]) => {
    const best = rows.find((r) => r.shop_id === PREFERRED_SHOP) ?? rows[0];
    const withContent = rows.find((r) => r.content_amount !== null);
    return {
      ean,
      name: best.name,
      brand: best.brand ?? rows.find((r) => r.brand)?.brand ?? null,
      content_amount: (best.content_amount !== null ? best : withContent)?.content_amount ?? null,
      content_unit: (best.content_amount !== null ? best : withContent)?.content_unit ?? null,
      category: best.categories[0] ?? null,
    };
  });

  // ignoreDuplicates keeps names someone may have corrected by hand.
  for (let i = 0; i < productRows.length; i += BATCH_SIZE) {
    const { error } = await db
      .from("products")
      .upsert(productRows.slice(i, i + BATCH_SIZE), { onConflict: "ean", ignoreDuplicates: true });
    if (error) throw error;
  }
  const existing = await fetchAll<ProductRow>((from, to) =>
    db
      .from("products")
      .select("id, ean, brand, content_amount, content_unit, category")
      .not("ean", "is", null)
      .order("id")
      .range(from, to),
  );
  const productIdByEan = new Map(existing.map((p) => [p.ean, p.id]));

  // Keep brand/content/category in step with the shops (they fix their data, or
  // we fix a parser). Names are left alone in case someone corrected one by hand.
  const wanted = new Map(productRows.map((p) => [p.ean, p]));
  let updated = 0;
  for (const p of existing) {
    const w = wanted.get(p.ean);
    if (!w) continue;
    const changed =
      p.brand !== w.brand ||
      Number(p.content_amount) !== Number(w.content_amount) ||
      p.content_unit !== w.content_unit ||
      p.category !== w.category;
    if (!changed) continue;
    const { error } = await db
      .from("products")
      .update({ brand: w.brand, content_amount: w.content_amount, content_unit: w.content_unit, category: w.category })
      .eq("id", p.id);
    if (error) throw error;
    updated++;
  }

  const matches: { shop_product_id: number; product_id: number; method: string; confidence: number }[] = [];
  const review: string[] = [];
  const rescored: { id: number; confidence: number }[] = [];
  for (const [ean, rows] of byEan) {
    const agree = contentsAgree(rows);
    if (!agree) {
      review.push(`${ean}: ${rows.map((r) => `${r.shop_id} "${r.name}" (${r.content_amount ?? "?"} ${r.content_unit ?? ""})`).join(" vs ")}`);
    }
    const confidence = agree ? CONFIDENT : NEEDS_REVIEW;
    for (const r of rows) {
      const old = alreadyMatched.get(r.id);
      if (old) {
        // Re-score our own unreviewed EAN matches; never touch reviewed or other methods.
        if (old.method === "ean" && !old.reviewed && Number(old.confidence) !== confidence) {
          rescored.push({ id: r.id, confidence });
        }
        continue;
      }
      matches.push({
        shop_product_id: r.id,
        product_id: productIdByEan.get(ean)!,
        method: "ean",
        confidence,
      });
    }
  }
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const { error } = await db.from("product_matches").insert(matches.slice(i, i + BATCH_SIZE));
    if (error) throw error;
  }

  for (const { id, confidence } of rescored) {
    const { error } = await db.from("product_matches").update({ confidence }).eq("shop_product_id", id);
    if (error) throw error;
  }

  const inShops = [...byEan.values()].map((rows) => new Set(rows.map((r) => r.shop_id)).size);
  console.log(`Shop products with EAN: ${shopProducts.length}`);
  console.log(`Products (one per EAN): ${byEan.size} (${updated} updated from newer shop data)`);
  console.log(`  sold in 2+ shops: ${inShops.filter((n) => n >= 2).length}`);
  console.log(`New matches: ${matches.length} (already matched before: ${alreadyMatched.size}, re-scored: ${rescored.length})`);
  console.log(`Same EAN, different content (confidence ${NEEDS_REVIEW}, needs review): ${review.length}`);
  for (const line of review) console.log(`  ${line}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
