/**
 * Danish guide amounts for alcohol brought home from another EU country, per
 * person aged 18 or over (Toldstyrelsen, "Travelling within the EU", checked
 * 2026-10-30: https://toldst.dk/en-us/individuals/travel/travelling-within-the-eu).
 *
 * They are guide amounts, not hard limits: above them, customs can ask you to show
 * the goods are for your own use (you, your household, private guests); if you
 * can't, Danish duty is due. 16-17-year-olds may only bring beer and wine up to
 * 16.4 %, and nobody under 18 may bring spirits, fortified wine or tobacco.
 *
 * Tobacco (800 cigarettes, 1 kg tobacco) isn't covered - the site has no tobacco.
 */
import type { BasketItem, Pack } from "./types";

export type AlcoholType = "spirits" | "fortified" | "wine" | "beer";

/** Liters per adult. Wine: at most 60 l of the 90 l may be sparkling (not checked here). */
export const GUIDE_LITERS: Record<AlcoholType, number> = { spirits: 10, fortified: 20, wine: 90, beer: 110 };

export const SOURCE_URL = "https://toldst.dk/en-us/individuals/travel/travelling-within-the-eu";

const ALCOHOL_FREE = /\b0[,.]0 ?%|alkoholfri|alkoholfrei|alcohol[- ]?free|\bnon[- ]alcoholic\b/i;
/** Port, sherry, Madeira, vermouth etc. - "fortified wine, 22 % or less". */
const FORTIFIED = /portvin|\bport\b|porto\b|sherry|madeira|marsala|vermouth|vermut|\bmartini\b|hedvin/i;
/** Whisky or rum finished in sherry/port/Madeira casks ("Sherry Cask", "Port Cask Finish") is still spirits. */
const CASK = /\bcask|finish|\bbutt\b|\boak\b|whisk/i;
/**
 * Cider: Toldstyrelsen counts beer-based cider as beer and cider-based wine as
 * wine. Shops rarely say which, so cider counts as wine - the stricter (lower) limit.
 */
const CIDER = /cider|somersby|rekorderlig|mokai|kopparberg/i;

export interface FamilyInfo {
  id: number;
  name: string;
  category: string;
}

/** Which guide amount a product counts towards, from its family category and name. */
export function alcoholType(category: string, name: string): AlcoholType | null {
  if (ALCOHOL_FREE.test(name)) return null;
  if (category === "beer") return CIDER.test(name) ? "wine" : "beer";
  const fortified = FORTIFIED.test(name) && !CASK.test(name);
  if (category === "wine") return fortified ? "fortified" : "wine";
  // Spirits also covers liqueurs and drinks with added alcohol - Toldstyrelsen counts those as spirits.
  if (category === "spirits") return fortified ? "fortified" : "spirits";
  return null;
}

/** Liters of each alcohol type in the basket. Items without a known volume are skipped. */
export function alcoholLiters(items: BasketItem[], packs: Pack[], families: FamilyInfo[]): Partial<Record<AlcoholType, number>> {
  const familyById = new Map(families.map((f) => [f.id, f]));
  const packById = new Map(packs.map((p) => [p.productId, p]));
  const liters: Partial<Record<AlcoholType, number>> = {};
  const add = (type: AlcoholType | null, l: number) => {
    if (type && l > 0) liters[type] = Math.round(((liters[type] ?? 0) + l) * 100) / 100;
  };

  for (const item of items) {
    if (item.kind === "family") {
      const family = familyById.get(item.familyId);
      if (family && item.unit === "l") add(alcoholType(family.category, family.name), item.amount);
    } else {
      const pack = packById.get(item.productId);
      const family = pack?.familyId ? familyById.get(pack.familyId) : undefined;
      if (pack && family && pack.contentUnit === "l" && pack.contentAmount) {
        add(alcoholType(family.category, `${family.name} ${pack.name}`), item.quantity * pack.contentAmount);
      }
    }
  }
  return liters;
}

export interface LimitCheck {
  type: AlcoholType;
  liters: number;
  allowed: number;
  over: boolean;
}

/** Compare the basket's liters with the guide amounts for this many adults (18+). */
export function checkLimits(liters: Partial<Record<AlcoholType, number>>, adults: number): LimitCheck[] {
  return (Object.keys(GUIDE_LITERS) as AlcoholType[])
    .filter((type) => (liters[type] ?? 0) > 0)
    .map((type) => {
      const allowed = GUIDE_LITERS[type] * Math.max(adults, 0);
      return { type, liters: liters[type]!, allowed, over: liters[type]! > allowed };
    });
}
