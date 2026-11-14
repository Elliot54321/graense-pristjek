"use client";

import { useEffect, useRef, useState } from "react";
import type { FamilyResult, ResultPage, Shop } from "@/catalog/types";
import { FamilyCard, RESULT_GRID } from "./family-list";

/** Where the next pages come from: a search or a category. */
export type ResultSource = { q: string } | { kategori: string };

/**
 * "Vis flere resultater": shows the next page of search or category results each time
 * it's pressed, until the list runs out. Pages come from /api/families (CDN-cached), and
 * the next page is fetched in the background as soon as the previous one shows - so a
 * press is usually instant. Hidden when the first page already held everything.
 */
export function FamilyMore({ source, shops, page: reportPage, next: firstNext }: {
  source: ResultSource;
  shops: Shop[];
  /** Where "Fejl?" returns to. */
  page: string;
  /** Where the second page starts; null when the first page held everything. */
  next: number | null;
}) {
  const [families, setFamilies] = useState<FamilyResult[]>([]);
  const [next, setNext] = useState(firstNext);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">(firstNext === null ? "done" : "idle");
  // The page being fetched ahead, by where it starts. Re-used by the press, so nothing loads twice.
  const ahead = useRef<{ from: number; result: Promise<ResultPage> } | null>(null);
  const busy = useRef(false);
  const shopById = new Map(shops.map((s) => [s.id, s]));

  const prefetch = (from: number) => {
    if (ahead.current?.from !== from) {
      const params = new URLSearchParams({ ...source, fra: String(from) });
      const result = fetch(`/api/families?${params}`).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as ResultPage;
      });
      result.catch(() => {}); // a failed prefetch is retried when the button is pressed
      ahead.current = { from, result };
    }
    return ahead.current.result;
  };

  // Fetch the next page right away when there may be more; the visitor is likely to want it.
  useEffect(() => {
    if (firstNext !== null) prefetch(firstNext);
    // Once, on first show: FamilyList keys this component by search/category, so a new one remounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (busy.current || next === null) return;
    busy.current = true;
    setState("loading");
    try {
      let got: ResultPage;
      try {
        got = await prefetch(next);
      } catch {
        ahead.current = null; // the prefetch failed: try once more now
        got = await prefetch(next);
      }
      setFamilies((prev) => [...prev, ...got.families.filter((f) => !prev.some((p) => p.id === f.id))]);
      setNext(got.next);
      setState(got.next === null ? "done" : "idle");
      if (got.next !== null) prefetch(got.next);
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
