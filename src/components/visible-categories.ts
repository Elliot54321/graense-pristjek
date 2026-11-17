/**
 * The categories worth showing: TOP_CATEGORIES with the empty ones left out (nothing on
 * sale right now), counted by categoryCounts(). Server-side only (it reads the database);
 * the result is plain data, so it can be handed to the header's client menus.
 */
import { TOP_CATEGORIES } from "@/catalog/categories";
import { categoryCounts } from "@/catalog/data";

export interface NavSubcategory {
  id: string;
  slug: string;
  label: string;
}

export interface NavCategory {
  id: string;
  slug: string;
  label: string;
  title: string;
  /** lucide-react icon name and Tailwind colour name from categories.ts; see category-style.ts. */
  icon: string;
  color: string;
  subcategories: NavSubcategory[];
}

export async function visibleCategories(): Promise<NavCategory[]> {
  // If counting fails (database slow during a build), show every category rather than none
  // or a failed page: an empty one just says "Ingen varer i denne kategori lige nu".
  const counts = await categoryCounts().catch((e: unknown) => {
    console.error("Category counts unavailable, showing all categories:", e);
    return null;
  });
  return TOP_CATEGORIES.filter((c) => !counts || (counts[c.id]?.total ?? 0) > 0).map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    title: c.title,
    icon: c.icon,
    color: c.color,
    subcategories: c.subcategories
      .filter((s) => !counts || (counts[c.id]?.subcategories[s.id] ?? 0) > 0)
      .map(({ id, slug, label }) => ({ id, slug, label })),
  }));
}
