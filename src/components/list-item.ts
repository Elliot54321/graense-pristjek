/** Basket items built from search data; plain functions, usable on the server and in the browser. */
import type { BasketItem, FamilyResult } from "@/catalog/types";
import { pieceWords } from "@/lib/format";

/**
 * The pack that's cheapest per liter/kg/piece, as an amount of its family - what "Billigste på
 * listen" adds. A family with no such price but a pack to list (FamilyResult.listPack: a piece
 * family whose packs aren't all counted) adds that pack as an exact product. null otherwise.
 */
export function cheapestListItem(family: FamilyResult): BasketItem | null {
  const best = family.best;
  if (!best && family.listPack) {
    const p = family.listPack;
    // Same key as the pack's own "Sæt på listen", so both show it as on the list.
    return { key: `p-${p.productId}`, kind: "product", productId: p.productId, label: p.name, quantity: 1, imageUrl: p.imageUrl ?? undefined };
  }
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
    // "40 kapsler" in a piece family (shown on the list and its stepper).
    packLabel: pieceWords(pack.packLabel, pack.pieceLabel) ?? undefined,
    // Which pack this was, so the list can say when a shop is priced with another one.
    productId: pack.productId,
    // Newsletter packs have no photo: fall back to another pack of the family.
    imageUrl: (pack.imageUrl ?? family.packs.find((p) => p.imageUrl)?.imageUrl) || undefined,
  };
}
