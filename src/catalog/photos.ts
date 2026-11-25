/**
 * Which photo stands for a family (2026-11-25). One rule for the result cards (FamilyResult.imageUrl)
 * and the shopping list (/api/compare's `images`), so both show the same picture.
 *
 * Photos only ever come from the scraped shops' own product pages (Poetzsch, BorderShop,
 * ScandiPark: shop_products.image_url, see data.ts). Newsletter listings (Fleggaard, Calle) have
 * none, and Tjek/eTilbudsavis crops are never used on the site (their terms; roadmap 2026-11-19).
 */
import type { Pack } from "./types";

/** The photo of the family's most widely sold pack that has one (null if no pack has a photo). */
export function familyImage(packs: Pack[]): string | null {
  return [...packs].filter((p) => p.imageUrl).sort((a, b) => b.offers.length - a.offers.length)[0]?.imageUrl ?? null;
}
