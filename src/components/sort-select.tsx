"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { DEFAULT_SORT, SORTS, type SortId } from "@/catalog/sort";

/**
 * "Sortér" for search and category results: a plain native <select>, so phones show their own
 * picker. The choice lives in the address (?sorter=, left out for the default), so back/forward
 * and shared links keep it; changing it starts the list over from the first page.
 * The navigation runs as a transition, so the current list stays put until the new order is
 * ready, with a quiet "Sorterer…" meanwhile. busy: the page is fetching the order itself
 * (static category pages load a non-default order in the browser).
 */
export function SortSelect({ value, busy = false }: { value: SortId; busy?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Shows the new choice at once, not the old one until the new page arrives.
  const [shown, setShown] = useOptimistic(value);

  const change = (sort: string) => {
    const url = new URL(window.location.href);
    if (sort === DEFAULT_SORT) url.searchParams.delete("sorter");
    else url.searchParams.set("sorter", sort);
    startTransition(() => {
      setShown(sort as SortId);
      router.push(`${url.pathname}${url.search}`, { scroll: false });
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      {(pending || busy) && <span className="text-xs text-zinc-500" aria-live="polite">Sorterer…</span>}
      <span className="text-zinc-600">Sortér</span>
      <select
        value={shown}
        onChange={(e) => change(e.target.value)}
        aria-busy={pending || busy}
        className="min-h-10 max-w-[13rem] cursor-pointer rounded-md border border-zinc-300 bg-white px-2 text-sm font-medium hover:border-emerald-600"
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
