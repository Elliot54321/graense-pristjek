import type { Metadata } from "next";
import { BasketView } from "./basket-view";

export const metadata: Metadata = { title: "Din indkøbsliste", robots: { index: false, follow: true } };

export default function ShoppingListPage() {
  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Din indkøbsliste</h1>
      <BasketView />
    </main>
  );
}
