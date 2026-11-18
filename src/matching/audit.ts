/**
 * Trust audit: what would the shopping list (/liste) compare for a realistic
 * border-trip basket, and where could the answer be wrong?
 *
 *   npm run match:audit                 the basket below
 *   npm run match:audit -- --find <re>  list on-sale shop products whose name matches
 *
 * For each item it picks the family most shops are linked to (like match:coverage),
 * then prices that family per shop the way compare.ts does (each offer at the smaller of
 * its listing's and its product's content, cheapest whole packs for
 * the item's amount, multi-buy rate assumed), using only offers matched_prices shows
 * (seen in 3 days / newsletter valid, and unreviewed LLM links held back below 0.8).
 * It then flags:
 *  - missed: a shop sells the item (name rule + size) but no visible offer of it is
 *    in the family -> the list shows an estimate for that shop
 *  - held back: the shop's product is linked, but by a weak LLM link the site hides
 *  - split: the same item (name rule + size) sits in another family/product
 *  - cheap outlier: a shop's price per l/kg in the family is < 75 % of the median of
 *    the other shops - a possible wrong content, pack or multi-buy reading
 *  - container: cans and bottles mixed in one family (the list would pick either)
 *  - coupon: the chosen offer is a coupon price (shown with a badge - just listed)
 *
 * Read-only: it never writes to the database.
 */
import { adminClient, fetchAll } from "../db/admin";
import { COMMON_ITEMS, type CommonItem } from "./common-items";
import { isListed } from "./groups";

const SHOPS = ["poetzsch", "fleggaard", "calle", "scandipark", "bordershop", "bordershop-rostock"] as const;
const SHORT: Record<string, string> = {
  poetzsch: "P",
  fleggaard: "F",
  calle: "C",
  scandipark: "S",
  bordershop: "B",
  "bordershop-rostock": "R",
};
const NEWSLETTER = new Set(["fleggaard", "calle"]);
const ALCOHOL_FREE = /\b0[,.]0 ?%|\b0[,.]0\b|alkoholfri|alcohol ?free|\b0[,.]5 ?%/i;
const BOTTLES = /flask|\bfl\b|\bpet\b|bottle/i;
const CANS = /dåse|\bds\b|\bcan\b|dose/i;

/** The basket: labels from common-items.ts, plus wines and groceries defined here. */
const BASKET_LABELS = [
  "Coca-Cola 24x0,33",
  "Coca-Cola Zero 24x0,33",
  "Pepsi Max 24x0,33",
  "Faxe Kondi 24x0,33",
  "Fanta Orange 24x0,33",
  "Red Bull 24x0,25",
  "Monster Energy 12x0,5",
  "Carlsberg Pilsner 24x0,33",
  "Tuborg Grøn 24x0,33",
  "Tuborg Classic 24x0,33",
  "Royal Pilsner 24x0,33",
  "Heineken 24x0,33",
  "Somersby Apple",
  "Jägermeister 1 l",
  "Gammel Dansk 1 l",
  "Smirnoff Vodka 1 l",
  "Baileys Original 1 l",
  "Captain Morgan Spiced 1 l",
  "Haribo Matador Mix 1 kg",
  "Toms Guldkarameller",
  "Marabou Mælkechokolade",
  "Kinder Bueno",
  "Nutella 1 kg",
  "Pringles Original",
];
const EXTRA: CommonItem[] = [
  { label: "Casillero del Diablo Cabernet Sauvignon 0,75 l", include: /casillero del diablo.*cabernet/i, content: { amount: 0.75, unit: "l" }, bottles: true },
  { label: "Yellow Tail Shiraz 0,75 l", include: /yellow tail.*shiraz/i, content: { amount: 0.75, unit: "l" }, bottles: true },
  { label: "Nescafé Gold 200 g", include: /nescaf[eé] gold/i, exclude: /cappuccino|latte|crema|decaf|stick|mild/i, content: { amount: 0.2, unit: "kg" } },
  { label: "Lavazza Crema e Gusto 1 kg", include: /lavazza.*crema e gusto/i, exclude: /bønner|bohne|beans|forte|dolce/i, content: { amount: 1, unit: "kg" } },
];

