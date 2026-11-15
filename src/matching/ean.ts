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
 *
 * Size split (2026-11-14): the shopping list prices a listing at its *product's*
 * content, so a copy whose own content is smaller than its product's (BorderShop
 * "Hans Baer Riesling 0,25 l" on the 0,75 l product, a single gum pack on the
 * 7-pack product) would be priced per liter/kg as if it were the bigger size - up
 * to 10x too cheap. Such a copy goes to its own product in the same family instead
 * (no EAN on that product, content from the shop), so the family still compares it,
 * per liter/kg of what the shop actually sells. Copies of one barcode with the same
 * size share that product; a later run finds it again among the barcode's products.
 * Only this direction, and only when the name doesn't explain the gap (see
 * `overstated`): shops misread contents too, and a copy that looks dearer is safe.
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

interface Content {
  amount: number | null;
  unit: string | null;
}

/** Both contents known, same unit, within CONTENT_TOLERANCE: the same size. */
function sameSize(a: Content | undefined, b: Content | undefined): boolean {
  if (!a || !b || a.amount === null || b.amount === null || !a.unit || a.unit !== b.unit) return false;
  return Math.abs(Number(a.amount) - Number(b.amount)) / Number(b.amount) <= CONTENT_TOLERANCE;
}

const near = (a: number, b: number) => Math.abs(a - b) / b <= CONTENT_TOLERANCE;
const UNIT_FACTOR: Record<string, { unit: string; factor: number }> = {
  kg: { unit: "kg", factor: 1 },
  g: { unit: "kg", factor: 0.001 },
  l: { unit: "l", factor: 1 },
  cl: { unit: "l", factor: 0.01 },
  ml: { unit: "l", factor: 0.001 },
};

/**
 * The product claims clearly more content than this copy's own listing, and the
 * listing's name doesn't explain the difference - so the shopping list, which uses
 * the product's content, would price this copy too cheap per liter/kg. One-sided on
 * purpose: a copy with *more* content than its product only looks dearer (safe), and
 * shops' own contents are sometimes misread too. Explanations in the name:
 *  - a pack count: "4x25g", "8er Pack", "24/0,33L", "6er" where count x copy ≈ product
 *    (ScandiPark stores some multi-packs as one unit);
 *  - the product's size printed in the name ("Polly Lakrids 400g" stored as 100 g).
 */
function overstated(name: string, own: Content, product: Content | undefined): boolean {
  if (!product || own.amount === null || product.amount === null || !own.unit || own.unit !== product.unit) return false;
  const [mine, theirs] = [Number(own.amount), Number(product.amount)];
  if (mine >= theirs * (1 - CONTENT_TOLERANCE)) return false;
  for (const m of name.matchAll(/(\d+)\s*(?:x|er\b|\/|-?pack|stk)/gi)) if (near(mine * Number(m[1]), theirs)) return false;
  for (const m of name.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/gi)) {
    const u = UNIT_FACTOR[m[2].toLowerCase()];
    if (u.unit === product.unit && near(Number(m[1].replace(",", ".")) * u.factor, theirs)) return false;
  }
  return true;
}

const contentOfRow = (r: ShopProductRow): Content => ({
  amount: r.content_amount === null ? null : Number(r.content_amount),
  unit: r.content_unit,
});

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
  const allProducts = await fetchAll<{ id: number; family_id: number | null; content_amount: number | null; content_unit: string | null }>(
    (from, to) => db.from("products").select("id, family_id, content_amount, content_unit").order("id").range(from, to),
  );
  const familyOf = new Map(allProducts.map((p) => [p.id, p.family_id]));
  const contentOf = new Map<number, Content>(
    allProducts.map((p) => [p.id, { amount: p.content_amount === null ? null : Number(p.content_amount), unit: p.content_unit }]),
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
  const newSizes: { tempId: number; ean: string; row: ShopProductRow; content: Content; family: number | null; sizeOf: number }[] = [];
  const sizeLines: string[] = [];
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

    // Size split (see header): a copy whose product claims more content than it has goes
    // to a product of this barcode that has its size, else to a new one (negative id until saved).
    const groupTarget = target;
    const destination = (r: ShopProductRow): number => {
      const size = contentOfRow(r);
      // A copy already on a product of its own size stays there when the target has another
      // size (e.g. the target is a size product made earlier, holding more copies).
      const current = alreadyMatched.get(r.id)?.product_id;
      if (current !== undefined && current !== groupTarget && sameSize(size, contentOf.get(current)) && !sameSize(size, contentOf.get(groupTarget))) {
        return current;
      }
      if (!overstated(r.name, size, contentOf.get(groupTarget))) return groupTarget;
      for (const other of rows) {
        const pid = alreadyMatched.get(other.id)?.product_id;
        if (pid !== undefined && pid !== groupTarget && sameSize(size, contentOf.get(pid))) return pid;
      }
      const planned = newSizes.find((n) => n.ean === ean && sameSize(size, n.content));
      if (planned) return planned.tempId;
      const tempId = -(newSizes.length + 1);
      newSizes.push({ tempId, ean, row: r, content: size, family: familyOf.get(groupTarget) ?? null, sizeOf: groupTarget });
      contentOf.set(tempId, size);
      return tempId;
    };

    for (const r of rows) {
      const old = alreadyMatched.get(r.id);
      const method = followed ? "llm" : "ean";
      const conf = followed ? Number(followed.confidence) : confidence;
      if (old && human(old)) continue; // never move a human decision
      const target = destination(r);
      if (target !== groupTarget && old?.product_id !== target) {
        const t = target < 0 ? "new product" : `#${target}`;
        sizeLines.push(`${ean} ${r.shop_id} "${r.name}" (${r.content_amount ?? "?"} ${r.content_unit ?? ""}): ${old ? `#${old.product_id}` : "unmatched"} -> ${t}, not #${groupTarget} (${contentOf.get(groupTarget)?.amount} ${contentOf.get(groupTarget)?.unit})`);
      }
      if (!old) {
        matches.push({ shop_product_id: r.id, product_id: target, method, confidence: conf });
        continue;
      }
      if (old.product_id !== target) {
        if (target !== groupTarget) {
          // Moved for its size only: the family stays the target's (set on the new product).
          moved.push({ id: r.id, productId: target, method, confidence: conf, note: `Barcode ${ean}, own size (was #${old.product_id}, ${old.method})` });
          continue;
        }
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
  console.log(`Copies given their own size (${newSizes.length} new products): ${sizeLines.length}`);
  for (const line of sizeLines) console.log(`  ${line}`);
  if (conflicts.length) {
    console.log(`Barcodes left alone (reviewed two ways, or split evenly): ${conflicts.length}`);
    for (const line of conflicts) console.log(`  ${line}`);
  }
  if (dryRun) {
    console.log(`Dry run - nothing saved. Would add ${matches.length} new matches and re-score ${rescored.length}.`);
    return;
  }

  // New size products first, so moves and new matches can point at them.
  const realId = new Map<number, number>();
  for (const n of newSizes) {
    const { data, error } = await db
      .from("products")
      .insert({
        name: n.row.name,
        brand: n.row.brand,
        content_amount: n.content.amount,
        content_unit: n.content.unit,
        category: n.row.categories[0] ?? null,
        family_id: n.family,
      })
      .select("id")
      .single();
    if (error) throw error;
    realId.set(n.tempId, data.id);
  }
  const resolve = (id: number) => (id < 0 ? realId.get(id)! : id);
  for (const m of moved) m.productId = resolve(m.productId);
  for (const m of matches) m.product_id = resolve(m.product_id);

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
