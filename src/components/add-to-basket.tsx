"use client";

import { useState } from "react";
import type { BasketItem } from "@/catalog/types";
import { addToBasket } from "./basket";

/** "Læg i kurv" button; briefly confirms so the user knows it worked. */
export function AddToBasket({ item, label = "Læg i kurv", className = "" }: { item: BasketItem; label?: string; className?: string }) {
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        addToBasket(item);
        setAdded(true);
        setTimeout(() => setAdded(false), 1500);
      }}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        added ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      } ${className}`}
    >
      {added ? "Lagt i kurv ✓" : label}
    </button>
  );
}