interface Row {
  id: number;
  shop_id: string;
  name: string;
  content_amount: number | null;
  content_unit: string | null;
  pack_count: number | null;
  last_seen_at: string | null;
  listed_until: string | null;
  product_matches: MatchEmbed[] | MatchEmbed | null;
}
interface MatchEmbed {
  product_id: number;
  method: string;
  confidence: number;
  reviewed: boolean;
  products: ProductEmbed | ProductEmbed[] | null;
}
interface ProductEmbed {
  family_id: number | null;
  name: string;
  content_amount: number | null;
  content_unit: string | null;
}
interface PriceRow {
  shop_product_id: number;
  price: number;
  price_per_unit: number | null;
  multi_buy_quantity: number | null;
  multi_buy_price: number | null;
  coupon: boolean;
}

const one = <T>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

interface Listing {
  row: Row;
  match: MatchEmbed | null;
  product: ProductEmbed | null;
  price: PriceRow | null;
  /** matched_prices shows it. */
  visible: boolean;
  /** Price per piece a bulk shopper pays (deal rate when it beats the single price). */
  effective: number | null;
  /** The content the list prices this offer at (see offerContent). */
  content: { amount: number; unit: string } | null;
  /** Effective price per l/kg of that content. */
  perUnit: number | null;
}

/**
 * Same rule as the list (src/catalog/data.ts, 2026-11-17): the smaller of the listing's
 * and the product's content; the product's when the units differ; whichever is known
 * when one is missing. A disagreement can then only make a shop look dearer.
 */
function offerContent(row: Row, product: ProductEmbed | null): { amount: number; unit: string } | null {
  const own = row.content_amount !== null && row.content_unit ? { amount: Number(row.content_amount), unit: row.content_unit } : null;
  const prod = product?.content_amount != null && product.content_unit ? { amount: Number(product.content_amount), unit: product.content_unit } : null;
  if (!own || !prod) return own ?? prod;
  if (own.unit !== prod.unit) return prod;
  return own.amount < prod.amount ? own : prod;
}

function fits(item: CommonItem, name: string): boolean {
  if (!item.include.test(name) || item.exclude?.test(name)) return false;
  if (!item.alcoholFree && ALCOHOL_FREE.test(name)) return false;
  if (!item.bottles && BOTTLES.test(name)) return false;
  return true;
}
function sizeFits(item: CommonItem, amount: number | null, unit: string | null): boolean {
  if (!item.content) return true;
  return unit === item.content.unit && amount !== null && Math.abs(amount - item.content.amount) / item.content.amount <= 0.02;
}
const key = (l: Listing) => (l.product?.family_id ? `f${l.product.family_id}` : l.match ? `p${l.match.product_id}` : "none");
const kr = (n: number) => n.toFixed(2).replace(".", ",");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

async function load() {
  const db = adminClient();
  const rows = (
    await fetchAll<Row>((from, to) =>
      db
        .from("shop_products")
        .select(
          "id, shop_id, name, content_amount, content_unit, pack_count, last_seen_at, listed_until, product_matches(product_id, method, confidence, reviewed, products(family_id, name, content_amount, content_unit))",
        )
        .order("id")
        .range(from, to),
    )
  ).filter((r) => isListed(r));
  const prices = await fetchAll<PriceRow>((from, to) =>
    db
      .from("current_prices")
      .select("shop_product_id, price, price_per_unit, multi_buy_quantity, multi_buy_price, coupon")
      .order("shop_product_id")
      .range(from, to),
  );
  const families = await fetchAll<{ id: number; name: string }>((from, to) =>
    db.from("product_families").select("id, name").order("id").range(from, to),
  );
  const priceBy = new Map(prices.map((p) => [p.shop_product_id, p]));
  const listings: Listing[] = rows.map((row) => {
    const match = one(row.product_matches);
    const product = match ? one(match.products) : null;
    const price = priceBy.get(row.id) ?? null;
    const visible = !!match && !!price && (match.reviewed || match.method !== "llm" || Number(match.confidence) >= 0.8);
    let effective: number | null = null;
    if (price) {
      const single = Number(price.price);
      const deal = price.multi_buy_quantity && price.multi_buy_price !== null ? Number(price.multi_buy_price) / price.multi_buy_quantity : null;
      effective = deal !== null && deal < single - 0.005 ? deal : single;
    }
    const content = offerContent(row, product);
    const perUnit = effective !== null && content?.amount ? effective / content.amount : null;
    return { row, match, product, price, visible, effective, content, perUnit };
  });
  return { listings, familyName: new Map(families.map((f) => [`f${f.id}`, f.name])) };
}

