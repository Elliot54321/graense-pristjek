/**
 * Backfill shop_products.piece_count (and clear bag capacities stored as content) from the
 * stored names, with the same rules the scrapers and newsletter imports now use.
 *
 *   npx tsx --env-file=.env.local src/scrapers/backfill-pieces.ts          # dry run: report only
 *   npx tsx --env-file=.env.local src/scrapers/backfill-pieces.ts --save   # write (needs the migration)
 *
 * The report counts pieces per family category (or the shop's category when unmatched) and
 * lists a sample, plus the listings that need a look: a count that disagrees with a content
 * the shop gives in pieces, and names with a count word that gave no count (ranges, two counts).
 * Writes only rows whose value changes; safe to rerun.
 */
import { writeFileSync } from "node:fs";
import { adminClient, fetchAll } from "../db/admin";
import { isCapacity, listingPieces, pieceCount } from "./quantity";
import type { Quantity } from "./types";

type Match = { products: { product_families: { category: string | null } | null } | null };

interface Row {
  id: number;
  shop_id: string;
  name: string;
  categories: string[] | null;
  content_amount: number | null;
  content_unit: Quantity["unit"] | null;
  last_seen_at: string | null;
  listed_until: string | null;
  product_matches: Match | Match[] | null;
}

const COUNT_WORD = /\d\s*-?\s*(stk|styk|stück|ruller|rl|rollen|kapsler|tabs|tabletter|vaske|wl|poser|beutel|breve|bind|bleer|tücher|servietter|ark|pack|pakker|pk)\b/i;

async function main() {
  const save = process.argv.includes("--save");
  const db = adminClient();
  const probe = await db.from("shop_products").select("piece_count").limit(1);
  const hasColumn = !probe.error;
  if (probe.error && probe.error.code !== "42703") throw probe.error;
  if (save && !hasColumn) throw new Error("shop_products.piece_count doesn't exist yet - run supabase/migrations/20261119000000_piece_units.sql first.");

  const rows = await fetchAll<Row & { piece_count?: number | null }>((f, t) =>
    db
      .from("shop_products")
      .select(
        `id, shop_id, name, categories, content_amount, content_unit, last_seen_at, listed_until, ${hasColumn ? "piece_count, " : ""}` +
          "product_matches(products(product_families(category)))",
      )
      .order("id")
      .range(f, t)
      .overrideTypes<(Row & { piece_count?: number | null })[], { merge: false }>(),
  );
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  const live = (r: Row) => (r.last_seen_at ?? "") >= since || (r.listed_until ?? "") >= today;

  const counts = new Map<number, number[]>(); // piece count -> row ids
  const capacity: Row[] = [];
  const disagree: string[] = [];
  const unread: string[] = [];
  const perCategory = new Map<string, { rows: number; counted: number; sample: string[] }>();
  for (const r of rows) {
    const content = r.content_amount !== null && r.content_unit ? { amount: Number(r.content_amount), unit: r.content_unit } : null;
    const n = listingPieces(r.name, content);
    if (n !== (r.piece_count ?? null)) counts.set(n ?? 0, [...(counts.get(n ?? 0) ?? []), r.id]);
    if (isCapacity(r.name) && content && content.unit !== "piece") capacity.push(r);
    if (!live(r)) continue;
    const fromName = pieceCount(r.name);
    if (fromName && content?.unit === "piece" && content.amount !== fromName) {
      disagree.push(`${r.shop_id} | ${r.name} | name ${fromName}, shop content ${content.amount}`);
    }
    if (!n && COUNT_WORD.test(r.name)) unread.push(`${r.shop_id} | ${r.name}`);
    const match = Array.isArray(r.product_matches) ? r.product_matches[0] : r.product_matches;
    const cat = match?.products?.product_families?.category ?? `(unmatched) ${r.shop_id}/${r.categories?.[0] ?? "-"}`;
    const c = perCategory.get(cat) ?? { rows: 0, counted: 0, sample: [] };
    c.rows++;
    if (n) {
      c.counted++;
      if (c.sample.length < 6) c.sample.push(`${n} <- ${r.shop_id} | ${r.name}`);
    }
    perCategory.set(cat, c);
  }

  const changed = [...counts].reduce((s, [, ids]) => s + ids.length, 0);
  const lines = [
    `${rows.length} shop products, ${rows.filter(live).length} live; piece_count would change on ${changed} (${counts.get(0)?.length ?? 0} of them to null).`,
    "",
    "## Live listings with a piece count, per category",
    ...[...perCategory]
      .filter(([, c]) => c.counted)
      .sort((a, b) => b[1].counted - a[1].counted)
      .flatMap(([cat, c]) => [`${cat}: ${c.counted} of ${c.rows}`, ...c.sample.map((s) => `    ${s}`)]),
    "",
    `## Bag capacity stored as content (cleared): ${capacity.length}`,
    ...capacity.map((r) => `    ${r.shop_id} | ${r.name} | ${r.content_amount} ${r.content_unit}`),
    "",
    `## Name count disagrees with the shop's piece content (kept: name wins): ${disagree.length}`,
    ...disagree.map((s) => `    ${s}`),
    "",
    `## Count word in the name but no count (ranges, two counts, either/or): ${unread.length}`,
    ...unread.map((s) => `    ${s}`),
  ];
  const file = "data/scrapes/piece-count-backfill.txt"; // git-ignored
  writeFileSync(file, lines.join("\n") + "\n");
  console.log(lines.slice(0, 2).join("\n"));
  console.log(`Full report: ${file}`);
  if (!save) return console.log("Dry run - nothing saved." + (hasColumn ? "" : " (piece_count column not there yet.)"));

  for (const [n, ids] of counts) {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await db.from("shop_products").update({ piece_count: n || null }).in("id", ids.slice(i, i + 500));
      if (error) throw error;
    }
  }
  if (capacity.length) {
    const { error } = await db.from("shop_products").update({ content_amount: null, content_unit: null }).in("id", capacity.map((r) => r.id));
    if (error) throw error;
  }
  console.log(`Saved: piece_count on ${changed} rows, bag capacity cleared on ${capacity.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
