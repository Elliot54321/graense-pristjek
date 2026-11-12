/**
 * The category tiles on the front page. `id` is `product_families.category`
 * (set by matching, see src/matching/groups.ts); `slug` is the Danish URL
 * (/kategori/ol). Ordered by what border shoppers buy most.
 */
export const CATEGORIES = [
  { slug: "ol", id: "beer", label: "Øl", title: "Øl" },
  { slug: "sodavand", id: "soda", label: "Sodavand", title: "Sodavand og vand" },
  { slug: "vin", id: "wine", label: "Vin", title: "Vin" },
  { slug: "spiritus", id: "spirits", label: "Spiritus", title: "Spiritus og likør" },
  { slug: "slik", id: "candy", label: "Slik", title: "Slik, chips og snacks" },
  { slug: "dagligvarer", id: "groceries", label: "Dagligvarer", title: "Dagligvarer" },
  { slug: "husholdning", id: "household", label: "Husholdning", title: "Husholdning og pleje" },
] as const;

export type Category = (typeof CATEGORIES)[number];

export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
