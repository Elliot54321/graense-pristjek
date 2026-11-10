import { after, connection } from "next/server";
import { Suspense } from "react";
import { getShops, searchFamilies } from "@/catalog/data";
import type { FamilyResult, Pack, Shop } from "@/catalog/types";
import { AddToBasket } from "@/components/add-to-basket";
import { day, kr, PER_UNIT_LABEL } from "@/lib/format";
import { CouponBadge, COUPON_NOTE } from "@/components/coupon-badge";
import { logSearch } from "@/db/log";
import { ReportLink } from "@/components/report-link";

const EXAMPLES = ["cola", "øl", "haribo", "gin", "chips"];

export default function Home(props: PageProps<"/">) {
  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Hvad skal du handle?</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Søg efter en vare, læg den i kurven, og se hvilken grænsebutik der er billigst.
      </p>
      {/* The query comes from the URL, so the form and results render per request. */}
      <Suspense fallback={<SearchForm query="" />}>
        <Search searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function SearchForm({ query }: { query: string }) {
  return (
    <form action="/" className="mt-4 flex gap-2">
      <input
        name="q"
        defaultValue={query}
        placeholder="F.eks. cola, øl, haribo…"
        aria-label="Søg efter en vare"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        Søg
      </button>
    </form>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return (
    <>
      <SearchForm query={query} />
      {query ? (
        <Suspense fallback={<p className="mt-6 text-zinc-500">Søger…</p>}>
          <Results query={query} />
        </Suspense>
      ) : (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          Prøv f.eks.{" "}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              <a href={`/?q=${encodeURIComponent(e)}`} className="underline underline-offset-2">
                {e}
              </a>
              {i < EXAMPLES.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

async function Results({ query }: { query: string }) {
  const [families, shops] = await Promise.all([searchFamilies(query), getShops()]);
  // Logged after the page is sent, so it never slows the search down - and only for
  // real requests, never while Next.js prerenders the page.
  await connection();
  after(() => logSearch(query, families.length));
  if (!families.length) {
    return <p className="mt-6 text-zinc-600 dark:text-zinc-400">Ingen varer fundet for “{query}”. Prøv et andet ord.</p>;
  }
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const hasCoupon = families.some((f) => f.packs.some((p) => p.offers.some((o) => o.coupon)));
  return (
    <>
      <ul className="mt-6 flex flex-col gap-4">
        {families.map((f) => (
          <FamilyCard key={f.id} family={f} shops={shopById} page={`/?q=${encodeURIComponent(query)}`} />
        ))}
      </ul>
      {hasCoupon && <p className="mt-4 text-xs text-zinc-500">{COUPON_NOTE}</p>}
    </>
  );
}

const shopLabel = (shops: Map<string, Shop>, id: string) => {
  const s = shops.get(id);
  return s ? `${s.name}${s.location && !s.name.includes(s.location) ? ` (${s.location})` : ""}` : id;
};

function FamilyCard({ family, shops, page }: { family: FamilyResult; shops: Map<string, Shop>; page: string }) {
  const bestPack = family.best ? family.packs.find((p) => p.name === family.best!.productName) : undefined;
  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{family.name}</h2>
          {family.best && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Billigst: <strong>{kr(family.best.pricePerUnit)} kr. {PER_UNIT_LABEL[family.best.unit]}</strong> hos{" "}
              {shopLabel(shops, family.best.shopId)}
              {family.best.coupon && <CouponBadge />}
            </p>
          )}
        </div>
        {family.best && bestPack?.contentAmount && (
          <AddToBasket
            label="Billigste i kurv"
            item={{
              key: `f-${family.id}`,
              kind: "family",
              familyId: family.id,
              label: family.name,
              amount: bestPack.contentAmount,
              step: bestPack.contentAmount,
              unit: family.best.unit,
              packLabel: bestPack.packLabel ?? undefined,
            }}
          />
        )}
      </div>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
        {family.packs.map((p) => (
          <PackRow key={p.productId} pack={p} shops={shops} page={page} />
        ))}
      </ul>
    </li>
  );
}

/** page: the search to return to after reporting a price. */
function PackRow({ pack, shops, page }: { pack: Pack; shops: Map<string, Shop>; page: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {pack.name}
          {pack.packLabel && <span className="font-normal text-zinc-500"> · {pack.packLabel}</span>}
        </p>
        <ul className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
          {pack.offers.map((o) => (
            <li key={`${o.shopId}-${o.url}`}>
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                {shopLabel(shops, o.shopId)}
              </a>
              : <strong>{kr(o.price)} kr.</strong>
              {o.pricePerUnit !== null && pack.contentUnit && (
                <span className="text-zinc-500"> ({kr(o.pricePerUnit)} {PER_UNIT_LABEL[pack.contentUnit]})</span>
              )}
              {o.onOffer && (
                <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                  Tilbud{o.offerEndsAt ? ` til ${day(o.offerEndsAt)}` : ""}
                </span>
              )}
              {o.multiBuy && (
                <span className="ml-1 rounded bg-sky-100 px-1 text-xs text-sky-900 dark:bg-sky-900 dark:text-sky-100">
                  {o.multiBuy.quantity} for {kr(o.multiBuy.price)}
                </span>
              )}
              {o.coupon && <CouponBadge />}
              {o.savingVsDkPercent !== null && (
                <span className="ml-1 text-xs text-zinc-500">(butikken: spar {o.savingVsDkPercent}% ift. DK)</span>
              )}
              <ReportLink shop={o.shopId} product={pack.name} price={o.price} page={page} />
            </li>
          ))}
        </ul>
      </div>
      <AddToBasket
        label="Læg i kurv"
        item={{ key: `p-${pack.productId}`, kind: "product", productId: pack.productId, label: pack.name, quantity: 1 }}
      />
    </li>
  );
}
