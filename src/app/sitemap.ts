import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/catalog/categories";
import { SITE_URL } from "@/lib/site";

/** The pages worth finding in a search engine. Prices change nightly, so the front page is "daily". */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...CATEGORIES.map((c) => ({ url: `${SITE_URL}/kategori/${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    { url: `${SITE_URL}/om`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
