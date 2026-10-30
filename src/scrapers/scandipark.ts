import * as cheerio from "cheerio";
import { fetchText } from "./http";
import { parseDecimal, quantityFromName, unitPrice } from "./quantity";
import type { Quantity, ScrapedProduct, Scraper } from "./types";

/**
 * Scandinavian Park ("ScandiPark"), Handewitt - the border shop at the A7/E45 exit.
 * Its Danish click & collect shop (JTL-Shop) shows the store's prices in DKK for
 * collection in Handewitt, with EAN and multi-buy tiers ("2 for 64,99 each"). The
 * German webshop at shop.scandinavian-park.com prices some drinks for German delivery
 * (Faxe Kondi 24 cans: ~194 kr. there vs 59,99 kr. here), so it isn't used.
 *
 * Product pages carry no category, so the category pages are walked to find every
 * product and the most specific category it is listed in.
 */
const BASE = "https://clickandcollect.scandipark.dk";

/**
 * Category pages to walk, most specific first: a product keeps the first one it is
 * found under. Top-level pages come last and catch products only listed in brand
 * collections ("Coca-Cola-Tilbud"). Wine is included; matching leaves it out.
 */
const SUB_CATEGORIES = [
  "drikkevarer/oel",
  "drikkevarer/cider",
  "drikkevarer/sodavand",
  "drikkevarer/andre-drikkevarer",
  "Ol",
  "Cider",
  "Sodavand",
  "Energidrik",
  "Vand",
  "Andre-pantfri-drikkevarer",
];
const TOP_CATEGORIES = ["drikkevarer", "pantfri-drikkevarer", "spiritus", "vin", "slik", "foedevarer", "kosmetik", "andre-varer"];

/** Category path (e.g. "drikkevarer/sodavand") each product URL was found under. */
const categoryOf = new Map<string, string>();

/** Product links on one category page; 100 per page via ?af=100. */
async function categoryPage(category: string, page: number) {
  const path = page === 1 ? category : `${category}_s${page}`;
  const $ = cheerio.load(await fetchText(`${BASE}/${path}?af=100`));
  const urls = $(".productbox-title a[href]")
    .map((_, a) => $(a).attr("href") ?? "")
    .get()
    .filter((href) => /^https:\/\/clickandcollect\.scandipark\.dk\/[^/?#]+$/.test(href));
  const hasNext = $(`a[href*="/${category}_s${page + 1}"]`).length > 0;
  return { urls, hasNext };
}

async function listProductUrls(): Promise<string[]> {
  for (const category of [...SUB_CATEGORIES, ...TOP_CATEGORIES]) {
    for (let page = 1; page <= 100; page++) {
      let result: Awaited<ReturnType<typeof categoryPage>>;
      try {
        result = await categoryPage(category, page);
      } catch {
        break; // past the last page
      }
      for (const url of result.urls) if (!categoryOf.has(url)) categoryOf.set(url, category);
      if (!result.urls.length || !result.hasNext) break;
    }
  }
  return [...categoryOf.keys()];
}

/** "24x0,33l dåser" -> 24 x 0,33 l; "4x25g" -> 4 x 25 g; "160g 4er Box" -> 4 x 160 g; "5L Fad" -> 1 x 5 l. */
export function packFromName(name: string): { count: number | null; unitSize: Quantity | null; total: Quantity | null } {
  const unitSize = quantityFromName(name);
  const count =
    Number(name.match(/(?:^|\s)(\d+)\s*[x×]\s*(?=\d|\s)/i)?.[1]) ||
    Number(name.match(/(?:^|\s)(\d+)er[\s-]?(?:pack|box|set|karton|kiste|tray|packung)\b/i)?.[1]) ||
    null;
  if (!unitSize) return { count, unitSize: null, total: null };
  const total = { amount: Math.round((count ?? 1) * unitSize.amount * 1e6) / 1e6, unit: unitSize.unit };
  return { count, unitSize, total };
}

/** Parse a product page. Exported separately so it can be tested on saved HTML. */
export function parseProductPage(html: string, url: string): ScrapedProduct | null {
  const $ = cheerio.load(html);
  // Only the product itself - the page also lists related products with their own prices.
  const offer = $("#product-offer");
  const name = $("h1").first().text().replace(/\s+/g, " ").trim();
  const price = parseDecimal(offer.find('meta[itemprop="price"]').first().attr("content") ?? "");
  const currency = offer.find('[itemprop="priceCurrency"]').first().attr("content") ?? "DKK";
  const sku = offer.find('[itemprop="sku"]').first().text().trim();
  if (!name || price === null || !sku) return null;
  // Old products stay reachable (and in the sitemap) after the shop stops selling them.
  if (/Discontinued/.test(offer.find('[itemprop="availability"]').attr("href") ?? "")) return null;
  if (currency !== "DKK") throw new Error(`Unexpected currency ${currency} on ${url}`);

  // Content from the name; else from the base price ("8,84 DKK / 1 l": price / base).
  const { count, unitSize, total: totalFromName } = packFromName(name);
  let total = totalFromName;
  const spec = offer.find('[itemprop="priceSpecification"]').first();
  const basePrice = parseDecimal(spec.find('meta[itemprop="price"]').attr("content") ?? "");
  const baseText = spec.find('[itemprop="referenceQuantity"]').text();
  const baseUnit = /liter|\bl\b/i.test(baseText) ? "l" : /kg|kilo/i.test(baseText) ? "kg" : null;
  if (!total && basePrice && baseUnit) {
    total = { amount: Math.round((price / basePrice) * 100) / 100, unit: baseUnit };
  }
  const shopUnitPrice = basePrice && baseUnit && total?.unit === baseUnit ? basePrice : null;

  // Multi-buy tiers: "fra 2 | 64,99 DKK" = each costs 64,99 when buying 2 or more.
  // The smallest tier is stored as "2 for 129,98".
  const tier = offer
    .find("tr[class^='bulk-price']")
    .map((_, tr) => {
      const cells = $(tr).find("td");
      return { quantity: Number(cells.eq(0).text().trim()), each: parseDecimal(cells.eq(1).text().replace(/[^\d,.]/g, "")) };
    })
    .get()
    .find((t) => t.quantity > 1 && t.each !== null && t.each < price);
  const multiBuy = tier ? { quantity: tier.quantity, price: Math.round(tier.quantity * tier.each! * 100) / 100 } : null;

  const regular = parseDecimal(offer.find(".instead-of .value, .price-old, del").first().text().replace(/[^\d,.]/g, ""));
  const onOffer = regular !== null && regular > price;
  const brand = offer.find('[itemprop="brand"] [itemprop="name"]').first();

  return {
    shop: "scandipark",
    // "dk-" keeps these apart from the German webshop's ids used before 2026-10-29.
    shopProductId: `dk-${sku}`,
    url,
    name,
    brand: (brand.attr("content") ?? brand.text()).trim() || null,
    ean: offer.find('[itemprop="gtin13"]').first().text().trim() || null,
    categories: [categoryOf.get(url) ?? ""].filter(Boolean),
    price,
    currency: "DKK",
    packText: count && unitSize ? `${count} x ${unitSize.amount} ${unitSize.unit}` : null,
    packCount: count,
    unitSize,
    totalContent: total,
    pricePerUnit: unitPrice(price, total, shopUnitPrice),
    onOffer,
    regularPrice: onOffer ? regular : null,
    offerEndsAt: null,
    // Sold deposit-free with an export declaration ("Export" cans); no deposit is shown.
    pfand: null,
    multiBuy,
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
