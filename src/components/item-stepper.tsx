"use client";

import type { BasketItem } from "@/catalog/types";
import { amount, UNIT_LABEL } from "@/lib/format";
import { removeFromBasket, updateBasketItem } from "./basket";

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Packs of the added size ("2") when a family's amount is whole packs of it, else null. */
export function wholePacks(item: Extract<BasketItem, { kind: "family" }>): number | null {
  const n = item.amount / item.step;
  return item.packLabel && Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : null;
}

/**
 * − / + for an item on the shopping list, used in search and on the list itself.
 * Products count pieces; families step by the pack size they were added with.
 * Going below one removes the item.
 */
export function ItemStepper({ item, full = false }: { item: BasketItem; full?: boolean }) {
  if (item.kind === "product") {
    return (
      <Stepper
        full={full}
        label={item.label}
        value={`${item.quantity} stk.`}
        onMinus={() => (item.quantity > 1 ? updateBasketItem(item.key, { quantity: item.quantity - 1 }) : removeFromBasket(item.key))}
        onPlus={() => updateBasketItem(item.key, { quantity: item.quantity + 1 })}
      />
    );
  }
  const packs = wholePacks(item);
  return (
    <Stepper
      full={full}
      label={item.label}
      value={packs !== null ? `${amount(packs)} × ${item.packLabel!.replace(" x ", "×")}` : `${amount(item.amount)} ${UNIT_LABEL[item.unit]}`}
      onMinus={() =>
        item.amount - item.step > 0.0001 ? updateBasketItem(item.key, { amount: round(item.amount - item.step) }) : removeFromBasket(item.key)
      }
      onPlus={() => updateBasketItem(item.key, { amount: round(item.amount + item.step) })}
    />
  );
}

/** full: fills its container with a narrower middle, for the small front-page cards. */
function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  full,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  full: boolean;
}) {
  const btn =
    "h-10 w-10 shrink-0 cursor-pointer rounded-md border border-zinc-300 bg-white text-lg leading-none transition-colors hover:border-emerald-600 hover:bg-emerald-100 hover:text-emerald-900 dark:border-zinc-700";
  return (
    <div className={full ? "flex w-full items-center gap-1" : "flex shrink-0 items-center gap-2"}>
      <button type="button" onClick={onMinus} className={btn} aria-label={`Færre ${label}`}>
        −
      </button>
      <span className={`text-center tabular-nums ${full ? "min-w-0 flex-1 text-xs" : "min-w-16 text-sm"}`} aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={onPlus} className={btn} aria-label={`Flere ${label}`}>
        +
      </button>
    </div>
  );
}
