/**
 * Newsletter offers from eTilbudsavis (Tjek's public "squid" API) instead of reading the PDF.
 *
 *   npm run flyer:etilbudsavis -- <fleggaard|calle> [--skip <catalogId,...>] [--dry-run]
 *
 * Fleggaard allows using its newsletters and only said no to scraping its own website, so
 * reading the same newsletters here is fine (user, 2026-11-19). fleggaard.dk / calle.dk are
 * never touched; requests go through politeFetch (bot User-Agent, 2 s apart), a few dozen per run.
 *
 * Every current issue of the shop is fetched (the paged newsletter and the web-only "incito"
 * ones), raw JSON kept in data/etilbudsavis/. Each offer becomes the same shape flyer:extract
 * writes, so the import rules (deals, pack prices, content) are shared with flyer:import.
 * Quality checked against the November PDFs (roadmap 2026-11-19): prices and all multi-buys
 * agree; coupon offers (Calle's KUPONTILBUD) are never served by the API.
 *
 * Product names: an offer is one heading ("Galliano, Passoã el. Kahlua"). Claude splits it
 * into products and picks a category (cached per heading in data/llm-batches/cache, so
 * reruns are free). --dry-run never calls the model: without a cached answer it splits by a
 * simple rule and says so.
 *
 * All of a shop's issues are imported in one run, because the same item (same name + pack =
 * same row) can be in two issues at different prices: the cheapest wins, and an offer never
 * overwrites a cheaper row still listed from another issue (e.g. imported from the PDF).
 * Then run `npm run match:new`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { fetchAll } from "../db/admin";
import { GROUP_IDS } from "../matching/groups";
import { costUsd } from "../matching/llm";
import { politeFetch } from "../scrapers/http";
import { parseQuantity } from "../scrapers/quantity";
import { adminClient, finishRun, saveProducts, startRun, type RunSummary } from "../scrapers/save";
import type { ScrapedProduct } from "../scrapers/types";
import { offersToProducts, retireDropped, type Extracted, type Offer } from "./import";
import { printedSingle } from "./prices";

const API = "https://squid-api.tjek.com/v2";
export const DEALERS: Record<string, string> = { fleggaard: "6e09Z", calle: "44d0Q" };
const RAW_DIR = "data/etilbudsavis";
const CACHE_DIR = "data/llm-batches/cache";
const SPLIT_MODEL = "claude-sonnet-5-5";
const SPLIT_BATCH = 80;

/** The parts of an API offer we use. */
export interface TjekOffer {
  id: string;
  heading: string;
  description: string | null;
  catalog_page: number | null;
  pricing: { price: number; pre_price: number | null; currency: string };
  quantity: {
    unit: { symbol: string; si: { symbol: string; factor: number } } | null;
    size: { from: number | null; to: number | null };
    pieces: { from: number | null; to: number | null };
  };
  run_till: string;
}
interface TjekCatalog {
  id: string;
  label: string;
  run_from: string;
  run_till: string;
  offer_count: number;
  types?: string[];
}

