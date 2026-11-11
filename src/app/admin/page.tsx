import type { Metadata } from "next";
import { Suspense } from "react";
import { confirmLink, linkSuggestion, logout, markReportHandled, rejectSuggestion, unlink } from "./actions";
import { adminConfigured, isAdmin } from "./auth";
import { loadReview, type Listing, type LlmLink, type ProductInfo, type Suggestion } from "./data";
import { ActionButton, LoginForm } from "./forms";
import { loadInsights, type SearchCount } from "./insights";

export const metadata: Metadata = {
  title: "Gennemgå matches",
  robots: { index: false, follow: false },
};

const SHOP_NAMES: Record<string, string> = {
  poetzsch: "Poetzsch",
  bordershop: "BorderShop Puttgarden",
  "bordershop-rostock": "BorderShop Rostock",
  fleggaard: "Fleggaard",
  calle: "Calle",
  scandipark: "Scandinavian Park",
};

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

  const [{ suggestions, llmLinks, totals }, insights] = await Promise.all([loadReview(), loadInsights()]);
  return (
    <>
      <form action={logout} className="mt-2">
        <button className="text-sm text-zinc-500 underline">Log ud</button>
      </form>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Fejlrapporter ({insights.reports.length})</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Fra &quot;Fejl i prisen?&quot; på siden. Nyeste først.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {insights.reports.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">
                {new Date(r.createdAt).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })}
                {r.page && ` · fra ${r.page}`}
              </p>
              {(r.product || r.shopId) && (
                <p className="mt-1 text-sm font-medium">
                  {r.product ?? "?"}
                  {r.shopId && ` – ${SHOP_NAMES[r.shopId] ?? r.shopId}`}
                  {r.price !== null && ` – ${kr(r.price)} kr.`}
                </p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p>
              <form className="mt-3 flex">
                <input type="hidden" name="reportId" value={r.id} />
                <ActionButton action={markReportHandled} variant="no">
                  Klaret
                </ActionButton>
              </form>
            </li>
          ))}
        </ul>
        {!insights.reports.length && <p className="mt-4 text-zinc-500">Ingen åbne fejlrapporter.</p>}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Søgninger, sidste {insights.days} dage ({insights.totalSearches})</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <SearchList title="Uden resultat" note="Varer folk leder efter, som siden ikke kender." rows={insights.emptySearches} />
          <SearchList title="Mest søgt" note="Alle søgninger." rows={insights.topSearches} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          Forslag ({suggestions.length < totals.suggestions ? `de ${suggestions.length} vigtigste af ${totals.suggestions}` : totals.suggestions})
        </h2>
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
        <h2 className="text-xl font-semibold">
          AI-links ({llmLinks.length < totals.llmLinks ? `de ${llmLinks.length} vigtigste af ${totals.llmLinks}` : totals.llmLinks})
        </h2>
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
      <p className="flex flex-wrap gap-2 text-sm">
        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{s.reason || "tvivl"}</span>
        <PriorityTags tags={s.priority.tags} />
      </p>
      <PriceRange listings={[s.self, ...s.targetListings]} />
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
      <p className="flex flex-wrap gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>Sikkerhed {Math.round(l.confidence * 100)} %</span>
        <PriorityTags tags={l.priority.tags} />
      </p>
      <PriceRange listings={[l.self, ...l.others]} />
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
      {x.imageUrl && (
        <a href={x.url} target="_blank" rel="noopener noreferrer" className="float-right ml-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- the shop's own photo, shown as-is */}
          <img
            src={x.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-20 w-20 rounded border border-zinc-200 bg-white object-contain dark:border-zinc-700"
          />
        </a>
      )}
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
      {/* Newsletter products have no product page: show what was printed and the page itself. */}
      {x.source && (
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          <p>
            Avis {x.source.issue}, side {x.source.page}: <span className="italic">{x.source.text}</span>
          </p>
          {x.source.image && (
            <a href={x.source.image} target="_blank" rel="noopener noreferrer" className="mt-1 block">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link, not a static asset */}
              <img
                src={x.source.image}
                alt={`Avisside ${x.source.page}`}
                loading="lazy"
                className="max-h-56 rounded border border-zinc-200 dark:border-zinc-700"
              />
              <span className="underline underline-offset-2">Åbn siden i fuld størrelse</span>
            </a>
          )}
        </div>
      )}
      <div className="clear-both" />
    </div>
  );
}

function SearchList({ title, note, rows }: { title: string; note: string; rows: SearchCount[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-xs text-zinc-500">{note}</p>
      <ol className="mt-2 text-sm">
        {rows.map((r) => (
          <li key={r.query} className="flex justify-between gap-3 border-b border-zinc-100 py-1 dark:border-zinc-800">
            <a href={`/?q=${encodeURIComponent(r.query)}`} className="underline-offset-2 hover:underline">
              {r.query}
            </a>
            <span className="tabular-nums text-zinc-500">{r.count}</span>
          </li>
        ))}
      </ol>
      {!rows.length && <p className="mt-2 text-sm text-zinc-500">Ingen endnu.</p>}
    </div>
  );
}

/** Why an item is near the top: common item, searched for, or not on sale. */
function PriorityTags({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="rounded bg-sky-100 px-2 py-0.5 text-sky-900 dark:bg-sky-900 dark:text-sky-100">
          {t}
        </span>
      ))}
    </>
  );
}

/**
 * Cheapest and dearest shop among the listings on sale, so a "price differs" note can be
 * read at a glance: a real price gap (one shop is just dearer) or a sign of a wrong match.
 */
function PriceRange({ listings }: { listings: Listing[] }) {
  const priced = listings.filter((x) => x.listed && x.price !== null);
  if (new Set(priced.map((x) => x.shopId)).size < 2) return null;
  const sorted = [...priced].sort((a, b) => a.price! - b.price!);
  const [low, high] = [sorted[0], sorted[sorted.length - 1]];
  const diff = Math.round((high.price! / low.price! - 1) * 100);
  return (
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
      Pris: {kr(low.price!)} ({SHOP_NAMES[low.shopId] ?? low.shopId}) – {kr(high.price!)} (
      {SHOP_NAMES[high.shopId] ?? high.shopId})
      <span className={diff > 40 ? "font-semibold text-red-700 dark:text-red-400" : ""}> · {diff} % forskel</span>
    </p>
  );
}

