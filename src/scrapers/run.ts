/**
 * Run a shop scraper, save the results as JSON and, with --save, to Supabase.
 *
 *   npm run scrape -- poetzsch --limit 20
 *   npm run scrape -- poetzsch --limit 20 --save
 *
 * --limit N picks N products spread evenly across the sitemap (handy for testing).
 * --save    writes products and changed prices to the database and logs the run
 *           in scrape_runs, with warnings for suspicious results.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bordershop } from "./bordershop";
import { poetzsch } from "./poetzsch";
import { adminClient, finishRun, saveProducts, startRun, type RunSummary } from "./save";
import type { ScrapedProduct, Scraper } from "./types";

const SCRAPERS: Record<string, Scraper> = { poetzsch, bordershop };

/** More failed pages than this (as a fraction) marks the run as a warning. */
const MAX_FAILURE_RATE = 0.1;

function parseArgs(argv: string[]) {
  const shop = argv.find((a) => !a.startsWith("--"));
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null;
  return { shop, limit, save: argv.includes("--save") };
}

function spread<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function scrape(scraper: Scraper, limit: number | null, summary: RunSummary) {
  const allUrls = await scraper.listProductUrls();
  const urls = limit ? spread(allUrls, limit) : allUrls;
  summary.urlsFound = allUrls.length;
  console.log(`${scraper.shop}: ${allUrls.length} product URLs, scraping ${urls.length}`);

  const products: ScrapedProduct[] = [];
  const failed: { url: string; error: string }[] = [];
  for (const [i, url] of urls.entries()) {
    try {
      const product = await scraper.scrapeProduct(url);
      if (product) products.push(product);
      else failed.push({ url, error: "not a product page" });
    } catch (e) {
      failed.push({ url, error: String(e) });
    }
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${urls.length}`);
  }
  summary.productsScraped = products.length;
  summary.productsFailed = failed.length;

  mkdirSync("data/scrapes", { recursive: true });
  const file = `data/scrapes/${scraper.shop}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ products, failed }, null, 2));

  const missing = (key: keyof ScrapedProduct) => products.filter((p) => p[key] === null).length;
  console.log(`\nSaved ${products.length} products to ${file}`);
  console.log(`  failed: ${failed.length}`);
  console.log(`  missing EAN: ${missing("ean")}, total content: ${missing("totalContent")}, price per unit: ${missing("pricePerUnit")}`);
  console.log(`  on offer: ${products.filter((p) => p.onOffer).length}`);

  if (urls.length && failed.length / urls.length > MAX_FAILURE_RATE) {
    summary.warnings.push(`${failed.length} of ${urls.length} product pages failed`);
  }
  return products;
}

async function main() {
  const { shop, limit, save } = parseArgs(process.argv.slice(2));
  const scraper = shop ? SCRAPERS[shop] : undefined;
  if (!scraper) {
    console.error(`Usage: npm run scrape -- <${Object.keys(SCRAPERS).join("|")}> [--limit N] [--save]`);
    process.exit(1);
  }

  const summary: RunSummary = {
    urlsFound: 0,
    productsScraped: 0,
    productsFailed: 0,
    priceChanges: 0,
    warnings: [],
  };
  let db: SupabaseClient | null = null;
  let runId: number | null = null;
  if (save) {
    db = adminClient();
    runId = await startRun(db, scraper.shop);
  }

  try {
    const products = await scrape(scraper, limit, summary);
    // Zero products almost always means the shop changed its site or blocked us.
    if (products.length === 0) throw new Error("Scraper returned zero products");

    if (db && runId !== null) {
      const result = await saveProducts(db, scraper.shop, products);
      summary.priceChanges = result.priceChanges;
      summary.warnings.push(...result.warnings);
      await finishRun(db, runId, summary);
      console.log(`  database: ${result.priceChanges} new price rows, run #${runId}`);
    }
    for (const w of summary.warnings) console.warn(`  WARNING: ${w}`);
  } catch (e) {
    if (db && runId !== null) await finishRun(db, runId, summary, String(e));
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
