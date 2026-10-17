import * as cheerio from "cheerio";
import { fetchSitemap, fetchText, sitemapLocs } from "./http";
import { PRICE_NUMBER, parseDecimal, parseQuantity, unitPrice } from "./quantity";
import type { ScrapedProduct, Scraper } from "./types";

const BASE = "https://www.poetzsch-padborg.dk";

// Product URLs look like /Harboe-Cola-Sugar-Free/125978 (slug + numeric id).
const PRODUCT_PATH = /^\/[^/]+\/(\d+)\/?$/;

async function listProductUrls(): Promise<string[]> {
  const index = await fetchSitemap(`${BASE}/sitemap.xml`);
  const urls: string[] = [];
  for (const sitemapUrl of sitemapLocs(index)) {
    urls.push(...sitemapLocs(await fetchSitemap(sitemapUrl)));
  }
  return [...new Set(urls.filter((u) => PRODUCT_PATH.test(new URL(u).pathname)))];
}

/** Parse a Poetzsch product page. Exported separately so it can be tested on saved HTML. */
export function parseProductPage(html: string, url: string): ScrapedProduct | null {
  const $ = cheerio.load(html);
  const id = new URL(url).pathname.match(PRODUCT_PATH)?.[1];
  const name = $("h1.wgtl-detail-title").first().text().trim();
  const price = parseDecimal($('meta[itemprop="price"]').first().attr("content") ?? "");
  if (!id || !name || price === null) return null;

  // Spec list: "Indhold" (one item), "Samlet indhold" (whole pack), "Pakke" ("24 × dåser").
  const specs = new Map<string, string>();
  $("dt").each((_, dt) => {
    const value = $(dt).next("dd").text().replace(/\s+/g, " ").trim();
    specs.set($(dt).text().trim(), value);
  });

  const packCount = Number(specs.get("Pakke")?.match(/^(\d+)/)?.[1]) || null;
  const unitSize = parseQuantity(specs.get("Indhold"));
  // The price-unit box ("0.034 kg") is what the shop's own unit price is based on;
  // "Samlet indhold" is rounded to two decimals ("0,03 kg"), so it's only a fallback.
  const totalContent =
    parseQuantity($(".price-unit-content").first().text()) ??
    parseQuantity(specs.get("Samlet indhold")) ??
    unitSize;

  // "Grundpris: 5,68 kr. / liter"; products without content show 0, which means unknown.
  const basePriceText = $(".price-unit-reference-content").first().text();
  const shopUnitPrice =
    parseDecimal(basePriceText.match(new RegExp(`(${PRICE_NUMBER})\\s*kr`))?.[1] ?? "") || null;

  const categories = $('input[name*="[categoryNames]"]')
    .map((_, el) => $(el).attr("value") ?? "")
    .get()
    .filter(Boolean);

  return {
    shop: "poetzsch",
    shopProductId: id,
    url,
    name,
    brand:
      $('input[name$="[manufacturerName]"]').attr("value")?.trim() || specs.get("Mærke") || null,
    ean: $('meta[itemprop="gtin13"]').attr("content")?.trim() || null,
    categories,
    price,
    currency: $('meta[itemprop="priceCurrency"]').attr("content") ?? "DKK",
    packText: $(".wgtl-detail-subtitle").first().text().trim() || null,
    packCount,
    unitSize,
    totalContent,
    pricePerUnit: unitPrice(price, totalContent, shopUnitPrice),
    onOffer: $(".wgtl-detail-badge--tilbud").length > 0,
    regularPrice: null,
    offerEndsAt: null,
    // Poetzsch charges no can deposit with an export declaration (see roadmap).
    pfand: null,
    scrapedAt: new Date().toISOString(),
  };
}

export const poetzsch: Scraper = {
  shop: "poetzsch",
  listProductUrls,
  async scrapeProduct(url) {
    return parseProductPage(await fetchText(url), url);
  },
};
