/** Basket items built from search data; plain functions, usable on the server and in the browser. */
import type { BasketItem, FamilyResult } from "@/catalog/types";

/**
 * The pack that's cheapest per liter/kg, as an amount of its family - what "Billigste på listen"
 * adds. null when the family has no price or the pack has no content to compare by.
 */
export function cheapestListItem(family: FamilyResult): BasketItem | null {
  const best = family.best;
  const pack = best ? family.packs.find((p) => p.name === best.productName) : undefined;
  if (!best || !pack?.contentAmount) return null;
  return {
    key: `f-${family.id}`,
    kind: "family",
    familyId: family.id,
    label: family.name,
    amount: pack.contentAmount,
    step: pack.contentAmount,
    unit: best.unit,
    packLabel: pack.packLabel ?? undefined,
    // Newsletter packs have no photo: fall back to another pack of the family.
    imageUrl: (pack.imageUrl ?? family.packs.find((p) => p.imageUrl)?.imageUrl) || undefined,
  };
}
