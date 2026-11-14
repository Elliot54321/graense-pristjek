"use client";

import { useRef, useState } from "react";
import type { FamilyResult } from "@/catalog/types";
import { PopularCard } from "./popular-card";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

/**
 * "Vis flere varer": loads the next page of popular items each time it's pressed and
 * adds them under the first ones, until the list runs out.
 */
export function PopularMore({ shopNames }: { shopNames: Record<string, string> }) {
  const [families, setFamilies] = useState<FamilyResult[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  // Blocks a quick double tap from loading the same page twice (state updates aren't instant).
  const busy = useRef(false);

  const loadMore = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    try {
      const res = await fetch(`/api/popular?side=${page}`);
      if (!res.ok) throw new Error(String(res.status));
      const { families: next } = (await res.json()) as { families: FamilyResult[] };
      // Skip anything already shown (a page can shift slightly when prices update overnight).
      setFamilies((prev) => [...prev, ...next.filter((f) => !prev.some((p) => p.id === f.id))]);
      setPage(page + 1);
      setState(next.length ? "idle" : "done");
    } catch {
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
