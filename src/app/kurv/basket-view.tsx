"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlcoholType } from "@/catalog/import-limits";
import type { BasketItem, ShopResult } from "@/catalog/types";
import { clearBasket, removeFromBasket, updateBasketItem, useBasket } from "@/components/basket";
import { amount, day, kr, UNIT_LABEL } from "@/lib/format";
import { ImportLimits } from "./import-limits";

type Alcohol = Partial<Record<AlcoholType, number>>;
type State = { status: "idle" | "loading" | "error"; results: ShopResult[]; alcohol: Alcohol };

export function BasketView() {
  const items = useBasket();
  const [state, setState] = useState<State>({ status: "idle", results: [], alcohol: {} });

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
  }, [items]);

  if (!items.length) {
    return (
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Kurven er tom.{" "}
        <Link href="/" className="underline underline-offset-2">
          Søg efter varer
        </Link>{" "}
        og læg dem i kurven.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((item) => (
          <BasketRow key={item.key} item={item} />
        ))}
      </ul>
      <div className="mt-2 flex justify-between text-sm">
        <Link href="/" className="underline underline-offset-2">
          + Tilføj flere varer
        </Link>
        <button type="button" onClick={clearBasket} className="text-zinc-500 underline underline-offset-2">
          Tøm kurven
        </button>
      </div>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">Pris pr. butik</h2>
      {state.status === "error" && <p className="mt-2 text-red-700">Kunne ikke hente priser. Prøv igen om lidt.</p>}
      {state.status === "loading" && !state.results.length && <p className="mt-2 text-zinc-500">Regner priser ud…</p>}
      <ol className={`mt-3 flex flex-col gap-4 ${state.status === "loading" ? "opacity-60" : ""}`}>
        {state.results.map((r, i) => (
          <ShopCard key={r.shop.id} result={r} cheapest={i === 0 && r.missing === 0} />
        ))}
      </ol>
      <ImportLimits liters={state.alcohol} />
      <p className="mt-4 text-xs text-zinc-500">
        Butikkerne ligger forskellige steder: Fleggaard og Poetzsch ved Padborg/Harrislee, Scandinavian Park ved motorvejen i
        Handewitt, BorderShop ved færgerne i Puttgarden (Rødby–Puttgarden) og Rostock (Gedser–Rostock). Fleggaards priser
        kommer fra deres avis og gælder til avisens slutdato. Har en butik ikke en vare, tæller den ikke med i totalen.
      </p>
    </>
  );
}

function BasketRow({ item }: { item: BasketItem }) {
  if (item.kind === "product") {
    return (
      <li className="flex items-center justify-between gap-3 px-3 py-2.5">
        <p className="min-w-0 flex-1 text-sm">{item.label}</p>
        <Stepper
          value={`${item.quantity} stk.`}
          onMinus={() => (item.quantity > 1 ? updateBasketItem(item.key, { quantity: item.quantity - 1 }) : removeFromBasket(item.key))}
          onPlus={() => updateBasketItem(item.key, { quantity: item.quantity + 1 })}
        />
      </li>
    );
  }
  // Families are bought by amount; each step is the pack size the family was added with.
  const step = item.step;
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{item.label}</p>
        <p className="text-xs text-zinc-500">Billigste pakning – vi vælger størrelsen</p>
      </div>
      <Stepper
        value={`${amount(item.amount)} ${UNIT_LABEL[item.unit]}`}
        onMinus={() =>
          item.amount - step > 0.0001 ? updateBasketItem(item.key, { amount: round(item.amount - step) }) : removeFromBasket(item.key)
        }
        onPlus={() => updateBasketItem(item.key, { amount: round(item.amount + step) })}
      />
    </li>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  const btn = "h-9 w-9 rounded-md border border-zinc-300 text-lg leading-none dark:border-zinc-700";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" onClick={onMinus} className={btn} aria-label="Færre">
        −
      </button>
      <span className="min-w-16 text-center text-sm tabular-nums">{value}</span>
      <button type="button" onClick={onPlus} className={btn} aria-label="Flere">
        +
      </button>
    </div>
  );
}

function ShopCard({ result, cheapest }: { result: ShopResult; cheapest: boolean }) {
  const { shop } = result;
  return (
    <li className={`rounded-lg border p-4 ${cheapest ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {shop.name}
            {cheapest && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">Billigst</span>}
          </h3>
          {shop.location && <p className="text-xs text-zinc-500">{shop.location}</p>}
        </div>
        <p className="text-xl font-semibold tabular-nums">{kr(result.total)} kr.</p>
      </div>
      {result.missing > 0 && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          Mangler {result.missing} {result.missing === 1 ? "vare" : "varer"} – ikke med i totalen
        </p>
      )}
      <ul className="mt-2 text-sm">
        {result.lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3 py-0.5">
            {l.buy ? (
              <>
                <a href={l.buy.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                  {l.buy.quantity} × {l.buy.productName}
                  {l.buy.multiBuy && (
                    <span className="ml-1 text-xs text-sky-700 dark:text-sky-400">
                      ({l.buy.multiBuy.quantity} for {kr(l.buy.multiBuy.price)})
                    </span>
                  )}
                  {l.buy.onOffer && (
                    <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                      tilbud{l.buy.offerEndsAt ? ` til ${day(l.buy.offerEndsAt)}` : ""}
                    </span>
                  )}
                </a>
                <span className="tabular-nums">{kr(l.cost!)}</span>
              </>
            ) : (
              <span className="text-zinc-500">{l.label}: findes ikke her</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}
