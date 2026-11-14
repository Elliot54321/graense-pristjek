import { getShops, popularFamilies } from "@/catalog/data";
import { CategoryRow } from "@/components/category-row";
import { PopularGrid } from "@/components/popular-grid";
import { SearchBox } from "@/components/search-box";

/**
 * The front page. It doesn't read the address (search results live on /sog), so Next.js
 * prerenders it - popular items included - stores it on Vercel and rebuilds it in the
 * background when the cached data is an hour old (cacheLife "hours" in catalog/data.ts).
 * Every visitor gets the ready-made page, and search engines see the items.
 */
export default async function Home() {
  const [families, shops] = await Promise.all([popularFamilies(0), getShops()]);
  return (
    <main>
      <section className="rounded-3xl bg-zinc-800 px-5 py-10 text-center text-white sm:px-10 sm:py-16">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">Find det billigste ved grænsen</h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-zinc-300 sm:mt-4 sm:text-lg">
          Sammenlign priser hos Fleggaard, Calle, Poetzsch, Scandinavian Park og BorderShop – og se hvor hele din
          indkøbsliste bliver billigst.
        </p>
        <div className="mx-auto mt-6 max-w-2xl sm:mt-8">
          <SearchBox query="" />
        </div>
      </section>
      <CategoryRow />
      <PopularGrid families={families} shops={shops} />
    </main>
  );
}
