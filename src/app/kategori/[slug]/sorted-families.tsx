"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_SORT, parseSort, type SortId } from "@/catalog/sort";
import type { ResultPage, Shop } from "@/catalog/types";
import { FamilyList } from "@/components/family-list";
import type { ResultSource } from "@/components/family-more";
import { SortSelect } from "@/components/sort-select";

type Props = {
  /** The prerendered first page, in the default order. */
  first: ResultPage;
  shops: Shop[];
  page: string;
  source: ResultSource & { kategori: string };
};

/**
 * A category's results with "Sortér". The page is prerendered in the default order, so it
 * stays static; another order (?sorter=) is read in the browser and its first page fetched
 * from /api/families. Until it arrives the current list stays, with a quiet "Sorterer…".
 */
export function SortedFamilies(props: Props) {
  const sort = parseSort(useSearchParams().get("sorter")) ?? DEFAULT_SORT;
  const [loaded, setLoaded] = useState<{ sort: SortId; page: ResultPage } | null>(null);
  const [failed, setFailed] = useState<SortId | null>(null);

  useEffect(() => {
    if (sort === DEFAULT_SORT) return;
    const controller = new AbortController();
    const params = new URLSearchParams([...Object.entries(props.source).filter((e): e is [string, string] => typeof e[1] === "string"), ["sorter", sort], ["fra", "0"]]);
    fetch(`/api/families?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setLoaded({ sort, page: (await res.json()) as ResultPage });
        setFailed(null);
      })
      .catch(() => !controller.signal.aborted && setFailed(sort));
    return () => controller.abort();
  }, [sort, props.source]);

  // The list for the chosen order, else (still loading or failed) the one already showing.
  const ready = sort === DEFAULT_SORT ? { sort, page: props.first } : loaded?.sort === sort ? loaded : null;
  const busy = !ready && failed !== sort;
  return (
    <Shown
      {...props}
      sort={ready?.sort ?? loaded?.sort ?? DEFAULT_SORT}
      list={ready?.page ?? loaded?.page ?? props.first}
      selected={sort}
      busy={busy}
      failed={failed === sort}
    />
  );
}

/** The default order without reading the address - the prerendered page (and the Suspense fallback). */
export function DefaultFamilies(props: Props) {
  return <Shown {...props} sort={DEFAULT_SORT} list={props.first} selected={DEFAULT_SORT} busy={false} failed={false} />;
}

function Shown({
  shops,
  page,
  source,
  sort,
  list,
  selected,
  busy,
  failed,
}: Props & { sort: SortId; list: ResultPage; selected: SortId; busy: boolean; failed: boolean }) {
  return (
    <>
      <p className="mt-3 text-sm text-zinc-600">
        {selected === DEFAULT_SORT && "De mest købte varer først. "}Søg for at finde en bestemt vare.
      </p>
      <div className="mt-2 flex justify-end">
        <SortSelect value={selected} busy={busy} />
      </div>
      {failed && <p className="mt-2 text-right text-sm text-red-700">Kunne ikke sortere listen. Prøv igen.</p>}
      <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <FamilyList families={list.families} shops={shops} page={page} source={source} sort={sort} next={list.next} />
      </div>
    </>
  );
}
