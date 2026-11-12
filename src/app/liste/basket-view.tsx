"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlcoholType } from "@/catalog/import-limits";
import type { BasketItem, ShopResult } from "@/catalog/types";
import { clearBasket, useBasket } from "@/components/basket";
import { ItemStepper } from "@/components/item-stepper";
import { amount, UNIT_LABEL } from "@/lib/format";
import { COUPON_NOTE } from "@/components/badges";
import { ImportLimits } from "./import-limits";
import { ShoppingOptions } from "./shopping-options";

type Alcohol = Partial<Record<AlcoholType, number>>;
type State = { status: "idle" | "loading" | "error" | "busy"; results: ShopResult[]; alcohol: Alcohol };

export function BasketView() {
  const items = useBasket();
  const [state, setState] = useState<State>({ status: "idle", results: [], alcohol: {} });
  // Bumped by "Prøv igen" to re-run the pricing below.
  const [attempt, setAttempt] = useState(0);

  // Re-price the basket whenever it changes (small delay so +/- clicks are batched).
  useEffect(() => {
    if (!items.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: "loading" }));
      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          signal: controller.signal,
        });
        // Too many re-pricings in a minute (rate limit): keep the last prices and say so.
        if (res.status === 429) return setState((s) => ({ ...s, status: "busy" }));
        if (!res.ok) throw new Error(String(res.status));
        const { results, alcohol } = (await res.json()) as { results: ShopResult[]; alcohol: Alcohol };
        setState({ status: "idle", results, alcohol });
      } catch (e) {
        if (!controller.signal.aborted) setState((s) => ({ ...s, status: "error" }));
        void e;
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [items, attempt]);

  if (!items.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        <p className="font-medium">Indkøbslisten er tom</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Søg efter det, du vil købe, og sæt det på listen. Så viser vi, hvilken butik der er billigst for det hele.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Find varer
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((item) => (
          <BasketRow key={item.key} item={item} />
        ))}
      </ul>
      <div className="mt-1 flex justify-between text-sm">
        <Link href="/" className="flex min-h-11 items-center font-medium underline underline-offset-2">
          + Tilføj flere varer
        </Link>
        <button type="button" onClick={clearBasket} className="flex min-h-11 items-center text-zinc-500 underline underline-offset-2">
          Ryd listen
        </button>
      </div>

      {state.status === "error" && (
        <p className="mt-8 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Kunne ikke hente priser. Tjek din forbindelse.{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-10 font-medium underline underline-offset-2">
            Prøv igen
          </button>
        </p>
      )}
      {state.status === "busy" && (
        <p className="mt-8 text-amber-700 dark:text-amber-400">Du har ændret listen mange gange på kort tid – vent et øjeblik.</p>
      )}
      {state.status === "loading" && !state.results.length && <p className="mt-8 text-zinc-500">Regner priser ud…</p>}
      {state.results.length > 0 && <ShoppingOptions results={state.results} loading={state.status === "loading"} />}
      <ImportLimits liters={state.alcohol} />
      {state.results.some((r) => r.lines.some((l) => l.buy?.coupon)) && <p className="mt-4 text-xs text-zinc-500">{COUPON_NOTE}</p>}
      <details className="mt-2 text-xs text-zinc-500">
        <summary className="flex min-h-10 cursor-pointer items-center underline underline-offset-2">Hvor ligger butikkerne?</summary>
        <p>
          Butikkerne ligger forskellige steder: Fleggaard, Calle og Poetzsch ved Padborg/Kruså, Scandinavian Park ved motorvejen i
          Handewitt, BorderShop ved færgerne i Puttgarden (Rødby–Puttgarden) og Rostock (Gedser–Rostock). Calle har også
          butik i Burg på Fehmarn, få km fra færgen i Puttgarden. Fleggaards og
          Calles priser kommer fra deres aviser og gælder til avisens slutdato. Har en butik ikke en vare, regner vi med
          en estimeret pris: den højeste pris i de andre butikker, så totalerne kan sammenlignes.
        </p>
      </details>
    </>
  );
}

function BasketRow({ item }: { item: BasketItem }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{item.label}</p>
        {/* Families are bought by amount: we pick the cheapest pack size in each shop. */}
        {item.kind === "family" && (
          <p className="text-xs text-zinc-500">
            {amount(item.amount)} {UNIT_LABEL[item.unit]} · billigste pakning
          </p>
        )}
      </div>
      <ItemStepper item={item} />
    </li>
  );
}
