/**
 * EAN matching: every barcode becomes one row in `products`, and every shop
 * product with that barcode is linked to it in `product_matches`.
 *
 *   npm run match:ean [-- --dry-run]
 *
 * Safe to run again: existing products are reused.
 *
 * The barcode is the strongest sign of "same product" (shops scan it at the till;
 * a new design keeps it, a new pack gets a new one), so shop products with the same
 * barcode always share one product:
 *  - a human decision wins: if someone reviewed or hand-linked a shop product with
 *    this barcode, every other shop product with it follows to that product;
 *  - a new shop product joins the product its barcode's other copies already share
 *    (which may hold several barcodes, e.g. a can and its export version);
 *  - when copies are split over several products: if an LLM link pulled a copy to
 *    another product (often right: a can linked to its export version with another
 *    barcode), the others follow it and take over its method and confidence, so one
 *    review in /admin settles every copy. Only links shown on the site count (0.8+):
 *    a weak link is hidden anyway, so its copy rejoins its barcode twins instead.
 *    Otherwise (a shop changed a barcode after it was matched) they go to the product
 *    holding most copies, on a tie the barcode's own product.
 * When the moved copy's product was in another family, the more specific family wins
 * (the one covering fewer barcodes): BorderShop names many flavours alike ("SMÅ-serien,
 * aromatiseret vodka"), so its products can sit in a whole-series family, while the
 * same barcode at Poetzsch says "Små Sure Cola".
 * Reviewed and hand-made matches are never moved. Barcodes reviewed two different
 * ways are left alone and listed.
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
/** Unreviewed LLM links below this are held back from the site (migration 20261111000000). */
const SHOWN_CONFIDENCE = 0.8;
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
  product_id: number;
  method: string;
  confidence: number;
  reviewed: boolean;
}

