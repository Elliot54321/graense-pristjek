/**
 * One-off clean-up for newsletter offers stored twice by one shop because the wording differs
 * between issues ("Cuvee" / "Cuvée"): the import now folds these (`looseKey` in etilbudsavis.ts),
 * this folds the rows already there.
 *
 *   npx tsx --env-file=.env.local src/flyers/fold-twins.ts          # dry run: list the groups
 *   npx tsx --env-file=.env.local src/flyers/fold-twins.ts --save   # retire the extra rows
 *
 * Per group of still-listed rows (same shop, same loose name and content) the row that wins is
 * the cheapest (deal rate counts), then the one listed longest, then a human-reviewed link, then
 * the oldest. The others are retired the way retireDropped does it (listed until yesterday, last
 * seen 4 days ago), so they leave the site and /admin. Nothing is deleted and no product_matches
 * row is touched: a retired row keeps its link and review for the record.
 */
import { adminClient, fetchAll } from "../db/admin";
import { SOURCES } from "../scrapers/save";
import { looseKey } from "./etilbudsavis";
import { sourceOf, type Source } from "./import";

type Match = { product_id: number; method: string; reviewed: boolean };
interface Row {
  id: number;
  shop_id: string;
  name: string;
  content_amount: number | null;
  content_unit: string | null;
  listed_until: string;
  shop_product_sources: Source | Source[] | null;
  product_matches: Match | Match[] | null;
}

async function main() {
  const save = process.argv.includes("--save");
  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await fetchAll<Row>((f, t) =>
    db
      .from("shop_products")
      .select(`id, shop_id, name, content_amount, content_unit, listed_until, ${SOURCES}(source_issue), product_matches(product_id, method, reviewed)`)
      .in("shop_id", ["fleggaard", "calle"])
      .gte("listed_until", today)
      .order("id")
      .range(f, t)
      .overrideTypes<Row[], { merge: false }>(),
  );
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const content = r.content_amount !== null && r.content_unit ? { amount: Number(r.content_amount), unit: r.content_unit } : null;
    const k = `${r.shop_id}|${looseKey(r.name, content)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const twins = [...groups.values()].filter((g) => g.length > 1);

  // The latest price of every row in a group.
  const ids = twins.flat().map((r) => r.id);
  const price = new Map<number, number>();
  if (ids.length) {
    const { data, error } = await db
      .from("prices")
      .select("shop_product_id, price, multi_buy_quantity, multi_buy_price, observed_at")
      .in("shop_product_id", ids)
      .order("observed_at", { ascending: false });
    if (error) throw error;
    for (const p of data ?? []) {
      if (price.has(p.shop_product_id)) continue;
      const deal = p.multi_buy_quantity && p.multi_buy_price ? Number(p.multi_buy_price) / p.multi_buy_quantity : Infinity;
      price.set(p.shop_product_id, Math.min(Number(p.price), deal));
    }
  }
  const match = (r: Row) => (Array.isArray(r.product_matches) ? r.product_matches[0] : r.product_matches) ?? null;

  const retire: number[] = [];
  for (const g of twins) {
    const ranked = [...g].sort(
      (a, b) =>
        (price.get(a.id) ?? Infinity) - (price.get(b.id) ?? Infinity) ||
        b.listed_until.localeCompare(a.listed_until) ||
        Number(match(b)?.reviewed ?? false) - Number(match(a)?.reviewed ?? false) ||
        a.id - b.id,
    );
    const [keep, ...rest] = ranked;
    const products = new Set(g.map((r) => match(r)?.product_id ?? null));
    console.log(`${keep.shop_id}${products.size > 1 ? "  (linked to different products - Matching: are they one?)" : ""}`);
    for (const r of ranked) {
      const m = match(r);
      console.log(
        `  ${r === keep ? "keep  " : "retire"} #${r.id} "${r.name}" ${price.get(r.id) ?? "?"} kr. to ${r.listed_until} ` +
          `${(sourceOf(r)?.source_issue ?? "-").replace(/^.*etilbudsavis-/, "")} -> ${m ? `product ${m.product_id} (${m.method}${m.reviewed ? ", reviewed" : ""})` : "unmatched"}`,
      );
    }
    retire.push(...rest.map((r) => r.id));
  }
  console.log(`\n${twins.length} groups, ${retire.length} rows to retire.`);
  if (!save) return console.log("Dry run - nothing saved.");
  if (!retire.length) return;
  const day = 24 * 3600 * 1000;
  const { error } = await db
    .from("shop_products")
    .update({ listed_until: new Date(Date.now() - day).toISOString().slice(0, 10), last_seen_at: new Date(Date.now() - 4 * day).toISOString() })
    .in("id", retire);
  if (error) throw error;
  console.log(`Retired ${retire.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
