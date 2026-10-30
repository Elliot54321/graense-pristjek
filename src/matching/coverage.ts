/**
 * How well do products match across shops?
 *
 *   npm run match:coverage            categories + common items
 *   npm run match:coverage -- --names also list the matching product names
 *
 * Only products currently on sale count (same rule as the website's price views).
 *
 * Categories: for each shop, how many of its products in a comparison category can
 * be compared with at least one other shop (same family). Common items
 * (common-items.ts): which shops sell each item, and whether they're linked to the
 * same family, so the basket compares them.
 */
import { adminClient, fetchAll } from "../db/admin";
import { COMMON_ITEMS, type CommonItem } from "./common-items";
import { GROUPS, isListed } from "./groups";

const SIZE_TOLERANCE = 0.02;
const ALCOHOL_FREE = /\b0[,.]0 ?%|\b0[,.]0\b|alkoholfri|alcohol ?free|\b0[,.]5 ?%/i;
const BOTTLES = /flask|\bfl\b|\bpet\b/i;

/** Shops in report order, with a one-letter column label. */
const SHOPS: { id: string; label: string; short: string }[] = [
  { id: "poetzsch", label: "Poetzsch", short: "P" },
  { id: "fleggaard", label: "Fleggaard", short: "F" },
  { id: "scandipark", label: "ScandiPark", short: "S" },
  { id: "bordershop", label: "BorderShop Puttgarden", short: "B" },
  { id: "bordershop-rostock", label: "BorderShop Rostock", short: "R" },
];
const CATEGORY_LABELS: Record<string, string> = {
  soda: "Soda, water, energy",
  beer: "Beer and cider",
  candy: "Candy, chocolate, snacks",
  spirits: "Spirits",
  groceries: "Groceries",
  household: "Household, toiletries",
};

interface Row {
  id: number;
  shop_id: string;
  name: string;
  categories: string[];
  content_amount: number | null;
  content_unit: string | null;
  last_seen_at: string | null;
  listed_until: string | null;
  // One-to-one in the database, but the untyped client models embeds as lists.
  product_matches: MatchEmbed[] | MatchEmbed | null;
}
interface MatchEmbed {
  product_id: number;
  products: { family_id: number | null } | { family_id: number | null }[] | null;
}

/** What makes two shop products comparable: the same family, else the same exact product. */
function groupKey(r: Row): string | undefined {
  const m = Array.isArray(r.product_matches) ? r.product_matches[0] : r.product_matches;
  if (!m) return undefined;
  const p = Array.isArray(m.products) ? m.products[0] : m.products;
  return p?.family_id ? `f${p.family_id}` : `p${m.product_id}`;
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

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "-").padStart(4);

function categoryReport(rows: Row[]) {
  // Which shops sell something in each family.
  const shopsByKey = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = groupKey(r);
    if (key) shopsByKey.set(key, (shopsByKey.get(key) ?? new Set()).add(r.shop_id));
  }
  console.log("Categories: products on sale, and the share comparable with at least one other shop (same family)");
  console.log(`  ${"".padEnd(25)}${SHOPS.map((s) => s.label.padStart(23)).join("")}`);
  for (const [group, label] of Object.entries(CATEGORY_LABELS)) {
    const cells = SHOPS.map((shop) => {
      const inGroup = rows.filter((r) => r.shop_id === shop.id && GROUPS[shop.id]?.(r) === group);
      const comparable = inGroup.filter((r) => (shopsByKey.get(groupKey(r) ?? "")?.size ?? 0) > 1).length;
      return `${String(inGroup.length).padStart(5)} / ${pct(comparable, inGroup.length)} comparable`.padStart(23);
    });
    console.log(`  ${label.padEnd(25)}${cells.join("")}`);
  }
}

function itemReport(rows: Row[], showNames: boolean) {
  const lines: string[] = [];
  const counts = { "all linked": 0, "partly linked": 0, "not linked": 0, "one shop only": 0, "no shop": 0 };
  const perShop = new Map(SHOPS.map((s) => [s.id, { has: 0, linked: 0 }]));

  for (const item of COMMON_ITEMS) {
    const hits = rows.filter((r) => fits(item, r));
    const sellers = SHOPS.filter((s) => hits.some((r) => r.shop_id === s.id));
    // The family most shops are linked to is the one the basket compares.
    const shopsPerKey = new Map<string, Set<string>>();
    for (const r of hits) {
      const key = groupKey(r);
      if (key) shopsPerKey.set(key, (shopsPerKey.get(key) ?? new Set()).add(r.shop_id));
    }
    const main = [...shopsPerKey.values()].sort((a, b) => b.size - a.size)[0] ?? new Set<string>();
    const linked = main.size > 1 ? main : new Set<string>();

    const status =
      sellers.length === 0
        ? "no shop"
        : sellers.length === 1
          ? "one shop only"
          : linked.size === sellers.length
            ? "all linked"
            : linked.size
              ? "partly linked"
              : "not linked";
    counts[status]++;
    for (const s of sellers) {
      perShop.get(s.id)!.has++;
      if (linked.has(s.id)) perShop.get(s.id)!.linked++;
    }

    // ✓ linked to the main family, ~ sold but not linked, · not found.
    const marks = SHOPS.map((s) => `${s.short}${linked.has(s.id) ? "✓" : sellers.includes(s) ? "~" : "·"}`).join(" ");
    lines.push(`${marks}  ${status.padEnd(14)} ${item.label}`);
    if (showNames || status === "partly linked" || status === "not linked") {
      for (const s of sellers) {
        const names = hits.filter((r) => r.shop_id === s.id).map((r) => `"${r.name}"`);
        lines.push(`${"".padEnd(31)}${s.short}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` (+${names.length - 4})` : ""}`);
      }
    }
  }

  console.log(`\nCommon items (✓ linked, ~ sold but not linked, · not found):\n${lines.join("\n")}`);
  console.log(`\n${COMMON_ITEMS.length} common items:`);
  for (const [status, n] of Object.entries(counts)) console.log(`  ${status.padEnd(14)} ${n}`);
  console.log("\nPer shop (common items found / linked to the other shops):");
  for (const s of SHOPS) {
    const c = perShop.get(s.id)!;
    console.log(`  ${s.label.padEnd(22)} found ${String(c.has).padStart(3)}, linked ${String(c.linked).padStart(3)}`);
  }
}

async function main() {
  const showNames = process.argv.includes("--names");
  const db = adminClient();
  const all = await fetchAll<Row>((from, to) =>
    db
      .from("shop_products")
      .select(
        "id, shop_id, name, categories, content_amount, content_unit, last_seen_at, listed_until, product_matches(product_id, products(family_id))",
      )
      .order("id")
      .range(from, to),
  );
  const rows = all.filter((r) => isListed(r));
  console.log(`${rows.length} of ${all.length} shop products are on sale now.\n`);

  categoryReport(rows);
  itemReport(rows, showNames);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
