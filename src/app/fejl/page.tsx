import type { Metadata } from "next";
import { Suspense } from "react";
import { getShops } from "@/catalog/data";
import { FeedbackForm } from "./form";

export const metadata: Metadata = {
  title: "Rapportér en fejl – Grænse Pris",
  robots: { index: false, follow: false },
};

export default function FeedbackPage(props: PageProps<"/fejl">) {
  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Fundet en fejl?</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        En forkert pris eller et forkert match giver et forkert svar. Tak fordi du siger til.
      </p>
      {/* The reported price comes from the URL, so it's read per request. */}
      <Suspense>
        <WithContext searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function WithContext({ searchParams }: { searchParams: PageProps<"/fejl">["searchParams"] }) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 300) : undefined;
  };
  const shop = one("butik");
  const shops = await getShops();
  // Only internal pages are accepted as "back" links.
  const page = one("side");
  return (
    <FeedbackForm
      context={{
        shop,
        shopName: shops.find((s) => s.id === shop)?.name,
        product: one("vare"),
        price: one("pris"),
        page: page?.startsWith("/") && !page.startsWith("//") ? page : undefined,
      }}
    />
  );
}