function audit(item: CommonItem, listings: Listing[], familyName: Map<string, string>) {
  const out: string[] = [];
  const problems: string[] = [];
  const hits = listings.filter((l) => fits(item, l.row.name) && sizeFits(item, l.row.content_amount, l.row.content_unit));
  // Family most shops are linked to (visible links only) = what the list compares.
  const shopsPerKey = new Map<string, Set<string>>();
  for (const l of hits) if (l.visible) shopsPerKey.set(key(l), (shopsPerKey.get(key(l)) ?? new Set()).add(l.row.shop_id));
  const mainKey = [...shopsPerKey].sort((a, b) => b[1].size - a[1].size)[0]?.[0];
  if (!mainKey) {
    out.push(`  no visible match at all (${hits.length} hits)`);
    return { out, problems: ["no visible match"], priced: [] as string[], estimated: [] as string[] };
  }
  out.push(`  family: ${familyName.get(mainKey) ?? mainKey} (${mainKey})`);

  // What the list buys per shop: whole packs of the family for the item's amount.
  const amount = item.content?.amount ?? median(hits.flatMap((l) => (l.row.content_amount ? [Number(l.row.content_amount)] : [])));
  const unit = item.content?.unit ?? hits.find((l) => l.row.content_unit)?.row.content_unit;
  const inFamily = listings.filter((l) => l.visible && key(l) === mainKey);
  const priced: string[] = [];
  const estimated: string[] = [];
  const perUnitByShop = new Map<string, number>();
  for (const shop of SHOPS) {
    let best: { l: Listing; qty: number; cost: number } | null = null;
    for (const l of inFamily.filter((x) => x.row.shop_id === shop)) {
      const c = l.content?.amount;
      if (!c || l.content?.unit !== unit || l.effective === null) continue;
      const qty = Math.max(1, Math.ceil(amount / c - 1e-9));
      const cost = qty * l.effective;
      if (!best || cost < best.cost) best = { l, qty, cost };
    }
    const sells = hits.filter((l) => l.row.shop_id === shop);
    if (best) {
      priced.push(SHORT[shop]);
      if (best.l.perUnit !== null) perUnitByShop.set(shop, best.l.perUnit);
      const p = best.l.price!;
      const deal = p.multi_buy_quantity ? ` (deal ${p.multi_buy_quantity} for ${kr(Number(p.multi_buy_price))})` : "";
      const coupon = p.coupon ? " KUPON" : "";
      out.push(
        `  ${SHORT[shop]} ${best.qty} x "${best.l.row.name}" [${best.l.content?.amount} ${unit}] ${kr(Number(p.price))}${deal}${coupon} = ${kr(best.cost)}  (${kr(best.l.perUnit ?? NaN)}/${unit}, ${best.l.match!.method} ${best.l.match!.confidence}${best.l.match!.reviewed ? " reviewed" : ""})`,
      );
      if (p.coupon) problems.push(`${SHORT[shop]} coupon price (badge shown)`);
    } else {
      estimated.push(SHORT[shop]);
      out.push(`  ${SHORT[shop]} -- estimated${NEWSLETTER.has(shop) && !sells.length ? " (not in newsletter)" : ""}`);
    }
    // Shop sells the item but its listing isn't (visibly) in the main family.
    for (const l of sells) {
      if (l.visible && key(l) === mainKey) continue;
      const why = !l.match
        ? "unmatched"
        : !l.price
          ? "no price"
          : !l.visible
            ? `held back (llm ${l.match.confidence})`
            : `in ${familyName.get(key(l)) ?? key(l)} (${key(l)})`;
      const tag = best ? "also" : "MISSED";
      out.push(`     ${tag}: "${l.row.name}" #${l.row.id} ${why}`);
      problems.push(`${SHORT[shop]} ${best ? "split" : "missed"}: ${why}`);
    }
  }

  // Cheap outliers: a shop well below the others' median per l/kg.
  for (const [shop, pu] of perUnitByShop) {
    const others = [...perUnitByShop].filter(([s]) => s !== shop).map(([, v]) => v);
    if (others.length >= 2 && pu < 0.75 * median(others)) {
      out.push(`  ! ${SHORT[shop]} ${kr(pu)}/${unit} vs median ${kr(median(others))} of the others`);
      problems.push(`${SHORT[shop]} cheap outlier (${Math.round((100 * pu) / median(others))}% of median)`);
    }
  }
  // Cans and bottles in one family.
  const containers = new Set(inFamily.map((l) => (BOTTLES.test(l.row.name) ? "bottle" : CANS.test(l.row.name) ? "can" : "?")));
  if (containers.has("bottle") && containers.has("can")) {
    const bottles = inFamily.filter((l) => BOTTLES.test(l.row.name)).map((l) => `${SHORT[l.row.shop_id]} "${l.row.name}"`);
    out.push(`  ! bottles in the family: ${bottles.slice(0, 6).join(", ")}`);
  }
  return { out, problems, priced, estimated };
}

