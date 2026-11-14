import type { Metadata } from "next";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { getShops, searchFamilies, searchHasMore } from "@/catalog/data";
import { CategoryRow } from "@/components/category-row";
import { FamilyList } from "@/components/family-list";
import { SearchBox } from "@/components/search-box";
import { logSearch } from "@/db/log";

const EXAMPLES = ["cola", "øl", "haribo", "gin", "chips"];

/**
 * Search results: /sog?q=cola. Moved off the front page on 2026-11-14 (/?q= redirects
 * here) so the front page no longer depends on the address and can be prerendered.
 * "cola – priser ved grænsen" as title, so a shared link says what it shows; result
 * pages are kept out of search engines (endless near-duplicates).
 */
export async function generateMetadata(props: PageProps<"/sog">): Promise<Metadata> {
  const raw = (await props.searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 60);
  return {
    title: query ? `${query} – priser ved grænsen` : "Søg",
    description: query ? `Sammenlign priser på ${query} i grænsebutikkerne og find den billigste.` : undefined,
    robots: { index: false, follow: true },
  };
}

export default function SearchPage(props: PageProps<"/sog">) {
  return (
    <main>
      {/* The query comes from the URL, so the search box and results render per request. */}
      <Suspense fallback={<SearchBar query="" />}>
        <Search searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function SearchBar({ query }: { query: string }) {
  return (
    <div className="rounded-2xl bg-zinc-800 p-3 sm:p-4">
      <SearchBox query={query} />
    </div>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/sog">["searchParams"] }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return (
    <>
      <SearchBar query={query} />
      <CategoryRow />
      {query ? (
        <Suspense fallback={<p className="mt-6 text-zinc-500">Søger…</p>}>
          <Results query={query} />
        </Suspense>
      ) : (
        <Examples title="Skriv hvad du leder efter – eller prøv" />
      )}
    </>
  );
}

/** Example searches as tappable chips. */
function Examples({ title }: { title: string }) {
  return (
    <div className="mt-6">
      <p className="text-sm text-zinc-600">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <a
              href={`/sog?q=${encodeURIComponent(e)}`}
              className="flex min-h-10 items-center rounded-full border border-zinc-300 px-4 text-sm hover:bg-zinc-100"
            >
              {e}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Results({ query }: { query: string }) {
  const [families, hasMore, shops] = await Promise.all([searchFamilies(query), searchHasMore(query, 0), getShops()]);
  // Logged after the page is sent, so it never slows the search down - and only for
  // real requests, never while Next.js prerenders the page.
  await connection();
  after(() => logSearch(query, families.length));
  if (!families.length) {
    return (
      <div className="mt-6">
        <p className="font-medium">Ingen varer fundet for “{query}”.</p>
        <p className="mt-1 text-sm text-zinc-600">
          Prøv et kortere ord eller mærket alene, fx “tuborg” i stedet for “tuborg grøn dåse”.
        </p>
        <Examples title="Eller prøv" />
      </div>
    );
  }
  return (
    <>
      <h1 className="mt-6 text-xl font-semibold tracking-tight">Resultater for “{query}”</h1>
      <FamilyList families={families} shops={shops} page={`/sog?q=${encodeURIComponent(query)}`} source={{ q: query }} hasMore={hasMore} />
    </>
  );
}
