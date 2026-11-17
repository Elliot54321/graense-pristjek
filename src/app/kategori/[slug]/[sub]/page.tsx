import type { Metadata } from "next";
import { TOP_CATEGORIES } from "@/catalog/categories";
import { CategoryView, resolve } from "../category-view";

/** Every subcategory page (/kategori/vin/rodvin) is prerendered like the top pages. */
export function generateStaticParams() {
  return TOP_CATEGORIES.flatMap((c) => c.subcategories.map((s) => ({ slug: c.slug, sub: s.slug })));
}

export async function generateMetadata(props: PageProps<"/kategori/[slug]/[sub]">): Promise<Metadata> {
  const { slug, sub } = await props.params;
  const found = resolve(slug, sub);
  if (!found?.sub) return {};
  const label = found.sub.label;
  return {
    title: `${label} – priser ved grænsen`,
    description: `Sammenlign priser på ${label.toLowerCase()} i grænsebutikkerne og find den billigste.`,
  };
}

export default function SubcategoryPage(props: PageProps<"/kategori/[slug]/[sub]">) {
  return <CategoryView params={props.params} />;
}
