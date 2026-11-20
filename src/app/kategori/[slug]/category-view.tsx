import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { categoryBySlug, subcategoryBySlug } from "@/catalog/categories";
import { categoryFamilies, getShops } from "@/catalog/data";
import { CategoryRow } from "@/components/category-row";
import { SearchBox } from "@/components/search-box";
import { visibleCategories } from "@/components/visible-categories";
import { DefaultFamilies, SortedFamilies } from "./sorted-families";
import { Chips, SubcategoryChips } from "./subcategory-chips";

/**
 * A top-category page (/kategori/vin) or one of its subcategories (/kategori/vin/rodvin).
 * Both show chips for the subcategories at the top; families without a subcategory
 * ("Øvrige") appear only on the top page.
 */
export function CategoryView({ params }: { params: Promise<{ slug: string; sub?: string }> }) {
  // The slugs are read inside Suspense, so the page shell (search box) shows instantly.
  return (
    <main>
      <div className="rounded-2xl bg-zinc-800 p-3 sm:p-4">
        <SearchBox query="" />
      </div>
      <Suspense fallback={<div className="mt-6 h-20 sm:mt-8" />}>
        <Category params={params} />
      </Suspense>
    </main>
  );
}

/** The category and subcategory for a URL, or a 404. */
export function resolve(slug: string, subSlug?: string) {
  const category = categoryBySlug(slug);
  const sub = category && subSlug !== undefined ? subcategoryBySlug(category, subSlug) : undefined;
  if (!category || (subSlug !== undefined && !sub)) return null;
  return { category, sub };
}

async function Category({ params }: { params: Promise<{ slug: string; sub?: string }> }) {
  const { slug, sub: subSlug } = await params;
  const found = resolve(slug, subSlug);
  if (!found) notFound();
  const { category, sub } = found;
  const visibleSubs = (await visibleCategories()).find((c) => c.id === category.id)?.subcategories ?? [];
  const page = `/kategori/${category.slug}${sub ? `/${sub.slug}` : ""}`;
  const chips = { categorySlug: category.slug, categoryLabel: category.label, subs: visibleSubs, current: sub?.slug ?? "" };
  return (
    <>
      <CategoryRow current={category.slug} />
      {sub && (
        <p className="mt-8 text-sm">
          <Link href={`/kategori/${category.slug}`} className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900">
            {category.label}
          </Link>
          <span className="text-zinc-400"> › </span>
          <span className="text-zinc-600">{sub.label}</span>
        </p>
      )}
      <h1 className={`${sub ? "mt-1" : "mt-8"} text-2xl font-semibold tracking-tight`}>{sub ? sub.label : category.title}</h1>
      {visibleSubs.length > 0 && (
        <Suspense fallback={<Chips {...chips} />}>
          <SubcategoryChips {...chips} />
        </Suspense>
      )}
      <Suspense fallback={<p className="mt-8 text-zinc-500">Henter priser…</p>}>
        <Families categoryId={category.id} slug={category.slug} subId={sub?.id} subSlug={sub?.slug} page={page} />
      </Suspense>
    </>
  );
}

async function Families({ categoryId, slug, subId, subSlug, page }: { categoryId: string; slug: string; subId?: string; subSlug?: string; page: string }) {
  const [first, shops] = await Promise.all([categoryFamilies(categoryId, 0, subId), getShops()]);
  if (!first.families.length) return <p className="mt-6 text-zinc-600">Ingen varer i denne kategori lige nu.</p>;
  const props = { first, shops, page, source: subSlug ? { kategori: slug, under: subSlug } : { kategori: slug } };
  // The order (?sorter=) is read in the browser, so the page itself stays prerendered: the
  // fallback is the default order, which is what the static HTML shows.
  return (
    <Suspense fallback={<DefaultFamilies {...props} />}>
      <SortedFamilies {...props} />
    </Suspense>
  );
}
