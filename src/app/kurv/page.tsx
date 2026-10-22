import type { Metadata } from "next";
import { BasketView } from "./basket-view";

export const metadata: Metadata = { title: "Din kurv – Grænse Pris" };

export default function BasketPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Din kurv</h1>
      <BasketView />
    </main>
  );
}
