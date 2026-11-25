/**
 * One-off: fill shop_product_sources.source_image_url (Tjek's crop of each newsletter offer,
 * private, for /admin) for still-listed eTilbudsavis rows, from raw files the import already
 * saved. No API requests, and the image itself is never fetched or copied. Run it after the
 * migration has copied the sources (issue, page, text) into shop_product_sources.
 *
 *   npx tsx --env-file=.env.local src/flyers/backfill-source-images.ts [<dir> ...]          # dry run
 *   npx tsx --env-file=.env.local src/flyers/backfill-source-images.ts [<dir> ...] --save
 *
 * <dir>: folders with "<shop>-<catalogId>-<date>.json" raw files (default data/etilbudsavis; the
 * nightly import's files are the "newsletters" artifact of the Daily scrape run). The newest file
 * per issue is used.
 *
 * A row doesn't store the offer id, so it is found again: same issue and page, and the same
 * printed text after the names (pack, price, deal, description - toOffer and printedText as the
 * import ran them). Several offers alike (same page, pack and price) are told apart by the
 * heading words the row's name shares; a tie is left without an image (Admin shows the text).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { adminClient, fetchAll } from "../db/admin";
import { SOURCES } from "../scrapers/save";
import { toOffer, type TjekOffer } from "./etilbudsavis";
import { printedText, sourceOf, type Source } from "./import";

interface Row {
  id: number;
  shop_id: string;
  name: string;
  source_issue: string;
  source_page: number | null;
  source_text: string | null;
}

const words = (s: string) =>
  new Set(
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9æøåß]+/)
      .filter((w) => w.length > 1 && !/^\d+$/.test(w)),
  );

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const dirs = args.filter((a) => !a.startsWith("--"));
  const newest = new Map<string, string>(); // issue -> file
  for (const dir of dirs.length ? dirs : ["data/etilbudsavis"]) {
    for (const f of readdirSync(dir).sort()) {
      const m = f.match(/^(fleggaard|calle)-(.+)-(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) continue;
      const issue = `${m[1]}-etilbudsavis-${m[2]}`;
      const had = newest.get(issue);
      if (!had || path.basename(had).slice(-15) <= f.slice(-15)) newest.set(issue, path.join(dir, f));
    }
  }

  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  type Raw = Omit<Row, "source_issue" | "source_page" | "source_text"> & { shop_product_sources: Source | Source[] | null };
  const rows: Row[] = (
    await fetchAll<Raw>((f, t) =>
      db
        .from("shop_products")
        .select(`id, shop_id, name, ${SOURCES}!inner(source_issue, source_page, source_text)`)
        .in("shop_id", ["fleggaard", "calle"])
        .like(`${SOURCES}.source_issue`, "%-etilbudsavis-%")
        .gte("listed_until", today)
        .order("id")
        .range(f, t)
        .overrideTypes<Raw[], { merge: false }>(),
    )
  ).map(({ shop_product_sources, ...r }) => {
    const s = sourceOf({ shop_product_sources })!;
    return { ...r, source_issue: s.source_issue!, source_page: s.source_page ?? null, source_text: s.source_text ?? null };
  });

  const found: { shop_product_id: number; source_image_url: string }[] = [];
  const missing: Record<string, number> = {};
  const ties: string[] = [];
  const byIssue = Map.groupBy(rows, (r) => r.source_issue);
  for (const [issue, list] of byIssue) {
    const file = newest.get(issue);
    if (!file) {
      missing[issue] = list.length;
      continue;
    }
    const { offers } = JSON.parse(readFileSync(file, "utf8")) as { offers: TjekOffer[] };
    // The printed text without the names, per page.
    const index = new Map<string, TjekOffer[]>();
    for (const a of offers) {
      const k = `${a.catalog_page ?? 0}|${printedText(toOffer(a, [], ""))}`;
      index.set(k, [...(index.get(k) ?? []), a]);
    }
    let hit = 0;
    for (const r of list) {
      const tail = (r.source_text ?? "").split(" · ").slice(1).join(" · ");
      const cands = index.get(`${r.source_page ?? 0}|${tail}`) ?? [];
      let pick = cands.length === 1 ? cands[0] : undefined;
      if (cands.length > 1) {
        const mine = words(r.name);
        const scored = cands.map((a) => ({ a, n: [...words(a.heading)].filter((w) => mine.has(w)).length })).sort((x, y) => y.n - x.n);
        if (scored[0].n > 0 && scored[0].n > scored[1].n) pick = scored[0].a;
        else ties.push(`${issue} #${r.id} "${r.name}" (${cands.length} alike)`);
      }
      const url = pick?.images?.view ?? pick?.images?.zoom;
      if (url) {
        found.push({ shop_product_id: r.id, source_image_url: url });
        hit++;
      }
    }
    console.log(`${issue}: ${hit} of ${list.length} rows (${path.basename(file)})`);
  }
  for (const [issue, n] of Object.entries(missing)) console.log(`${issue}: ${n} rows, no raw file - left without image`);
  if (ties.length) console.log(`Ties left without image (${ties.length}):\n  ${ties.join("\n  ")}`);
  const unmatched = rows.length - found.length;
  console.log(`\n${found.length} of ${rows.length} listed eTilbudsavis rows get a crop address; ${unmatched} don't.`);
  if (!save) return console.log("Dry run - nothing saved.");

  // Every row already has its source row (the migration copied them); set only the address.
  const now = new Date().toISOString();
  for (const f of found) {
    const { error } = await db.from(SOURCES).update({ source_image_url: f.source_image_url, updated_at: now }).eq("shop_product_id", f.shop_product_id);
    if (error) throw error;
  }
  console.log(`Saved ${found.length} addresses to shop_product_sources.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