async function get<T>(url: string): Promise<T> {
  const res = await politeFetch(API + url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

/** The newsletter's last day in Danish time ("2026-11-24T22:59:59+0000" -> 2026-11-24). */
export function lastDay(runTill: string): string {
  const d = new Date(runTill.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(d);
}

/** Current issues of a dealer. Without `types` the API lists only the paged (PDF-like) one. */
async function currentCatalogs(dealer: string): Promise<TjekCatalog[]> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await get<TjekCatalog[]>(`/catalogs?dealer_ids=${dealer}&types=paged,incito&limit=50`);
  return all.filter((c) => lastDay(c.run_till) >= today);
}

/** All offers of an issue. The API serves fewer than `offer_count` when some are hidden (coupons). */
async function catalogOffers(id: string): Promise<TjekOffer[]> {
  const offers: TjekOffer[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await get<TjekOffer[]>(`/offers?catalog_id=${id}&limit=100&offset=${offset}`);
    offers.push(...page);
    if (page.length < 100) return offers;
  }
}

// ---------------------------------------------------------------------------------------
// One API offer -> the flyer:extract shape

const NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const UNIT = String.raw`(?:kg|g|l|cl|ml|stk|rl|m|pk|vaske|kapsler|tabs)`;
const SIZE = String.raw`\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*${UNIT}\b\.?`;
/** "24 x 0,33 l.", "18 - 24 x 0,33 l", "228-295 g.", "1 stk. el. 75 ml.", "0,7 l. 20-41%." */
const PACK = new RegExp(
  String.raw`(?:\d+(?:\s*-\s*\d+)?\s*(?:stk|pk)?\.?\s*[x×]\s*)?${SIZE}` +
    String.raw`(?:\s+el\.\s+(?:\d+\s*[x×]\s*)?${SIZE})?(?:\s+\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*%\.?)?`,
  "i",
);
/** Lines that are labels, not part of the pack text. */
const MARKERS = /\d+\s*liter\s*=\s*[\d.,]+\s*kr\.?\s*for\s*[\d,]+\s*l\.?|ALTID LAV PRIS|SPAR\s*\d+\s*%\s*(?:ift\.\s*DK\*?)?|\bNyhed\b|Dansk kvalitet\.?|Begrænset parti|KUPONTILBUD/gi;
/** "Pr. kg 80,-", "Pr. liter max 13,47" - not the deal's "v/merkøb" figure. */
const PER_UNIT = new RegExp(String.raw`Pr\.\s*(kg|liter|l)\.?\s*(max\.?\s*)?(${NUMBER})`, "i");

const toNumber = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * The offer as flyer:extract would have read it. A deal shows as `pieces` > 1 (in single
 * items: 3 cases of 24 = 72) with `price` the deal total and the single price printed in the
 * description ("Pr. ks. 71,99."). A multipack also has pieces > 1 but no cheaper single price.
 * Pieces > 1 without a printed single price stay one pack at the full price: dearer if it
 * was a deal, never falsely cheap.
 */
export function toOffer(a: TjekOffer, names: string[], category: string): Offer {
  const text = (a.description ?? "").replace(/\s+/g, " ").trim();
  const plain = text.replace(MARKERS, " ").replace(/\s+/g, " ");
  let pack = (plain.match(PACK)?.[0] ?? "").trim();
  const count = Number(pack.match(/^(\d+)\s*(?:stk|pk)?\.?\s*[x×]/i)?.[1] ?? 0) || null;

  // One item's size from the printed pack, as flyer:extract reads it. The API's own `size` is
  // sometimes the whole pack (Underberg 30 x 20 ml as 600 ml), so it isn't used. Size ranges
  // and either/or packs ("1 stk. el. 75 ml.") get none.
  const item = pack.match(/^(?:\d+(?:\s*-\s*\d+)?\s*(?:stk|pk)?\.?\s*[x×]\s*)?(\d+(?:[.,]\d+)?)(\s*-\s*\d)?\s*(kg|g|l|cl|ml)\b/i);
  let size = item && !item[2] && !/\sel\.\s/.test(pack) ? parseQuantity(`${item[1]} ${item[3]}`) : null;
  const per = text.match(PER_UNIT);
  // No pack printed ("Fersk Oksemørbrad - Pr. kg 249,98", 124,99): the API's size, when it
  // agrees with the printed price per kg/l.
  const q = a.quantity;
  if (!pack && q.size.from && q.size.from === q.size.to && q.unit && (q.unit.si.symbol === "kg" || q.unit.si.symbol === "l") && per) {
    const amount = Math.round(q.size.from * q.unit.si.factor * 1e6) / 1e6;
    const printed = toNumber(per[3]);
    if (Math.abs(a.pricing.price / amount - printed) / printed < 0.03) {
      size = { amount, unit: q.unit.si.symbol };
      pack = `${String(amount).replace(".", ",")} ${size.unit}.`;
    }
  }
  const unit = size?.unit === "kg" || size?.unit === "l" ? size.unit : a.quantity.unit?.si.symbol === "pcs" ? "stk" : null;

  const price = a.pricing.price;
  const pieces = a.quantity.pieces.from ?? 1;
  const singleOf = printedSingle({ price, multi_buy: { quantity: 2, total_price: price }, limit_note: text });
  let multiBuy: Offer["multi_buy"] = null;
  // pieces = the pack's own count ("24 x 0,33 l", "Pr. ks. 24 stk.") is a multipack, not a deal.
  if (pieces > 1 && singleOf !== null && pieces !== count) {
    const quantity = count && count > 1 && pieces % count === 0 ? pieces / count : pieces;
    // A real deal saves money: N singles cost more than the total (eggs "15 stk. Pr. stk. 2,67" don't).
    if (quantity > 1 && singleOf * quantity > price * 1.02) multiBuy = { quantity, total_price: price };
  }

  // "Pr. 1/2 kg" on a line of its own: the price is for that weight (meat, see pricedByWeight).
  const perWeight = (a.description ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^Pr\.\s*(?:1\/2|½|\d+(?:[.,]\d+)?)?\s*(?:kg|g)\.?$/i.test(l));
  return {
    products: names,
    visible_variants: [],
    category,
    pack,
    unit_count: count,
    unit_size: size && unit !== "stk" ? size.amount : null,
    unit,
    price,
    price_unit: perWeight,
    price_per_liter_or_kg: per && !/merkøb/i.test(per[0]) ? toNumber(per[3]) : null,
    price_per_is_max: !!per?.[2],
    multi_buy: multiBuy,
    always_low_price: /ALTID LAV PRIS/i.test(text),
    saving_vs_dk_percent: Number(text.match(/SPAR\s*(\d+)\s*%/i)?.[1] ?? NaN) || null,
    limit_note: text || null,
    coupon: /KUPON/i.test(`${a.heading} ${text}`),
  };
}

// ---------------------------------------------------------------------------------------
// Headings -> product names

/** Free fallback for dry runs: split on "," and "el.", borrowing the brand for a lone word. */
export function ruleSplit(heading: string): string[] {
  const parts = heading
    .replace(/\s+/g, " ")
    .split(/,(?!\d)\s*|\s+el\.\s+|\s+eller\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const brand = parts[0]?.split(" ");
  return parts.map((p, i) =>
    i > 0 && brand.length >= 2 && !p.toLowerCase().includes(brand[0].toLowerCase()) && !p.includes(" ") ? `${brand[0]} ${p}` : p,
  );
}

const Split = z.object({
  items: z.array(z.object({ i: z.number(), names: z.array(z.string()), category: z.enum([...GROUP_IDS, "other"]) })),
});

const SPLIT_INSTRUCTIONS = `Each line is one offer from a Danish border shop's newsletter: its heading, then its pack text.
A heading often names several products ("Galliano, Passoã el. Kahlua", "Toms Yankie el. Holly Bar",
"Coca Cola PET Original el. Zero"). For each offer return:
- names: every product it names, each a complete Danish product name as a shopper would search for it,
  with the brand and shared words repeated ("Toms Holly Bar", "Coca Cola PET Zero", "Cashewnødder Ristede
  og Saltede"). No pack size, price or "Flere varianter". "m. el. u. Kommen" style options stay one name.
  A single product is one name; fix nothing else in the wording.
- category: soda (incl. water, juice, iced tea, energy drinks), beer (incl. cider), candy (incl. chocolate),
  snacks (chips, popcorn, nuts, biscuits, cakes), spirits (incl. liqueurs, shots, alcopops), wine (incl.
  sparkling, port, sherry), groceries (other food, coffee, tea), household (cleaning, toiletries,
  perfume, pet food), other (toys, decorations, lights, gas, gifts).`;

/** Product names and category per offer, from Claude (cached) or, in a dry run, the rule split. */
async function splitHeadings(offers: TjekOffer[], dryRun: boolean) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const out = new Map<string, { names: string[]; category: string; fromModel: boolean }>();
  const client = dryRun ? null : new Anthropic();
  let cost = 0;
  let ruled = 0;
  for (let i = 0; i < offers.length; i += SPLIT_BATCH) {
    const batch = offers.slice(i, i + SPLIT_BATCH);
    const prompt = batch.map((o, j) => `${j} | ${o.heading.replace(/\s+/g, " ")} | ${(o.description ?? "").replace(/\s+/g, " ").slice(0, 80)}`).join("\n");
    const cacheFile = `${CACHE_DIR}/split-${SPLIT_MODEL}-${createHash("sha1").update(SPLIT_INSTRUCTIONS + prompt).digest("hex")}.json`;
    let items: z.infer<typeof Split>["items"] | null = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : null;
    if (!items && client) {
      const response = await client.messages.parse({
        model: SPLIT_MODEL,
        max_tokens: 16000,
        output_config: { format: zodOutputFormat(Split) },
        system: SPLIT_INSTRUCTIONS,
        messages: [{ role: "user", content: `i | heading | pack text\n${prompt}` }],
      });
      cost += costUsd(SPLIT_MODEL, response.usage.input_tokens, response.usage.output_tokens);
      if (response.parsed_output) {
        items = response.parsed_output.items;
        writeFileSync(cacheFile, JSON.stringify(items));
      }
    }
    const byIndex = new Map((items ?? []).map((it) => [it.i, it]));
    batch.forEach((o, j) => {
      const it = byIndex.get(j);
      const names = it?.names.map((n) => n.trim()).filter(Boolean);
      if (it && names?.length) out.set(o.id, { names, category: it.category === "other" ? "" : it.category, fromModel: true });
      else {
        ruled++;
        out.set(o.id, { names: ruleSplit(o.heading), category: "", fromModel: false });
      }
    });
  }
  return { names: out, cost, ruled };
}

// ---------------------------------------------------------------------------------------

/** What one piece costs at best: the deal rate when there is one. */
const effective = (p: { price: number; multiBuy?: { quantity: number; price: number } | null }) =>
  p.multiBuy ? Math.min(p.price, p.multiBuy.price / p.multiBuy.quantity) : p.price;

async function main() {
  const args = process.argv.slice(2);
  const shop = args.find((a) => !a.startsWith("--") && DEALERS[a]);
  const dryRun = args.includes("--dry-run");
  const skipArg = args.includes("--skip") ? args[args.indexOf("--skip") + 1] : "";
  const skip = new Set(skipArg.split(",").filter(Boolean));
  if (!shop) {
    console.error(`Usage: npm run flyer:etilbudsavis -- <${Object.keys(DEALERS).join("|")}> [--skip <catalogId,...>] [--dry-run]`);
    process.exit(1);
  }
  mkdirSync(RAW_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  const catalogs = (await currentCatalogs(DEALERS[shop])).filter((c) => !skip.has(c.id));
  const issues: { catalog: TjekCatalog; issue: string; until: string; offers: TjekOffer[] }[] = [];
  for (const catalog of catalogs) {
    const offers = await catalogOffers(catalog.id);
    writeFileSync(path.join(RAW_DIR, `${shop}-${catalog.id}-${today}.json`), JSON.stringify({ catalog, offers }, null, 1));
    // The issue name is what /admin shows as the source and where page images would live.
    issues.push({ catalog, issue: `${shop}-etilbudsavis-${catalog.id}`, until: lastDay(catalog.run_till), offers });
    console.log(`${catalog.id}  ${catalog.label}  until ${lastDay(catalog.run_till)}  ${offers.length} of ${catalog.offer_count} offers served`);
  }
  if (skip.size) console.log(`Skipped: ${[...skip].join(", ")}`);

  const split = await splitHeadings(issues.flatMap((i) => i.offers), dryRun);
  if (split.ruled) console.log(`${split.ruled} offers named by the free rule split${dryRun ? " (dry run: the model isn't called)" : " (model gave no answer)"}.`);
  if (split.cost) console.log(`Name split cost: $${split.cost.toFixed(4)}`);

  // Every issue through the shared import rules, then the cheapest listing per row wins.
  const byKey = new Map<string, ScrapedProduct>();
  let deals = 0;
  for (const { offers, issue, until } of issues) {
    const pages = new Map<number, Offer[]>();
    for (const a of offers) {
      const { names, category } = split.names.get(a.id)!;
      const o = toOffer(a, names, category);
      if (o.multi_buy) deals++;
      const page = a.catalog_page ?? 0;
      pages.set(page, [...(pages.get(page) ?? []), o]);
    }
    const data: Extracted = { pdf: issue, pages: [...pages].map(([page, list]) => ({ page, result: { offers: list } })) };
    for (const p of offersToProducts(data, shop, until, [], issue)) {
      const had = byKey.get(p.shopProductId);
      if (!had || effective(p) < effective(had)) byKey.set(p.shopProductId, p);
    }
  }

  // Never overwrite a cheaper row still listed from another issue (e.g. the PDF import).
  const db = adminClient();
  const ours = new Set(issues.map((i) => i.issue));
  const listed = await fetchAll<{ id: number; shop_product_id: string; name: string; source_issue: string | null }>((f, t) =>
    db.from("shop_products").select("id, shop_product_id, name, source_issue").eq("shop_id", shop).gte("listed_until", today).order("id").range(f, t),
  );
  const others = listed.filter((r) => byKey.has(r.shop_product_id) && !ours.has(r.source_issue ?? ""));
  const latest = new Map<number, { price: number; multiBuy: { quantity: number; price: number } | null }>();
  for (let i = 0; i < others.length; i += 200) {
    const ids = others.slice(i, i + 200).map((r) => r.id);
    const { data, error } = await db
      .from("prices")
      .select("shop_product_id, price, multi_buy_quantity, multi_buy_price, observed_at")
      .in("shop_product_id", ids)
      .order("observed_at", { ascending: false });
    if (error) throw error;
    for (const p of data ?? []) {
      if (latest.has(p.shop_product_id)) continue;
      const mb = p.multi_buy_quantity && p.multi_buy_price ? { quantity: p.multi_buy_quantity, price: Number(p.multi_buy_price) } : null;
      latest.set(p.shop_product_id, { price: Number(p.price), multiBuy: mb });
    }
  }
  let kept = 0;
  for (const r of others) {
    const old = latest.get(r.id);
    const mine = byKey.get(r.shop_product_id)!;
    if (old && effective(old) <= effective(mine)) {
      byKey.delete(r.shop_product_id);
      kept++;
      console.log(`  keep ${r.source_issue}: ${r.name} (${effective(old)} <= ${effective(mine)})`);
    } else console.log(`  cheaper here than ${r.source_issue}: ${r.name} (${old ? effective(old) : "?"} -> ${effective(mine)})`);
  }
  const products = [...byKey.values()];

  console.log(
    `\n${products.length} ${shop} products from ${issues.length} issues (${deals} deals); ${kept} left to a cheaper row from another issue.`,
  );
  console.log(`  without content (ranges, pieces): ${products.filter((p) => !p.totalContent).length}`);
  const cats: Record<string, number> = {};
  for (const p of products) cats[p.categories[0] ?? "-"] = (cats[p.categories[0] ?? "-"] ?? 0) + 1;
  console.log(`  categories: ${JSON.stringify(cats)}`);
  const listFile = path.join(RAW_DIR, `${shop}-${today}.products.txt`);
  writeFileSync(
    listFile,
    products
      .sort((a, b) => a.name.localeCompare(b.name, "da"))
      .map(
        (p) =>
          `${p.name.padEnd(60)} ${String(p.price).padStart(8)}  ${p.totalContent ? `${p.totalContent.amount} ${p.totalContent.unit}` : "-"}` +
          `${p.multiBuy ? `  ${p.multiBuy.quantity} for ${p.multiBuy.price}` : ""}  [${p.categories[0] ?? "-"}] ${p.listedUntil}  ${p.source?.issue}`,
      )
      .join("\n"),
  );
  console.log(`  full list: ${listFile}`);
  if (dryRun) return console.log("Dry run - nothing saved.");

  const runId = await startRun(db, shop);
  const summary: RunSummary = { urlsFound: products.length, productsScraped: products.length, productsFailed: 0, priceChanges: 0, warnings: [] };
  try {
    const result = await saveProducts(db, shop, products);
    summary.priceChanges = result.priceChanges;
    summary.warnings.push(...result.warnings);
    await finishRun(db, runId, summary);
    console.log(`Saved: ${result.priceChanges} new price rows (run #${runId}). Next: npm run match:new`);
    // Offers an issue no longer has come off the site (rows that moved to a cheaper issue stay).
    for (const { issue } of issues) await retireDropped(db, shop, issue, products);
  } catch (e) {
    await finishRun(db, runId, summary, String(e));
    throw e;
  }
}

if (path.basename(process.argv[1] ?? "") === "etilbudsavis.ts") {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
