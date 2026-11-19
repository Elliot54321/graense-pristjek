/**
 * Piece counts for products (roadmap "stk. prices"): `products.piece_count` from the
 * `shop_products.piece_count` of the listings linked to each product.
 *
 *   npx tsx --env-file-if-exists=.env.local src/matching/pieces.ts [--save]
 *
 * Like product content in ean.ts, listings on sale count first (all listings when none on
 * sale has a count). Then:
 *  - a human decision wins: listings whose match was reviewed or linked by hand decide, if
 *    they agree (two humans disagreeing -> null, listed);
 *  - else all listings agree -> that count;
 *  - else a clear majority (more than half of the listings with a count) -> that count;
 *  - else null, listed as a disagreement.
 * The site uses the smaller of listing and product count anyway (migration
 * 20261119000000), so a product count never makes a listing look cheaper than it says.
 *
 * Products have no "reviewed" flag, so a value set by hand is recognised by matching none
 * of its listings' counts: such a value is never changed (listed). Idempotent - only
 * differences are written, so it can run nightly after match:ean / match:new.
 * Report: data/llm-batches/piece-counts.txt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { adminClient, fetchAll } from "../db/admin";
import { isListed } from "./groups";

const REPORT = "data/llm-batches/piece-counts.txt";

interface Listing {
  id: number;
  shop_id: string;
  name: string;
  piece_count: number | null;
  last_seen_at: string | null;
  listed_until: string | null;
}
interface Match {
  shop_product_id: number;
  product_id: number;
  method: string;
  reviewed: boolean;
}

type Result = { count: number | null; why: string };

/** Decide one product's count from its listings (with their matches). */
export function pieceCountFor(listings: { listing: Listing; match: Match }[]): Result {
  const counted = listings.filter((l) => l.listing.piece_count !== null);
  if (!counted.length) return { count: null, why: "no listing has a count" };
  const live = counted.filter((l) => isListed(l.listing));
  const pool = live.length ? live : counted;
  const humans = pool.filter((l) => l.match.reviewed || l.match.method === "manual");
  if (humans.length) {
    const set = new Set(humans.map((l) => l.listing.piece_count));
    return set.size === 1 ? { count: humans[0].listing.piece_count, why: "human decision" } : { count: null, why: "human decisions disagree" };
  }
  const votes = new Map<number, number>();
  for (const l of pool) votes.set(l.listing.piece_count!, (votes.get(l.listing.piece_count!) ?? 0) + 1);
  const [[top, n]] = [...votes].sort((a, b) => b[1] - a[1]);
  if (votes.size === 1) return { count: top, why: pool.length > 1 ? "listings agree" : "one listing" };
  if (n * 2 > pool.length) return { count: top, why: `majority ${n}/${pool.length}` };
  return { count: null, why: "listings disagree" };
}

async function main(save: boolean) {
  const db = adminClient();
  const [products, matches, listings] = await Promise.all([
    fetchAll<{ id: number; name: string; piece_count: number | null }>((f, t) => db.from("products").select("id, name, piece_count").order("id").range(f, t)),
    fetchAll<Match>((f, t) => db.from("product_matches").select("shop_product_id, product_id, method, reviewed").order("shop_product_id").range(f, t)),
    fetchAll<Listing>((f, t) =>
      db.from("shop_products").select("id, shop_id, name, piece_count, last_seen_at, listed_until").order("id").range(f, t),
    ),
  ]);
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const byProduct = new Map<number, { listing: Listing; match: Match }[]>();
  for (const m of matches) {
    const listing = listingById.get(m.shop_product_id);
    if (listing) byProduct.set(m.product_id, [...(byProduct.get(m.product_id) ?? []), { listing, match: m }]);
  }

  const writes: { id: number; count: number | null }[] = [];
  const disagree: string[] = [];
  const kept: string[] = [];
  const changed: string[] = [];
  const why = new Map<string, number>();
  for (const p of products) {
    const ls = byProduct.get(p.id) ?? [];
    const r = pieceCountFor(ls);
    const detail = () =>
      ls
        .filter((l) => l.listing.piece_count !== null)
        .map((l) => `${l.listing.shop_id}${isListed(l.listing) ? "" : " (off sale)"}${l.match.reviewed || l.match.method === "manual" ? " R" : ""} "${l.listing.name}" = ${l.listing.piece_count}`)
        .join("; ");
    if (r.count === null && r.why !== "no listing has a count") disagree.push(`#${p.id} ${p.name} (${r.why}): ${detail()}`);
    if (r.count !== null) why.set(r.why.replace(/ \d+\/\d+/, ""), (why.get(r.why.replace(/ \d+\/\d+/, "")) ?? 0) + 1);
    if (p.piece_count === r.count) continue;
    // A value no listing gives was set by hand: keep it.
    if (p.piece_count !== null && !ls.some((l) => l.listing.piece_count === p.piece_count)) {
      kept.push(`#${p.id} ${p.name}: keeps ${p.piece_count} (listings say ${r.count ?? "-"}; ${detail() || "no counts"})`);
      continue;
    }
    writes.push({ id: p.id, count: r.count });
    changed.push(`#${p.id} ${p.name}: ${p.piece_count ?? "-"} -> ${r.count ?? "-"} (${r.why})`);
  }

  const withCount = products.filter((p) => {
    const w = writes.find((x) => x.id === p.id);
    return (w ? w.count : p.piece_count) !== null;
  }).length;
  console.log(`${products.length} products; with a count after this run: ${withCount}.`);
  for (const [k, n] of [...why].sort()) console.log(`  ${k.padEnd(20)} ${n}`);
  console.log(`Changes: ${writes.length}; listings disagree (left null): ${disagree.length}; hand-set values kept: ${kept.length}.`);
  mkdirSync("data/llm-batches", { recursive: true });
  writeFileSync(
    REPORT,
    [`Piece counts ${new Date().toISOString().slice(0, 10)} (R = human-reviewed match)`, "", `Disagreements, left null (${disagree.length}):`, ...disagree,
      "", `Hand-set values kept (${kept.length}):`, ...kept, "", `Changes (${changed.length}):`, ...changed].join("\n") + "\n",
  );
  console.log(`Report: ${REPORT}`);
  if (!save) return console.log("Dry run - nothing saved.");
  // Group by value: one update per distinct count.
  const groups = new Map<number | null, number[]>();
  for (const w of writes) groups.set(w.count, [...(groups.get(w.count) ?? []), w.id]);
  for (const [count, ids] of groups) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from("products").update({ piece_count: count }).in("id", ids.slice(i, i + 200));
      if (error) throw error;
    }
  }
  console.log(`Saved ${writes.length} products.`);
}

if (process.argv[1]?.endsWith("pieces.ts")) main(process.argv.includes("--save"));
