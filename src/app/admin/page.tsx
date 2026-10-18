import type { Metadata } from "next";
import { Suspense } from "react";
import { confirmLink, linkSuggestion, logout, rejectSuggestion, unlink } from "./actions";
import { adminConfigured, isAdmin } from "./auth";
import { loadReview, type Listing, type LlmLink, type ProductInfo, type Suggestion } from "./data";
import { ActionButton, LoginForm } from "./forms";

export const metadata: Metadata = {
  title: "Gennemgå matches – Grænse Pris",
  robots: { index: false, follow: false },
};

const SHOP_NAMES: Record<string, string> = { poetzsch: "Poetzsch", bordershop: "BorderShop" };

const kr = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 3 });
const UNIT: Record<string, string> = { l: "l", kg: "kg", piece: "stk." };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 font-sans">
      <h1 className="text-2xl font-semibold">Gennemgå matches</h1>
      {/* Reading the login cookie and the database happens per request, so it streams in here. */}
      <Suspense fallback={<p className="mt-6 text-zinc-500">Henter…</p>}>
        <Review />
      </Suspense>
    </main>
  );
}

async function Review() {
  if (!adminConfigured()) {
    return <p className="mt-6">Admin er slået fra: sæt ADMIN_PASSWORD på serveren.</p>;
  }
  if (!(await isAdmin())) {
    return (
      <div className="mt-6 max-w-sm">
        <LoginForm />
      </div>
    );
  }

  const { suggestions, llmLinks } = await loadReview();
  return (
    <>
      <form action={logout} className="mt-2">
        <button className="text-sm text-zinc-500 underline">Log ud</button>
      </form>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Forslag ({suggestions.length})</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          AI&apos;en mener, varerne er de samme, men noget var tvivlsomt, så de er ikke linket endnu.
        </p>
        <ul className="mt-4 flex flex-col gap-4">
          {suggestions.map((s) => (
            <SuggestionCard key={s.self.shopProductId} s={s} />
          ))}
        </ul>
        {!suggestions.length && <p className="mt-4 text-zinc-500">Ingen forslag at gennemgå.</p>}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">AI-links ({llmLinks.length})</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Linket af AI&apos;en uden EAN. Bekræft, eller fjern linket hvis varerne ikke er de samme.
        </p>
        <ul className="mt-4 flex flex-col gap-4">
          {llmLinks.map((l) => (
            <LinkCard key={l.self.shopProductId} l={l} />
          ))}
        </ul>
        {!llmLinks.length && <p className="mt-4 text-zinc-500">Ingen AI-links at gennemgå.</p>}
      </section>
    </>
  );
}

function SuggestionCard({ s }: { s: Suggestion }) {
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm">
        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{s.reason || "tvivl"}</span>
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Side title="Denne vare" product={s.currentProduct} listings={[s.self]} />
        <Side
          title="Foreslået samme som"
          product={s.target}
          listings={s.targetListings}
          empty="Det foreslåede produkt findes ikke længere."
        />
      </div>
      <form className="mt-4 flex gap-3">
        <input type="hidden" name="shopProductId" value={s.self.shopProductId} />
        {s.target && (
          <ActionButton action={linkSuggestion} variant="yes">Link</ActionButton>
        )}
        <ActionButton action={rejectSuggestion} variant="no">Ikke den samme</ActionButton>
      </form>
    </li>
  );
}

function LinkCard({ l }: { l: LlmLink }) {
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Sikkerhed {Math.round(l.confidence * 100)} %</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Side title="Denne vare" product={null} listings={[l.self]} />
        <Side title="Linket til" product={l.product} listings={l.others} empty="Ingen andre varer på produktet." />
      </div>
      <form className="mt-4 flex gap-3">
        <input type="hidden" name="shopProductId" value={l.self.shopProductId} />
        <ActionButton action={confirmLink} variant="yes">Bekræft</ActionButton>
        <ActionButton action={unlink} variant="no">Fjern link</ActionButton>
      </form>
    </li>
  );
}

function Side({
  title,
  product,
  listings,
  empty,
}: {
  title: string;
  product: ProductInfo | null;
  listings: Listing[];
  empty?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {product && (
        <p className="mt-1 text-xs text-zinc-500">
          Produkt #{product.id}
          {product.family && <> · familie «{product.family}»</>}
        </p>
      )}
      {listings.map((x) => (
        <ListingRow key={x.shopProductId} x={x} />
      ))}
      {!listings.length && empty && <p className="mt-2 text-sm text-zinc-500">{empty}</p>}
    </div>
  );
}

function ListingRow({ x }: { x: Listing }) {
  return (
    <div className="mt-2">
      <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
        {x.name}
      </a>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {SHOP_NAMES[x.shopId] ?? x.shopId}
        {x.contentAmount !== null && <> · {amount(x.contentAmount)} {UNIT[x.contentUnit ?? ""] ?? x.contentUnit}</>}
        {x.price !== null && <> · {kr(x.price)} kr.</>}
        {x.pricePerUnit !== null && x.contentUnit && <> ({kr(x.pricePerUnit)} kr./{UNIT[x.contentUnit] ?? x.contentUnit})</>}
        {x.onOffer && <> · tilbud</>}
      </p>
    </div>
  );
}
