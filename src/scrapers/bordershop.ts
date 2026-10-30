import * as cheerio from "cheerio";
import { fetchSitemap, fetchText, sitemapLocs } from "./http";
import { PRICE_NUMBER, parseDecimal, parseQuantity, quantityFromName, unitPrice } from "./quantity";
import type { ScrapedProduct, Scraper } from "./types";

const BASE = "https://www.bordershop.com";

// Product URLs look like /da/puttgarden/harboe/harboe-exotic-24x0-33l-daase/p/000000000001769352/
const PRODUCT_PATH = /^\/da\/[^/]+\/.+\/p\/(\d+)\/?$/;

/**
 * BorderShop has two stores with one catalogue: Puttgarden (Rødby-Puttgarden ferry)
 * and Rostock (Gedser-Rostock ferry). The store is the first path segment
 * (/da/puttgarden/... or /da/rostock/...); regular prices are the same, but offers
 * differ per store. The sitemap only lists Puttgarden URLs.
 */
const STORES = { bordershop: "puttgarden", "bordershop-rostock": "rostock" } as const;
type ShopId = keyof typeof STORES;

/** Less than 10 ml / 10 g in the order card is a data error on BorderShop's side. */
const MIN_PLAUSIBLE_CONTENT = 0.01;

async function listProductUrls(): Promise<string[]> {
  const index = await fetchSitemap(`${BASE}/en/global/sitemap.xml`);
  // The index has one set of product sitemaps per language; we want the Danish (DKK) ones.
  const productSitemaps = sitemapLocs(index).filter((u) => u.includes("/Product-da-DKK-"));
  const urls: string[] = [];
  for (const sitemapUrl of productSitemaps) {
    urls.push(...sitemapLocs(await fetchSitemap(sitemapUrl)));
  }
  return [...new Set(urls.filter((u) => PRODUCT_PATH.test(new URL(u).pathname)))];
}

/** Same product page, another store: /da/puttgarden/... -> /da/rostock/... */
const forStore = (url: string, store: string) => url.replace(/\/da\/[^/]+\//, `/da/${store}/`);

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  category?: string;
  brand?: { name?: string };
  offers?: { price?: string; priceCurrency?: string; gtin13?: string; priceValidUntil?: string | null }[];
}

function readJsonLd($: cheerio.CheerioAPI): JsonLdProduct | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).text());
      if (data["@type"] === "Product") return data;
    } catch {
      // Ignore malformed blocks; other blocks may still hold the product.
    }
  }
  return null;
}

/** "24x0,33L" / "24 x 0,33 l" in the product name -> pack count and item size. */
function packFromName(name: string) {
  const m = name.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?\s*(?:l|cl|ml|kg|g)\b)/i);
  return m ? { packCount: Number(m[1]), unitSize: parseQuantity(m[2]) } : null;
}

/** Parse a BorderShop product page. Exported separately so it can be tested on saved HTML. */
export function parseProductPage(html: string, url: string, shop: ShopId = "bordershop"): ScrapedProduct | null {
  const $ = cheerio.load(html);
  const id = new URL(url).pathname.match(PRODUCT_PATH)?.[1];
  const ld = readJsonLd($);
  const offer = ld?.offers?.[0];
  const price = parseDecimal(offer?.price ?? "");
  // JSON-LD names are English ("... 24x0.33L can"); the page heading is Danish.
  const name = $("h1.c-order-card__headline").first().text().trim() || ld?.name?.trim();
  if (!id || !name || price === null) return null;

  // Order card: "<p>7,92 l.</p>", then "(6,31 DKK / 1 l.)" and, on offers, "Før 99,95 DKK".
  const card = $("#product-order-card");
  const pack = packFromName(name);
  // The card sometimes shows nonsense like "0,001 l." for a 0,75 l bottle; the
  // name ("..., 0,75 L" or "24x0,33L") is right in those cases.
  const cardContent = parseQuantity(card.children("p").first().text());
  const nameContent = pack?.unitSize
    ? {
        amount: Math.round(pack.packCount * pack.unitSize.amount * 1e6) / 1e6,
        unit: pack.unitSize.unit,
      }
    : quantityFromName(name);
  const totalContent =
    cardContent && (cardContent.unit === "piece" || cardContent.amount >= MIN_PLAUSIBLE_CONTENT)
      ? cardContent
      : (nameContent ?? cardContent);

  // The reference can be per 1 l / 1 kg or per e.g. 100 g, so convert to per base unit.
  const reference = card.find(".c-price-box__reference").first().text();
  const refMatch = reference.match(new RegExp(`(${PRICE_NUMBER})\\s*DKK\\s*/\\s*(.+?)\\)`));
  const refQuantity = parseQuantity(refMatch?.[2]);
  const refPrice = parseDecimal(refMatch?.[1] ?? "");
  const shopUnitPrice =
    refPrice && refQuantity ? Math.round((refPrice / refQuantity.amount) * 100) / 100 : null;

  const onOffer = card.find(".c-price--special").length > 0;
  const regularPrice = onOffer
    ? parseDecimal(card.find(".c-price-box__info s").first().text().replace(/DKK/, ""))
    : null;

  return {
    shop,
    shopProductId: id.replace(/^0+/, ""),
    url,
    name,
    brand: ld?.brand?.name?.trim() || null,
    ean: offer?.gtin13?.trim() || null,
    categories: ld?.category ? [ld.category] : [],
    price,
    currency: offer?.priceCurrency ?? "DKK",
    packText: null,
    packCount: pack?.packCount ?? null,
    unitSize: pack?.unitSize ?? null,
    totalContent,
    pricePerUnit: unitPrice(price, totalContent, shopUnitPrice),
    onOffer,
    regularPrice,
    offerEndsAt: onOffer ? (offer?.priceValidUntil ?? null) : null,
    // BorderShop shows no can deposit; export cans are deposit-free (see roadmap).
    pfand: null,
    scrapedAt: new Date().toISOString(),
  };
}

function storeScraper(shop: ShopId): Scraper {
  return {
    shop,
    async listProductUrls() {
      return (await listProductUrls()).map((u) => forStore(u, STORES[shop]));
    },
    async scrapeProduct(url) {
      return parseProductPage(await fetchText(url), url, shop);
    },
  };
}

export const bordershop = storeScraper("bordershop");
export const bordershopRostock = storeScraper("bordershop-rostock");
