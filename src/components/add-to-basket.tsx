"use client";

import type { BasketItem } from "@/catalog/types";
import { addToBasket, useBasket } from "./basket";
import { ItemStepper } from "./item-stepper";

/**
 * "Sæt på listen" (the shopping list is called "basket" in code). Once the item is on
 * the list, the button turns into − / + so the quantity can be set right there.
 * variant "secondary": outlined, for the many per-pack buttons so the family's main button stands out.
 */
export function AddToBasket({
  item,
  label = "Sæt på listen",
  variant = "primary",
  className = "",
}: {
  item: BasketItem;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const onList = useBasket().find((i) => i.key === item.key);
  if (onList) {
    return (
      <div className={className}>
        <ItemStepper item={onList} />
        <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">På listen ✓</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => addToBasket(item)}
      className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        variant === "primary"
          ? "border border-zinc-700 bg-zinc-700 text-white hover:bg-zinc-600 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
      } ${className}`}
    >
      {label}
    </button>
  );
}
