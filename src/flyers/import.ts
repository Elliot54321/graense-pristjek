/**
 * Import newsletter offers (from `flyer:extract`) as a shop's prices.
 *
 *   npm run flyer:import -- <offers.json> --shop fleggaard --valid-to 2026-11-03 \
 *     [--section 26-38:2026-12-31] [--dry-run] [--no-pages]
 *
 * Every product an offer names (and every variety readable on the picture) becomes
 * a shop product with the offer's price. Products count as on sale until the
 * newsletter's end date (`listed_until`); `--section` overrides it for page ranges
 * with their own period (e.g. a premium wine section). Prices are only stored when
 * they change, like the scrapers. Products still need matching afterwards
 * (`npm run match:new`) before the website shows them.
 *
 * Each product remembers its issue (the offers file's name), page and the text printed
 * with the offer, and the pages are uploaded as images to a private bucket - so
 * /admin can show where a match came from (see pages.ts). --no-pages skips the upload.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { unitPrice } from "../scrapers/quantity";
import { uploadPages } from "./pages";
import { packPrice, singlePrice } from "./prices";
import { adminClient, finishRun, saveProducts, startRun, type RunSummary } from "../scrapers/save";
import type { BaseUnit, ScrapedProduct } from "../scrapers/types";

const SHOP_WEBSITES: Record<string, string> = { fleggaard: "https://www.fleggaard.dk", calle: "https://www.calle.dk" };

interface Offer {
  products: string[];
  visible_variants: string[];
  category: string;
  pack: string;
  unit_count: number | null;
  unit_size: number | null;
  unit: "l" | "kg" | "stk" | null;
  price: number;
  price_per_liter_or_kg: number | null;
  price_per_is_max: boolean;
  multi_buy: { quantity: number; total_price: number } | null;
  always_low_price: boolean;
  saving_vs_dk_percent: number | null;
  price_unit?: string;
  limit_note?: string | null;
  /** Missing in extractions made before coupons were read (2026-11-05). */
  coupon?: boolean;
}
interface Extracted {
  pdf: string;
  pages: { page: number; result: { offers: Offer[] } }[];
}

function parseSections(args: string[]): { from: number; to: number; validTo: string }[] {
  return args.flatMap((a, i) => {
    if (a !== "--section") return [];
    const m = args[i + 1]?.match(/^(\d+)-(\d+):(\d{4}-\d{2}-\d{2})$/);
    if (!m) throw new Error(`--section must look like 26-38:2026-12-31, got ${args[i + 1]}`);
    return [{ from: Number(m[1]), to: Number(m[2]), validTo: m[3] }];
  });
}

/** Content of the whole sellable unit in liters/kg; null for ranges ("18-24 x") or pieces. */
function content(o: Offer): { amount: number; unit: BaseUnit } | null {
  // A range like "250-375 g." means several sizes; an alcohol range like "17-37,5%" doesn't.
  const pack = o.pack.replace(/\d+(?:[,.]\d+)?\s*-\s*\d+(?:[,.]\d+)?\s*%/g, "");
  if ((o.unit !== "l" && o.unit !== "kg") || !o.unit_size || /\d\s*-\s*\d/.test(pack.split("x")[0])) return null;
  return { amount: Math.round((o.unit_count ?? 1) * o.unit_size * 1e6) / 1e6, unit: o.unit };
}

