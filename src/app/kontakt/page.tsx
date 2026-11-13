import type { Metadata } from "next";
import { Suspense } from "react";
import { getShops } from "@/catalog/data";
import { CONTACT_EMAIL } from "@/lib/site";
import { FeedbackForm } from "./form";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Fundet en forkert pris, har du en idé, eller er du fra en af butikkerne? Skriv til Prisgrænsen.",
};

/**
 * Contact page and error reports in one: the "Fejl?" links next to prices open it with
 * the shop, product and price in the URL (?butik=&vare=&pris=&side=), and the form is
 * pre-filled; opened from the menu it's a general message. Was /fejl until 2026-11-13
 * (redirects here).
 */
export default function ContactPage(props: PageProps<"/kontakt">) {
  return (
    <main className="mx-auto w-full max-w-3xl">
      {/* The reported price comes from the URL, so it's read per request. */}
      <Suspense fallback={<Intro report={false} />}>
        <WithContext searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function Intro({ report }: { report: boolean }) {
  return report ? (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Fundet en fejl?</h1>
      <p className="mt-1 text-sm text-zinc-600">
        En forkert pris eller et forkert match giver et forkert svar. Tak fordi du siger til.
      </p>
    </>
  ) : (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Kontakt</h1>
      <p className="mt-2 text-zinc-700">
        Fundet en forkert pris eller et forkert match, har du en idé til siden, eller er du fra en af butikkerne? Skriv
        her – vi læser alle beskeder.
      </p>
      {CONTACT_EMAIL && (
        <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-sm text-zinc-700">
          Vil du have svar, så skriv til{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          . Beskeder via formularen kan vi ikke svare på.
        </p>
      )}
    </>
  );
}

async function WithContext({ searchParams }: { searchParams: PageProps<"/kontakt">["searchParams"] }) {
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
  const product = one("vare");
  const report = !!(product || shop);
  return (
    <>
      <Intro report={report} />
      <FeedbackForm
        general={!report}
        context={{
          shop,
          shopName: shops.find((s) => s.id === shop)?.name,
          product,
          price: one("pris"),
          page: page?.startsWith("/") && !page.startsWith("//") ? page : undefined,
        }}
      />
    </>
  );
}
