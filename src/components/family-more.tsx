"use client";

import { useEffect, useRef, useState } from "react";
import type { FamilyResult, Shop } from "@/catalog/types";
import { FamilyCard, RESULT_GRID } from "./family-list";

type Page = { families: FamilyResult[]; more: boolean };

/** Where the next pages come from: a search or a category. */
export type ResultSource = { q: string } | { kategori: string };

/**
 * "Vis flere resultater": shows the next page of search or category results each time
 * it's pressed, until the list runs out. Pages come from /api/families (CDN-cached), and
 * the next page is fetched in the background as soon as the previous one shows - so a
 * press is usually instant. Hidden when the first page already held everything.
 */
export function FamilyMore({ source, shops, page: reportPage, hasMore }: {
  source: ResultSource;
  shops: Shop[];
  /** Where "Fejl?" returns to. */
  page: string;
  /** Results exist after the first page. */
  hasMore: boolean;
}) {
  const [families, setFamilies] = useState<FamilyResult[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">(hasMore ? "idle" : "done");
  const ahead = useRef<{ page: number; result: Promise<Page> } | null>(null);
  const busy = useRef(false);
  const shopById = new Map(shops.map((s) => [s.id, s]));

  const prefetch = (n: number) => {
    if (ahead.current?.page !== n) {
      const params = new URLSearchParams({ ...source, side: String(n) });
      const result = fetch(`/api/families?${params}`).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as Page;
      });
      result.catch(() => {}); // a failed prefetch is retried when the button is pressed
      ahead.current = { page: n, result };
    }
    return ahead.current.result;
  };

  // Fetch the next page right away when there may be more; the visitor is likely to want it.
  useEffect(() => {
    if (hasMore) prefetch(1);
    // Once, on first show: FamilyList keys this component by search/category, so a new one remounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    try {
      let next: Page;
      try {
        next = await prefetch(page);
      } catch {
        ahead.current = null; // the prefetch failed: try once more now
        next = await prefetch(page);
      }
      setFamilies((prev) => [...prev, ...next.families.filter((f) => !prev.some((p) => p.id === f.id))]);
      setPage(page + 1);
      setState(next.more ? "idle" : "done");
      if (next.more) prefetch(page + 1);
    } catch {
      ahead.current = null;
      setState("error");
    } finally {
      busy.current = false;
    }
  };

  return (
    <>
      {families.length > 0 && (
        <ul className={`mt-4 ${RESULT_GRID}`}>
          {families.map((f) => (
            <FamilyCard key={f.id} family={f} shops={shopById} page={reportPage} />
          ))}
        </ul>
      )}
      {state === "error" && <p className="mt-3 text-sm text-red-700">Kunne ikke hente flere resultater. Prøv igen.</p>}
      {state !== "done" && (
        <button
          type="button"
          onClick={loadMore}
          disabled={state === "loading"}
          className="mx-auto mt-4 flex min-h-11 w-full max-w-md items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60"
        >
          {state === "loading" ? "Henter…" : "Vis flere resultater"}
        </button>
      )}
    </>
  );
}
