/**
 * Run a shop scraper and save the results as JSON.
 *
 *   npm run scrape -- poetzsch --limit 20
 *
 * --limit N picks N products spread evenly across the sitemap (handy for testing).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { poetzsch } from "./poetzsch";
import type { ScrapedProduct, Scraper } from "./types";

const SCRAPERS: Record<string, Scraper> = { poetzsch };

function parseArgs(argv: string[]) {
  const shop = argv.find((a) => !a.startsWith("--"));
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null;
  return { shop, limit };
}

function spread<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function main() {
  const { shop, limit } = parseArgs(process.argv.slice(2));
  const scraper = shop ? SCRAPERS[shop] : undefined;
  if (!scraper) {
    console.error(`Usage: npm run scrape -- <${Object.keys(SCRAPERS).join("|")}> [--limit N]`);
    process.exit(1);
  }

  const allUrls = await scraper.listProductUrls();
  const urls = limit ? spread(allUrls, limit) : allUrls;
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

  mkdirSync("data/scrapes", { recursive: true });
  const file = `data/scrapes/${scraper.shop}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ products, failed }, null, 2));

  const missing = (key: keyof ScrapedProduct) => products.filter((p) => p[key] === null).length;
  console.log(`\nSaved ${products.length} products to ${file}`);
  console.log(`  failed: ${failed.length}`);
  console.log(`  missing EAN: ${missing("ean")}, total content: ${missing("totalContent")}, price per unit: ${missing("pricePerUnit")}`);
  console.log(`  on offer: ${products.filter((p) => p.onOffer).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
