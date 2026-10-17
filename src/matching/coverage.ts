/**
 * How well do products match across shops?
 *
 *   npm run match:coverage            categories + common items
 *   npm run match:coverage -- --names also list the matching product names
 *
 * Categories: of all products in a category, how many are in both shops and
 * already linked to the same product. Common items (common-items.ts): for each
 * item, whether the shops' versions are linked, still need matching, or are
 * only sold in one shop.
 */
import { adminClient, fetchAll } from "../db/admin";
import { COMMON_ITEMS, type CommonItem } from "./common-items";

const SIZE_TOLERANCE = 0.02;
const ALCOHOL_FREE = /\b0[,.]0 ?%|\b0[,.]0\b|alkoholfri|alcohol ?free|\b0[,.]5 ?%/i;
const BOTTLES = /flask|\bfl\b|\bpet\b/i;

/** Shop categories that make up each comparison category (wine left out on purpose). */
const CATEGORIES: { label: string; poetzsch: RegExp; bordershop: RegExp }[] = [
  { label: "Soda and energy drinks", poetzsch: /^Vand\/(Sodavand|Energidrik)/, bordershop: /^Beverages$/ },
  { label: "Beer", poetzsch: /^Øl/, bordershop: /^Beer$/ },
  { label: "Candy, chocolate and snacks", poetzsch: /^Slik|Chips og snacks/, bordershop: /^Candy and Snacks$/ },
  { label: "Spirits", poetzsch: /^Spiritus/, bordershop: /^Spirits$/ },
];

type Status = "matched" | "both, not linked" | "only poetzsch" | "only bordershop" | "neither";

interface Row {
  id: number;
  shop_id: string;
  name: string;
  categories: string[];
  content_amount: number | null;
  content_unit: string | null;
  // One-to-one in the database, but the untyped client models embeds as lists.
  product_matches: { product_id: number }[] | { product_id: number } | null;
}

function productId(r: Row): number | undefined {
  const m = r.product_matches;
  return Array.isArray(m) ? m[0]?.product_id : m?.product_id;
}

function fits(item: CommonItem, r: Row): boolean {
  if (!item.include.test(r.name) || item.exclude?.test(r.name)) return false;
  if (!item.alcoholFree && ALCOHOL_FREE.test(r.name)) return false;
  if (!item.bottles && BOTTLES.test(r.name)) return false;
  if (!item.content) return true;
  return (
    r.content_unit === item.content.unit &&
    r.content_amount !== null &&
    Math.abs(r.content_amount - item.content.amount) / item.content.amount <= SIZE_TOLERANCE
  );
}

function categoryReport(rows: Row[]) {
  console.log("Categories (products linked to the same product in both shops):");
  for (const cat of CATEGORIES) {
    const inCat = (r: Row) => (r.shop_id === "poetzsch" ? cat.poetzsch : cat.bordershop).test(r.categories.join("/"));
    const p = rows.filter((r) => r.shop_id === "poetzsch" && inCat(r));
    const b = rows.filter((r) => r.shop_id === "bordershop" && inCat(r));
    const bIds = new Set(b.map(productId));
    const linked = new Set(p.map(productId).filter((id) => id !== undefined && bIds.has(id))).size;
    const smaller = Math.min(p.length, b.length);
    console.log(
      `  ${cat.label.padEnd(28)} Poetzsch ${String(p.length).padStart(4)}, BorderShop ${String(b.length).padStart(4)}, ` +
        `in both and linked ${String(linked).padStart(4)} (${Math.round((100 * linked) / smaller)}% of the smaller range)`,
    );
  }
}

async function main() {
  const showNames = process.argv.includes("--names");
  const db = adminClient();
  const rows = await fetchAll<Row>((from, to) =>
    db
      .from("shop_products")
      .select("id, shop_id, name, categories, content_amount, content_unit, product_matches(product_id)")
      .order("id")
      .range(from, to),
  );

  categoryReport(rows);

  const counts: Record<Status, number> = {
    matched: 0,
    "both, not linked": 0,
    "only poetzsch": 0,
    "only bordershop": 0,
    neither: 0,
  };
  const lines: string[] = [];
  for (const item of COMMON_ITEMS) {
    const hits = rows.filter((r) => fits(item, r));
    const p = hits.filter((r) => r.shop_id === "poetzsch");
    const b = hits.filter((r) => r.shop_id === "bordershop");
    const pIds = new Set(p.map(productId));
    const linked = b.some((r) => productId(r) !== undefined && pIds.has(productId(r)));

    const status: Status = linked
      ? "matched"
      : p.length && b.length
        ? "both, not linked"
        : p.length
          ? "only poetzsch"
          : b.length
            ? "only bordershop"
            : "neither";
    counts[status]++;

    lines.push(`${status.padEnd(16)} ${item.label}`);
    if (showNames || status !== "matched") {
      const names = (rs: Row[]) => rs.map((r) => `"${r.name}"`).join(", ") || "-";
      lines.push(`${"".padEnd(17)}P: ${names(p)}\n${"".padEnd(17)}B: ${names(b)}`);
    }
  }

  console.log(`\nCommon items:\n${lines.join("\n")}`);
  console.log(`\n${COMMON_ITEMS.length} common items:`);
  for (const [status, n] of Object.entries(counts)) console.log(`  ${status.padEnd(16)} ${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
