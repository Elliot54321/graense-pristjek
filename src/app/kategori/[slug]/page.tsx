import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIES, categoryBySlug } from "@/catalog/categories";
import { categoryFamilies, getShops } from "@/catalog/data";
import { CategoryRow } from "@/components/category-row";
import { FamilyList } from "@/components/family-list";
import { SearchBox } from "@/components/search-box";

/** The seven category pages are known in advance, so they're prerendered (prices are cached for an hour). */
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/kategori/[slug]">): Promise<Metadata> {
  const category = categoryBySlug((await props.params).slug);
  if (!category) return {};
  return {
    title: `${category.title} – priser ved grænsen`,
    description: `Sammenlign priser på ${category.title.toLowerCase()} i grænsebutikkerne og find den billigste.`,
  };
}

export default function CategoryPage(props: PageProps<"/kategori/[slug]">) {
  // The slug is read inside Suspense, so the page shell (search box) shows instantly.
  return (
    <main>
      <div className="rounded-2xl bg-zinc-950 p-3 sm:p-4 dark:border dark:border-zinc-800 dark:bg-zinc-900">
        <SearchBox query="" />
      </div>
      <Suspense fallback={<CategoryRow />}>
        <Category params={props.params} />
      </Suspense>
    </main>
  );
}

async function Category({ params }: { params: PageProps<"/kategori/[slug]">["params"] }) {
  const category = categoryBySlug((await params).slug);
  if (!category) notFound();
  return (
    <>
      <CategoryRow current={category.slug} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{category.title}</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        De mest købte varer først. Søg for at finde en bestemt vare.
      </p>
      <Suspense fallback={<p className="mt-6 text-zinc-500">Henter priser…</p>}>
        <Families id={category.id} page={`/kategori/${category.slug}`} />
      </Suspense>
    </>
  );
}

async function Families({ id, page }: { id: string; page: string }) {
  const [families, shops] = await Promise.all([categoryFamilies(id), getShops()]);
  if (!families.length) return <p className="mt-6 text-zinc-600 dark:text-zinc-400">Ingen varer i denne kategori lige nu.</p>;
  return <FamilyList families={families} shops={shops} page={page} shown={10} />;
}