/** Stable id, so the same product in next month's newsletter updates the same row. */
const productKey = (name: string, pack: string) =>
  "nl-" + createHash("sha1").update(`${name}|${pack}`.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

/** What the newsletter printed with an offer, for checking a match: "Coca Cola / Coca Cola Zero · 6 x 1,25 l. · 6,66 Pr. fl. · ..." */
function printedText(o: Offer): string {
  return [
    [...o.products, ...o.visible_variants].join(" / "),
    o.pack,
    `${o.price} ${o.price_unit ?? ""}`.trim(),
    o.multi_buy && `${o.multi_buy.quantity} for ${o.multi_buy.total_price}`,
    o.limit_note,
    o.coupon && "KUPONTILBUD",
    o.always_low_price && "ALTID LAV PRIS",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * "12 x 55 g." priced "12 stk. 149,99" with multi-buy 12 for 149,99 is not a 12-pack: the
 * shop sells single bars ("Pr. stk. 16,99"), 12 for 149,99. The same offer was read that way
 * at Calle, and as a 12-pack at Fleggaard (then priced 16,99 for all 12 bars). Store it as
 * the single item with the deal, so both shops get the same product and the basket uses
 * the deal for every full 12.
 */
function singlesWithDeal(o: Offer): Offer {
  const deal = o.multi_buy;
  if (!deal || (o.unit_count ?? 0) < 2 || o.unit_count !== deal.quantity || Math.abs(o.price - deal.total_price) >= 0.005) return o;
  return { ...o, pack: o.pack.replace(/^\s*\d+\s*[x×]\s*/i, ""), unit_count: 1 };
}

export function offersToProducts(
  data: Extracted,
  shop: string,
  validTo: string,
  sections: ReturnType<typeof parseSections>,
  issue: string,
) {
  const now = new Date().toISOString();
  const byKey = new Map<string, ScrapedProduct>();
  for (const { page, result } of data.pages) {
    const until = sections.find((s) => page >= s.from && page <= s.to)?.validTo ?? validTo;
    for (const read of result.offers) {
      const o = singlesWithDeal(read);
      const total = content(o);
      // One unit's price, for the whole pack (see prices.ts).
      const price = packPrice(o, singlePrice(o));
      const names = [...new Set([...o.products, ...o.visible_variants].map((n) => n.trim()).filter(Boolean))];
      for (const name of names) {
        const key = productKey(name, o.pack);
        const product: ScrapedProduct = {
          shop,
          shopProductId: key,
          url: SHOP_WEBSITES[shop] ?? "",
          name: `${name} ${o.pack}`.trim(),
          brand: null,
          ean: null,
          categories: [o.category],
          price,
          currency: "DKK",
          packText: o.pack,
          packCount: o.unit_count,
          unitSize: o.unit_size && (o.unit === "l" || o.unit === "kg") ? { amount: o.unit_size, unit: o.unit } : null,
          totalContent: total,
          // The printed per-kg price may be the multi-buy one ("v/merkøb"), so only trust our own.
          pricePerUnit: unitPrice(price, total, o.price_per_is_max || price !== o.price ? null : o.price_per_liter_or_kg),
          onOffer: !o.always_low_price,
          regularPrice: null,
          offerEndsAt: o.always_low_price ? null : until,
          pfand: null,
          listedUntil: until,
          source: { issue, page, text: printedText(read) },
          multiBuy: o.multi_buy ? { quantity: o.multi_buy.quantity, price: o.multi_buy.total_price } : null,
          savingVsDkPercent: o.saving_vs_dk_percent,
          coupon: o.coupon ?? false,
          scrapedAt: now,
        };
        // The same product on two pages: keep the cheaper listing.
        const existing = byKey.get(key);
        if (!existing || product.price < existing.price) byKey.set(key, product);
      }
    }
  }
  return [...byKey.values()];
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.endsWith(".json"));
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const shop = opt("--shop");
  const validTo = opt("--valid-to");
  if (!file || !shop || !validTo || !/^\d{4}-\d{2}-\d{2}$/.test(validTo)) {
    console.error("Usage: npm run flyer:import -- <offers.json> --shop <id> --valid-to YYYY-MM-DD [--section 26-38:YYYY-MM-DD] [--dry-run]");
    process.exit(1);
  }
  const data: Extracted = JSON.parse(readFileSync(file, "utf8"));
  // The issue is the offers file's name: "fleggaard-2026-november-1".
  const issue = path.basename(file).replace(/\.offers\.json$/, "");
  const products = offersToProducts(data, shop, validTo, parseSections(args), issue);

  const cats: Record<string, number> = {};
  for (const p of products) cats[p.categories[0]] = (cats[p.categories[0]] ?? 0) + 1;
  console.log(`${products.length} ${shop} products from ${data.pdf}: ${JSON.stringify(cats)}`);
  console.log(`  without content (ranges, pieces): ${products.filter((p) => !p.totalContent).length}`);
  console.log(`  coupon prices: ${products.filter((p) => p.coupon).length}`);
  console.log(`  valid until: ${JSON.stringify(Object.fromEntries([...new Set(products.map((p) => p.listedUntil))].map((d) => [d, products.filter((p) => p.listedUntil === d).length])))}`);
  for (const p of products.slice(0, 12)) {
    console.log(`  ${p.name.slice(0, 55).padEnd(55)} ${String(p.price).padStart(7)}  ${p.totalContent ? `${p.totalContent.amount} ${p.totalContent.unit}` : "-"}  ${p.pricePerUnit ?? "-"}/unit${p.multiBuy ? `  ${p.multiBuy.quantity} for ${p.multiBuy.price}` : ""}`);
  }
  if (args.includes("--dry-run")) return console.log("Dry run - nothing saved.");

  const db = adminClient();
  const runId = await startRun(db, shop);
  const summary: RunSummary = { urlsFound: products.length, productsScraped: products.length, productsFailed: 0, priceChanges: 0, warnings: [] };
  try {
    const result = await saveProducts(db, shop, products);
    summary.priceChanges = result.priceChanges;
    summary.warnings.push(...result.warnings);
    await finishRun(db, runId, summary);
    console.log(`Saved: ${result.priceChanges} new price rows (run #${runId}). Next: npm run match:new`);
    if (!args.includes("--no-pages")) {
      const pdf = file.replace(/\.offers\.json$/, ".pdf");
      const pages = [...new Set(products.map((p) => p.source!.page))].sort((a, b) => a - b);
      await uploadPages(db, pdf, issue, pages);
      console.log(`Uploaded ${pages.length} page images for /admin (private bucket).`);
    }
  } catch (e) {
    await finishRun(db, runId, summary, String(e));
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