/** A human decided this match: reviewed in /admin, or linked by hand. */
const human = (m: MatchRow) => m.reviewed || m.method === "manual";

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
  const dryRun = process.argv.includes("--dry-run");
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
          .select("shop_product_id, product_id, method, confidence, reviewed")
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
  for (let i = 0; !dryRun && i < productRows.length; i += BATCH_SIZE) {
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

  // Families and how many barcodes each covers (a whole-series family covers many).
  const familyOf = new Map(
    (
      await fetchAll<{ id: number; family_id: number | null }>((from, to) =>
        db.from("products").select("id, family_id").order("id").range(from, to),
      )
    ).map((p) => [p.id, p.family_id]),
  );
  const familyBarcodes = new Map<number, Set<string>>();
  for (const sp of shopProducts) {
    const pid = alreadyMatched.get(sp.id)?.product_id;
    const fam = pid === undefined ? null : familyOf.get(pid);
    if (fam != null) familyBarcodes.set(fam, (familyBarcodes.get(fam) ?? new Set()).add(sp.ean));
  }
  const familyMoves = new Map<number, { family: number; line: string }>(); // target product -> new family

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
    if (!changed || dryRun) continue;
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
  const moved: { id: number; productId: number; method: string; confidence: number; note: string }[] = [];
  const movedLines: string[] = [];
  const conflicts: string[] = [];
  for (const [ean, rows] of byEan) {
    const agree = contentsAgree(rows);
    if (!agree) {
      review.push(`${ean}: ${rows.map((r) => `${r.shop_id} "${r.name}" (${r.content_amount ?? "?"} ${r.content_unit ?? ""})`).join(" vs ")}`);
    }
    const confidence = agree ? CONFIDENT : NEEDS_REVIEW;

    // Where this barcode belongs: a human's product, else the barcode's own product.
    const decided = new Set(rows.flatMap((r) => {
      const m = alreadyMatched.get(r.id);
      return m && human(m) ? [m.product_id] : [];
    }));
    if (decided.size > 1) {
      conflicts.push(`${ean}: ${rows.map((r) => `${r.shop_id} "${r.name}" -> #${alreadyMatched.get(r.id)?.product_id ?? "-"}`).join(", ")}`);
      continue; // a person decided two ways - don't guess
    }
    // Otherwise: where the matched copies are (see the header for split copies).
    const count = new Map<number, number>();
    const llmLink = new Map<number, MatchRow>(); // product -> an LLM match of this barcode on it
    for (const r of rows) {
      const m = alreadyMatched.get(r.id);
      if (!m) continue;
      count.set(m.product_id, (count.get(m.product_id) ?? 0) + 1);
      if (m.method === "llm" && Number(m.confidence) >= SHOWN_CONFIDENCE) llmLink.set(m.product_id, m);
    }
    const home = productIdByEan.get(ean)!;
    const most = (ids: number[]) => {
      const ranked = ids.map((id) => [id, count.get(id) ?? 0] as const).sort((a, b) => b[1] - a[1]);
      if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) return ranked[0][0];
      return ids.includes(home) ? home : null;
    };
    let target: number | null;
    if (decided.size === 1) target = [...decided][0];
    else if (!count.size) target = home;
    else if (count.size === 1) target = [...count.keys()][0];
    else if (llmLink.size) target = most([...llmLink.keys()]);
    else target = most([...count.keys()]);
    if (target === null) {
      conflicts.push(`${ean} (split evenly): ${rows.map((r) => `${r.shop_id} "${r.name}" -> #${alreadyMatched.get(r.id)?.product_id ?? "-"}`).join(", ")}`);
      continue;
    }
    // Copies following an unreviewed LLM link inherit it: same method, same confidence.
    const followed = decided.size === 0 ? llmLink.get(target) : undefined;

    for (const r of rows) {
      const old = alreadyMatched.get(r.id);
      const method = followed ? "llm" : "ean";
      const conf = followed ? Number(followed.confidence) : confidence;
      if (!old) {
        matches.push({ shop_product_id: r.id, product_id: target, method, confidence: conf });
        continue;
      }
      if (human(old)) continue; // never move a human decision
      if (old.product_id !== target) {
        moved.push({
          id: r.id,
          productId: target,
          method,
          confidence: conf,
          note: `Joined the other shop products with barcode ${ean} (was #${old.product_id}, ${old.method})`,
        });
        const why = decided.size ? "human decision" : followed ? `follows LLM link, ${conf}` : "most copies";
        const [from, to] = [familyOf.get(old.product_id) ?? null, familyMoves.get(target)?.family ?? familyOf.get(target) ?? null];
        const size = (f: number) => familyBarcodes.get(f)?.size ?? 0;
        if (from !== null && from !== to && (to === null || size(from) < size(to))) {
          familyMoves.set(target, { family: from, line: `#${target}: family ${to ?? "-"} (${to === null ? 0 : size(to)} barcodes) -> ${from} (${size(from)}), from "${r.name}"` });
        }
        movedLines.push(`${ean} ${r.shop_id} "${r.name}": #${old.product_id} (${old.method}) -> #${target} (${why})`);
      } else if (old.method === "ean" && Number(old.confidence) !== confidence) {
        // Re-score our own EAN matches when the shops' contents start or stop agreeing.
        rescored.push({ id: r.id, confidence });
      }
    }
  }

  console.log(`Moved to their barcode's product: ${moved.length}`);
  for (const line of movedLines) console.log(`  ${line}`);
  console.log(`Products given the more specific family of a moved copy: ${familyMoves.size}`);
  for (const { line } of familyMoves.values()) console.log(`  ${line}`);
  if (conflicts.length) {
    console.log(`Barcodes left alone (reviewed two ways, or split evenly): ${conflicts.length}`);
    for (const line of conflicts) console.log(`  ${line}`);
  }
  if (dryRun) {
    console.log(`Dry run - nothing saved. Would add ${matches.length} new matches and re-score ${rescored.length}.`);
    return;
  }

  for (const m of moved) {
    const { error } = await db
      .from("product_matches")
      .update({ product_id: m.productId, method: m.method, confidence: m.confidence, note: m.note })
      .eq("shop_product_id", m.id)
      .eq("reviewed", false); // a review made meanwhile wins
    if (error) throw error;
  }
  for (const [productId, { family }] of familyMoves) {
    const { error } = await db.from("products").update({ family_id: family }).eq("id", productId);
    if (error) throw error;
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
