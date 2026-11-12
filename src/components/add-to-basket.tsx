"use client";

import { useState } from "react";
import type { BasketItem } from "@/catalog/types";
import { addToBasket } from "./basket";

/** "Sæt på listen" button (adds to the shopping list, kept as "basket" in code); briefly confirms so the user knows it worked. */
/** variant "secondary": outlined, for the many per-pack buttons so the family's main button stands out. */
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
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        addToBasket(item);
        setAdded(true);
        setTimeout(() => setAdded(false), 1500);
      }}
      className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        added
          ? "border border-emerald-600 bg-emerald-600 text-white"
          : variant === "primary"
            ? "border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
      } ${className}`}
    >
      {added ? "På listen ✓" : label}
    </button>
  );
}
