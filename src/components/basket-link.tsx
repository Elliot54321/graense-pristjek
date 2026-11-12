"use client";

import Link from "next/link";
import { useBasket } from "./basket";

export function BasketLink() {
  const count = useBasket().length;
  return (
    <Link href="/liste" className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
      Indkøbsliste{count ? ` (${count})` : ""}
    </Link>
  );
}
