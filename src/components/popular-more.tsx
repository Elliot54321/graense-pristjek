"use client";

import { useEffect, useRef, useState } from "react";
import type { FamilyResult } from "@/catalog/types";
import { PopularCard } from "./popular-card";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

const fetchPage = async (page: number): Promise<FamilyResult[]> => {
  const res = await fetch(`/api/popular?side=${page}`);
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { families: FamilyResult[] }).families;
};

/**
 * "Vis flere varer": shows the next page of popular items each time it's pressed, until
 * the list runs out. The next page is fetched in the background as soon as the previous
 * one is shown, so a press is usually instant instead of waiting for the server.
 */
export function PopularMore({ shopNames }: { shopNames: Record<string, string> }) {
  const [families, setFamilies] = useState<FamilyResult[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  // The page being fetched ahead, by number. Re-used by the press, so nothing loads twice.
  const ahead = useRef<{ page: number; result: Promise<FamilyResult[]> } | null>(null);
  // Blocks a quick double tap from showing the same page twice (state updates aren't instant).
  const busy = useRef(false);

  const prefetch = (n: number) => {
    if (ahead.current?.page !== n) {
      const result = fetchPage(n);
      result.catch(() => {}); // a failed prefetch is retried when the button is pressed
      ahead.current = { page: n, result };
    }
    return ahead.current.result;
  };

  // Start fetching the first extra page right away; the visitor is likely to want it.
  useEffect(() => {
    prefetch(1);
  }, []); // once, on first show

  const loadMore = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    try {
      let next: FamilyResult[];
      try {
        next = await prefetch(page);
      } catch {
        ahead.current = null; // the prefetch failed: try once more now
        next = await prefetch(page);
      }
      // Skip anything already shown (a page can shift slightly when prices update overnight).
      setFamilies((prev) => [...prev, ...next.filter((f) => !prev.some((p) => p.id === f.id))]);
      setPage(page + 1);
      setState(next.length ? "idle" : "done");
      if (next.length) prefetch(page + 1);
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
        <ul className={`mt-3 ${GRID}`}>
          {families.map((f) => (
            <PopularCard key={f.id} family={f} shopName={(id) => shopNames[id] ?? id} />
          ))}
        </ul>
      )}
      {state === "error" && <p className="mt-3 text-sm text-red-700">Kunne ikke hente flere varer. Prøv igen.</p>}
      {state !== "done" && (
        <button
          type="button"
          onClick={loadMore}
          disabled={state === "loading"}
          className="mx-auto mt-4 flex min-h-11 w-full max-w-md items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60"
        >
          {state === "loading" ? "Henter…" : "Vis flere varer"}
        </button>
      )}
    </>
  );
}
