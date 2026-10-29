import * as cheerio from "cheerio";
import { fetchText } from "./http";
import { parseDecimal, quantityFromName, unitPrice } from "./quantity";
import type { Quantity, ScrapedProduct, Scraper } from "./types";

/**
 * Scandinavian Park ("ScandiPark"), Handewitt - the border shop at the A7/E45 exit.
 * Its webshop (JTL-Shop) is German-only, has no sitemap and shows prices in EUR plus
 * German deposit; the store itself sells deposit-free to Danes with an export
 * declaration. So: walk the category pages, read the product microdata, convert
 * EUR to DKK and leave the deposit out.
 */
const BASE = "https://shop.scandinavian-park.com";

/** The krone is pegged to the euro (central rate 7.46038); the till may round differently. */
export const EUR_TO_DKK = 7.46;

const toDkk = (eur: number) => Math.round(eur * EUR_TO_DKK * 100) / 100;

/** Category path (e.g. "getraenke/bier") each product URL was found under. */
const categoryOf = new Map<string, string>();

async function listProductUrls(): Promise<string[]> {
  const home = cheerio.load(await fetchText(`${BASE}/de/`));
  // Sub-categories look like /de/getraenke/bier (two path segments).
  const categories = [
    ...new Set(
      home("a[href]")
        .map((_, a) => home(a).attr("href") ?? "")
        .get()
        .map((href) => href.match(/^https:\/\/shop\.scandinavian-park\.com\/de\/([A-Za-z0-9-]+\/[A-Za-z0-9-]+)$/)?.[1])
        .filter((c): c is string => !!c),
    ),
  ];

  for (const category of categories) {
    for (let page = 1; page <= 50; page++) {
      const url = page === 1 ? `${BASE}/de/${category}` : `${BASE}/de/${category}_s${page}`;
      let $: cheerio.CheerioAPI;
      try {
        $ = cheerio.load(await fetchText(url));
      } catch {
        break; // past the last page
      }
      let added = 0;
      $(".productbox").each((_, box) => {
        const href = $(box).find("a[href]").first().attr("href") ?? "";
        if (!/^https:\/\/shop\.scandinavian-park\.com\/de\/[^/?#]+$/.test(href)) return;
        if (!categoryOf.has(href)) added++;
        // A product listed in several categories keeps the first, most specific one found.
        if (!categoryOf.has(href)) categoryOf.set(href, category);
      });
      const hasNext = $(`a[href$="/de/${category}_s${page + 1}"]`).length > 0;
      if (!added || !hasNext) break;
    }
  }
  return [...categoryOf.keys()];
}

/** "24x ... 0,5 L" -> 24 x 0,5 l; "160g 4er Box" -> 4 x 160 g; "5L Party Fass" -> 1 x 5 l. */
export function packFromName(name: string): { count: number | null; unitSize: Quantity | null; total: Quantity | null } {
  const unitSize = quantityFromName(name);
  const count =
    Number(name.match(/(?:^|\s)(\d+)\s*[x×]\s/i)?.[1]) ||
    Number(name.match(/(?:^|\s)(\d+)er[\s-]?(?:pack|box|set|karton|kiste|tray|packung)\b/i)?.[1]) ||
    null;
  if (!unitSize) return { count, unitSize: null, total: null };
  const total = { amount: Math.round((count ?? 1) * unitSize.amount * 1e6) / 1e6, unit: unitSize.unit };
  return { count, unitSize, total };
}

/** Parse a product page. Exported separately so it can be tested on saved HTML. */
export function parseProductPage(html: string, url: string): ScrapedProduct | null {
  const $ = cheerio.load(html);
  const name = $("h1").first().text().replace(/\s+/g, " ").trim();
  const priceEur = parseDecimal($('meta[itemprop="price"]').first().attr("content") ?? "");
  const id = $('[itemprop="sku"]').first().text().trim() || url.split("/").pop()!;
  if (!name || priceEur === null) return null;

  // Content from the name; else from the base price ("2,80 EUR / 1 Liter": price / base).
  const { count, unitSize, total: totalFromName } = packFromName(name);
  let total = totalFromName;
  const baseEur = parseDecimal($('[itemprop="priceSpecification"] meta[itemprop="price"]').attr("content") ?? "");
  const baseText = $('[itemprop="priceSpecification"] [itemprop="referenceQuantity"]').text();
  const baseUnit = /liter|\bl\b/i.test(baseText) ? "l" : /kg|kilo/i.test(baseText) ? "kg" : null;
  if (!total && baseEur && baseUnit) {
    total = { amount: Math.round((priceEur / baseEur) * 100) / 100, unit: baseUnit };
  }
  const shopUnitPrice = baseEur && baseUnit && total?.unit === baseUnit ? toDkk(baseEur) : null;
  const price = toDkk(priceEur);
  const offerRegular = parseDecimal($(".old-price, .instead-of .value, del").first().text().replace(/[^\d,.]/g, ""));

  return {
    shop: "scandipark",
    shopProductId: id,
    url,
    name,
    brand: $('[itemprop="brand"] [itemprop="name"]').first().text().trim() || $('[itemprop="brand"] a').first().text().trim() || null,
    ean: $('[itemprop="gtin13"]').first().text().trim() || null,
    categories: [categoryOf.get(url) ?? ""].filter(Boolean),
    price,
    currency: "DKK",
    packText: count && unitSize ? `${count} x ${unitSize.amount} ${unitSize.unit}` : null,
    packCount: count,
    unitSize,
    totalContent: total,
    pricePerUnit: unitPrice(price, total, shopUnitPrice),
    onOffer: offerRegular !== null && offerRegular > priceEur,
    regularPrice: offerRegular !== null && offerRegular > priceEur ? toDkk(offerRegular) : null,
    offerEndsAt: null,
    // German deposit ("zzgl. 6,00 EUR Pfand") isn't paid by Danes with an export declaration.
    pfand: null,
    scrapedAt: new Date().toISOString(),
  };
}

export const scandipark: Scraper = {
  shop: "scandipark",
  listProductUrls,
  async scrapeProduct(url) {
    return parseProductPage(await fetchText(url), url);
  },
};
