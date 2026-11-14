import type { Metadata } from "next";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { getShops, popularFamilies, searchFamilies } from "@/catalog/data";
import { CategoryRow } from "@/components/category-row";
import { FamilyList } from "@/components/family-list";
import { PopularGrid } from "@/components/popular-grid";
import { SearchBox } from "@/components/search-box";
import { logSearch } from "@/db/log";

const EXAMPLES = ["cola", "øl", "haribo", "gin", "chips"];

/**
 * "cola – priser ved grænsen" for a search, so a shared link says what it shows.
 * Search result pages are kept out of search engines (endless near-duplicates).
 */
export async function generateMetadata(props: PageProps<"/">): Promise<Metadata> {
  const raw = (await props.searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 60);
  if (!query) return {};
  return {
    title: `${query} – priser ved grænsen`,
    description: `Sammenlign priser på ${query} i grænsebutikkerne og find den billigste.`,
    robots: { index: false, follow: true },
  };
}

export default function Home(props: PageProps<"/">) {
  return (
    <main>
      {/* The query comes from the URL, so the hero and results render per request. */}
      <Suspense fallback={<Hero query="" />}>
        <Search searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * The big search box. Without a query it's the front page's welcome; with one it
 * shrinks to just the search field so the results start high on a phone.
 */
function Hero({ query }: { query: string }) {
  if (query) {
    return (
      <div className="rounded-2xl bg-zinc-800 p-3 sm:p-4 dark:border dark:border-zinc-800 dark:bg-zinc-900">
        <SearchBox query={query} />
      </div>
    );
  }
  return (
    <section className="rounded-3xl bg-zinc-800 px-5 py-10 text-center text-white sm:px-10 sm:py-16 dark:border dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">Find det billigste ved grænsen</h1>
      <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-zinc-300 sm:mt-4 sm:text-lg">
        Sammenlign priser hos Fleggaard, Calle, Poetzsch, Scandinavian Park og BorderShop – og se hvor hele din
        indkøbsliste bliver billigst.
      </p>
      <div className="mx-auto mt-6 max-w-2xl sm:mt-8">
        <SearchBox query="" />
      </div>
    </section>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return (
    <>
      <Hero query={query} />
      <CategoryRow />
      {query ? (
        <Suspense fallback={<p className="mt-6 text-zinc-500">Søger…</p>}>
          <Results query={query} />
        </Suspense>
      ) : (
        <Suspense fallback={<p className="mt-8 text-zinc-500">Henter populære varer…</p>}>
          <Popular />
        </Suspense>
      )}
    </>
  );
}

/** Example searches as tappable chips. */
function Examples({ title }: { title: string }) {
  return (
    <div className="mt-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <a
              href={`/?q=${encodeURIComponent(e)}`}
              className="flex min-h-10 items-center rounded-full border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {e}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Popular() {
  const [families, shops] = await Promise.all([popularFamilies(), getShops()]);
  if (!families.length) return <Examples title="Prøv f.eks." />;
  return <PopularGrid families={families} shops={shops} />;
}

async function Results({ query }: { query: string }) {
  const [families, shops] = await Promise.all([searchFamilies(query), getShops()]);
  // Logged after the page is sent, so it never slows the search down - and only for
  // real requests, never while Next.js prerenders the page.
  await connection();
  after(() => logSearch(query, families.length));
  if (!families.length) {
    return (
      <div className="mt-6">
        <p className="font-medium">Ingen varer fundet for “{query}”.</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Prøv et kortere ord eller mærket alene, fx “tuborg” i stedet for “tuborg grøn dåse”.
        </p>
        <Examples title="Eller prøv" />
      </div>
    );
  }
  return (
    <>
      <h1 className="mt-6 text-xl font-semibold tracking-tight">Resultater for “{query}”</h1>
      <FamilyList families={families} shops={shops} page={`/?q=${encodeURIComponent(query)}`} />
    </>
  );
}
