/**
 * Which review items matter most: a wrong match on something people buy and search
 * for gives a wrong "cheapest" answer far more often than one on an obscure wine.
 */
import { COMMON_ITEMS } from "@/matching/common-items";

const CATEGORY_WEIGHT: Record<string, number> = { soda: 30, beer: 30, spirits: 20, candy: 20, wine: 10, groceries: 5, household: 5 };

export interface Priority {
  score: number;
  /** Short Danish reasons shown on the card, e.g. "Fælles vare: Pepsi Max 24x0,33". */
  tags: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function priority(
  names: string[],
  category: string | null,
  shopCount: number,
  listed: boolean,
  searches: Map<string, number>,
): Priority {
  const tags: string[] = [];
  let score = 0;

  const common = COMMON_ITEMS.find((item) => names.some((n) => item.include.test(n) && !item.exclude?.test(n)));
  if (common) {
    score += common.bestseller ? 150 : 100;
    // The list's pack size ("24x0,33", "1 l") would be misleading on another pack of the same item.
    const item = common.label.replace(/\s+(\d+x[\d,.]+|\d+([,.]\d+)?\s*(l|kg|g))$/i, "");
    tags.push(`${common.bestseller ? "Bestseller" : "Fælles vare"}: ${item}`);
  }

  score += CATEGORY_WEIGHT[category ?? ""] ?? 0;

  // Searches on the site whose words all appear in one of the names.
  const text = names.map(norm);
  let searched = 0;
  for (const [query, count] of searches) {
    const words = query.split(" ").filter((w) => w.length >= 3);
    if (words.length && text.some((t) => words.every((w) => t.includes(w)))) searched += count;
  }
  if (searched) {
    score += Math.min(searched * 2, 60);
    tags.push(`Søgt ${searched}×`);
  }

  score += Math.min(shopCount, 6) * 5;
  if (!listed) {
    score -= 1000;
    tags.push("Ikke til salg lige nu");
  }
  return { score, tags };
}