/**
 * Every family: visible listings that are the family's cheapest per l/kg and cost
 * under half the median of the other shops' listings - candidates for a wrong
 * content, a wrong link (merchandise, a different product) or a misread deal.
 */
function outliers(listings: Listing[], familyName: Map<string, string>) {
  const byFamily = new Map<string, Listing[]>();
  for (const l of listings) {
    if (!l.visible || !l.product?.family_id || l.perUnit === null) continue;
    const k = `${key(l)}|${l.content?.unit}`;
    byFamily.set(k, [...(byFamily.get(k) ?? []), l]);
  }
  const found: string[] = [];
  for (const [k, ls] of byFamily) {
    const cheapest = [...ls].sort((a, b) => a.perUnit! - b.perUnit!)[0];
    const others = ls.filter((l) => l.row.shop_id !== cheapest.row.shop_id).map((l) => l.perUnit!);
    if (others.length < 2) continue;
    const m = median(others);
    if (cheapest.perUnit! >= 0.5 * m) continue;
    const fk = k.split("|")[0];
    found.push(
      `${Math.round((100 * cheapest.perUnit!) / m)}%  ${familyName.get(fk) ?? fk} (${fk}): ${SHORT[cheapest.row.shop_id]} #${cheapest.row.id} "${cheapest.row.name}" ${cheapest.content?.amount} ${cheapest.content?.unit} ${kr(cheapest.effective!)} = ${kr(cheapest.perUnit!)} vs median ${kr(m)} (${cheapest.match!.method} ${cheapest.match!.confidence}${cheapest.match!.reviewed ? " reviewed" : ""})`,
    );
  }
  console.log(`${found.length} families whose cheapest listing is under half the others' median:\n${found.sort().join("\n")}`);
}

/**
 * The site prices a listing at its product's content (packsForBasket), so a visible
 * listing whose own content differs from the product's gets a wrong price per l/kg.
 */
