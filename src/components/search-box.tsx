import { ArrowRight, Search } from "lucide-react";

/** The pill-shaped search field used in the hero (a plain GET form, works without JavaScript). */
export function SearchBox({ query }: { query: string }) {
  return (
    <form action="/sog" role="search" className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 text-zinc-900 shadow-sm">
      <Search aria-hidden className="h-5 w-5 shrink-0 text-zinc-500" />
      <input
        name="q"
        defaultValue={query}
        placeholder="Søg fx cola, øl, haribo…"
        aria-label="Søg efter en vare"
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-zinc-500"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button
        type="submit"
        aria-label="Søg"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        <ArrowRight aria-hidden className="h-5 w-5" />
      </button>
    </form>
  );
}
