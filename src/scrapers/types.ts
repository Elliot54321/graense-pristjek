/** Units we normalize every quantity to, so prices can be compared per unit. */
export type BaseUnit = "l" | "kg" | "piece";

export interface Quantity {
  amount: number;
  unit: BaseUnit;
}

/** One product as read from a shop's product page, before matching. */
export interface ScrapedProduct {
  shop: string;
  /** The shop's own product id (from the URL or page). */
  shopProductId: string;
  url: string;
  name: string;
  brand: string | null;
  /** EAN-13 barcode, when the shop exposes it. */
  ean: string | null;
  categories: string[];
  /** Shelf price for one sellable unit (e.g. one case of 24 cans). */
  price: number;
  currency: string;
  /** Shop's own pack description, e.g. "Kasse à 24 x 0,33 liter". */
  packText: string | null;
  /** Number of items in the pack (24 for a case of 24 cans). */
  packCount: number | null;
  /** Size of one item in the pack (0.33 l). */
  unitSize: Quantity | null;
  /** Total content of the sellable unit (7.92 l). */
  totalContent: Quantity | null;
  /** Price per base unit (DKK per liter/kg/piece): price ÷ content, or the shop's own figure when content is unknown. */
  pricePerUnit: number | null;
  /** True when the shop marks the price as an offer. */
  onOffer: boolean;
  /** Normal price when on offer ("Før 99,95"), if the shop shows it. */
  regularPrice: number | null;
  /** Last day the offer price applies (YYYY-MM-DD), if the shop shows it. */
  offerEndsAt: string | null;
  /** Deposit per sellable unit, when the shop charges one; null if none is shown. */
  pfand: number | null;
  scrapedAt: string;
}

export interface Scraper {
  shop: string;
  /** All product page URLs the shop lists (normally from its sitemap). */
  listProductUrls(): Promise<string[]>;
  /** Fetch and parse one product page; null if it isn't a usable product. */
  scrapeProduct(url: string): Promise<ScrapedProduct | null>;
}
