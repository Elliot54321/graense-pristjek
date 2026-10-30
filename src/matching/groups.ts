/** Comparison categories shared by matching and the coverage report. */

/** The fields of a shop product the rules below need. */
export interface GroupRow {
  shop_id: string;
  categories: string[];
}

/** Comparison categories per shop (wine, toys and BorderShop's "More" are left out). */
export const GROUPS: Record<string, (r: GroupRow) => string | undefined> = {
  poetzsch: (r) => {
    const p = r.categories.join("/");
    if (/^Vand/.test(p)) return "soda";
    if (/^Øl/.test(p)) return "beer";
    if (/^Slik|Chips og snacks/.test(p)) return "candy";
    if (/^Spiritus/.test(p)) return "spirits";
    if (/^Dagligvarer/.test(p)) return "groceries";
    if (/^Husholdning|^Dyrefoder/.test(p)) return "household";
  },
  bordershop: (r) =>
    ({ Beverages: "soda", Beer: "beer", "Candy and Snacks": "candy", Spirits: "spirits", Household: "household" })[r.categories[0]],
  // Rostock is the same BorderShop catalogue.
  "bordershop-rostock": (r) => GROUPS.bordershop(r),
  // Scandinavian Park: category from its Danish click & collect shop (wine and "andre-varer" left out).
  scandipark: (r) => {
    const c = r.categories[0] ?? "";
    if (/^(drikkevarer\/(oel|cider)|Ol|Cider)$/.test(c)) return "beer";
    if (/^(drikkevarer(\/(sodavand|andre-drikkevarer))?|Sodavand|Energidrik|Vand|Andre-pantfri-drikkevarer|pantfri-drikkevarer)$/.test(c)) return "soda";
    if (c === "spiritus") return "spirits";
    if (c === "slik") return "candy";
    if (c === "foedevarer") return "groceries";
    if (c === "kosmetik") return "household";
  },
  // Newsletter products carry the comparison category directly.
  fleggaard: (r) => (["soda", "beer", "candy", "spirits", "groceries", "household"].includes(r.categories[0]) ? r.categories[0] : undefined),
};

/**
 * Same rule as the website's price views: a shop product counts while it was seen
 * in the last 3 days, or while a newsletter says it's on sale (listed_until).
 */
export function isListed(r: { last_seen_at: string | null; listed_until: string | null }, now = new Date()): boolean {
  const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
  if (now.getTime() - seen < 3 * 24 * 3600 * 1000) return true;
  return !!r.listed_until && r.listed_until >= now.toISOString().slice(0, 10);
}
