import type { Metadata } from "next";
import { TOP_CATEGORIES } from "@/catalog/categories";
import { CategoryView, resolve } from "./category-view";

/** The category pages are known in advance, so they're prerendered (prices are cached for an hour). */
export function generateStaticParams() {
  return TOP_CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/kategori/[slug]">): Promise<Metadata> {
  const found = resolve((await props.params).slug);
  if (!found) return {};
  const { title } = found.category;
  return {
    title: `${title} – priser ved grænsen`,
    description: `Sammenlign priser på ${title.toLowerCase()} i grænsebutikkerne og find den billigste.`,
  };
}

export default function CategoryPage(props: PageProps<"/kategori/[slug]">) {
  return <CategoryView params={props.params} />;
}