function contentMismatch(listings: Listing[], familyName: Map<string, string>) {
  const found = listings.filter((l) => {
    if (!l.visible || !l.product) return false;
    const a = l.row.content_amount === null ? null : Number(l.row.content_amount);
    const b = l.product.content_amount === null ? null : Number(l.product.content_amount);
    if (a === null || b === null) return a !== b;
    return l.row.content_unit !== l.product.content_unit || Math.abs(a - b) / b > 0.02;
  });
  console.log(`${found.length} visible listings whose content differs from their product's:`);
  for (const l of found.sort((x, y) => key(x).localeCompare(key(y))))
    console.log(
      `${SHORT[l.row.shop_id]} #${l.row.id} "${l.row.name}" ${l.row.content_amount ?? "?"} ${l.row.content_unit ?? ""} -> product #${l.match!.product_id} "${l.product!.name}" ${l.product!.content_amount ?? "?"} ${l.product!.content_unit ?? ""} [${familyName.get(key(l)) ?? key(l)}] (${l.match!.method} ${l.match!.confidence}${l.match!.reviewed ? " reviewed" : ""})`,
    );
}

/**
 * Families with the same name once pack sizes and punctuation are stripped, each
 * with something on sale: likely one item split in two, so neither side compares.
 */
function duplicateFamilies(listings: Listing[], familyName: Map<string, string>) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/é/g, "e")
      .replace(/\d+(?:[.,]\d+)?\s*(?:-\s*\d+(?:[.,]\d+)?\s*)?(?:x\s*\d+(?:[.,]\d+)?\s*)?(kg|g|l|cl|ml|stk)\b\.?/g, " ")
      .replace(/[^a-z0-9æøå]+/g, " ")
      .trim();
  const shopsByFamily = new Map<string, Set<string>>();
  for (const l of listings) {
    if (!l.visible || !l.product?.family_id) continue;
    shopsByFamily.set(key(l), (shopsByFamily.get(key(l)) ?? new Set()).add(SHORT[l.row.shop_id]));
  }
  const byName = new Map<string, string[]>();
  for (const k of shopsByFamily.keys()) {
    const n = norm(familyName.get(k) ?? "");
    if (n) byName.set(n, [...(byName.get(n) ?? []), k]);
  }
  const dupes = [...byName].filter(([, ks]) => ks.length > 1);
  console.log(`${dupes.length} family names on sale in more than one family:`);
  for (const [n, ks] of dupes.sort())
    console.log(`  ${n}: ${ks.map((k) => `${k} "${familyName.get(k)}" [${[...shopsByFamily.get(k)!].join("")}]`).join("  |  ")}`);
}

async function main() {
  const { listings, familyName } = await load();
  const findAt = process.argv.indexOf("--find");
  if (findAt > 0) {
    const re = new RegExp(process.argv[findAt + 1], "i");
    for (const l of listings.filter((x) => re.test(x.row.name)).sort((a, b) => a.row.name.localeCompare(b.row.name)))
      console.log(
        `${SHORT[l.row.shop_id]} #${l.row.id} "${l.row.name}" ${l.row.content_amount ?? "?"} ${l.row.content_unit ?? ""} ${l.price ? kr(Number(l.price.price)) : "-"} -> ${key(l)} ${familyName.get(key(l)) ?? ""} ${l.match ? `${l.match.method} ${l.match.confidence}${l.match.reviewed ? " R" : ""}` : ""}${l.visible ? "" : " HIDDEN"}`,
      );
    return;
  }

  if (process.argv.includes("--outliers")) return outliers(listings, familyName);
  if (process.argv.includes("--content")) return contentMismatch(listings, familyName);
  if (process.argv.includes("--dupes")) return duplicateFamilies(listings, familyName);

  const items = [...BASKET_LABELS.map((label) => COMMON_ITEMS.find((i) => i.label === label)!), ...EXTRA];
  const summary: string[] = [];
  for (const item of items) {
    const { out, problems, priced, estimated } = audit(item, listings, familyName);
    console.log(`\n${item.label}\n${out.join("\n")}`);
    summary.push(`| ${item.label} | ${priced.join(" ") || "-"} | ${estimated.join(" ") || "-"} | ${problems.join("; ") || "-"} |`);
  }
  console.log(`\n| Item | Priced | Estimated | Problems |\n|---|---|---|---|\n${summary.join("\n")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
