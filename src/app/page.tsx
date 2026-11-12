import type { Metadata } from "next";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { getShops, searchFamilies } from "@/catalog/data";
import type { FamilyResult, Offer, Pack, Shop } from "@/catalog/types";
import { AddToBasket } from "@/components/add-to-basket";
import { kr, PER_UNIT_LABEL } from "@/lib/format";
import { CouponBadge, COUPON_NOTE, MultiBuyBadge, OfferBadge } from "@/components/badges";
import { logSearch } from "@/db/log";
import { ReportLink } from "@/components/report-link";

const EXAMPLES = ["cola", "øl", "haribo", "gin", "chips"];

/** Product families shown before "Vis flere varer". */
const SHOWN = 6;

/**
 * "cola – priser ved grænsen" for a search, so a shared link says what it shows.
 * Search result pages are kept out of search engines (endless near-duplicates).
 */
export async function generateMetadata(props: PageProps<"/">): Promise<Metadata> {
  const raw = (await props.searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 60);
  if (!query) return {};
  return {
    title: `${query} – priser ved grænsen`,
    description: `Sammenlign priser på ${query} i grænsebutikkerne og find den billigste.`,
    robots: { index: false, follow: true },
  };
}

export default function Home(props: PageProps<"/">) {
  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Hvad skal du handle?</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Søg efter en vare, sæt den på din indkøbsliste, og se hvilken grænsebutik der er billigst.
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
        <Examples title="Prøv f.eks." />
      )}
    </>
  );
}

/** Example searches as tappable chips. */
function Examples({ title }: { title: string }) {
  return (
    <div className="mt-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <a
              href={`/?q=${encodeURIComponent(e)}`}
              className="flex min-h-10 items-center rounded-full border border-zinc-300 px-4 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {e}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Results({ query }: { query: string }) {
  const [families, shops] = await Promise.all([searchFamilies(query), getShops()]);
  // Logged after the page is sent, so it never slows the search down - and only for
  // real requests, never while Next.js prerenders the page.
  await connection();
  after(() => logSearch(query, families.length));
  if (!families.length) {
    return (
      <div className="mt-6">
        <p className="font-medium">Ingen varer fundet for “{query}”.</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Prøv et kortere ord eller mærket alene, fx “tuborg” i stedet for “tuborg grøn dåse”.
        </p>
        <Examples title="Eller prøv" />
      </div>
    );
  }
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const page = `/?q=${encodeURIComponent(query)}`;
  const hasCoupon = families.some((f) => f.packs.some((p) => p.offers.some((o) => o.coupon)));
  return (
    <>
      <ul className="mt-6 flex flex-col gap-4">
        {families.slice(0, SHOWN).map((f) => (
          <FamilyCard key={f.id} family={f} shops={shopById} page={page} />
        ))}
      </ul>
      {/* Broad words ("cola") match many families; the best-ranked come first, the rest one tap away. */}
      {families.length > SHOWN && (
        <details className="group mt-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium group-open:hidden dark:border-zinc-700">
            Vis {families.length - SHOWN} flere varer
          </summary>
          <ul className="flex flex-col gap-4">
            {families.slice(SHOWN).map((f) => (
              <FamilyCard key={f.id} family={f} shops={shopById} page={page} />
            ))}
          </ul>
        </details>
      )}
      {hasCoupon && <p className="mt-4 text-xs text-zinc-500">{COUPON_NOTE}</p>}
    </>
  );
}

/** Short shop name for price rows ("BorderShop Puttgarden"); where the store is lives on /om and the basket. */
const shopName = (shops: Map<string, Shop>, id: string) => shops.get(id)?.name ?? id;

function FamilyCard({ family, shops, page }: { family: FamilyResult; shops: Map<string, Shop>; page: string }) {
  const bestPack = family.best ? family.packs.find((p) => p.name === family.best!.productName) : undefined;
  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">{family.name}</h2>
          {family.best && (
            <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
              Billigst <strong className="text-emerald-700 dark:text-emerald-400">{kr(family.best.pricePerUnit)} kr. {PER_UNIT_LABEL[family.best.unit]}</strong>{" "}
              hos {shopName(shops, family.best.shopId)}
              {family.best.coupon && <CouponBadge />}
            </p>
          )}
        </div>
        {family.best && bestPack?.contentAmount && (
          <AddToBasket
            label="Billigste på listen"
            className="shrink-0"
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
      <ul className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {family.packs.map((p) => (
          <PackRow key={p.productId} pack={p} shops={shops} page={page} />
        ))}
      </ul>
    </li>
  );
}

/**
 * One pack: photo, the cheapest shop's price, and every shop's price behind a tap,
 * so a long list of shops doesn't bury the answer. page: the search to return to
 * after reporting a price.
 */
function PackRow({ pack, shops, page }: { pack: Pack; shops: Map<string, Shop>; page: string }) {
  // Offers are sorted by price, so the first is the cheapest (others may tie with it).
  const [best, ...rest] = pack.offers;
  const ties = rest.filter((o) => o.price === best.price).length;
  return (
    <li className="py-3">
      {/* Photo left, text and button right; the button sits under the price so the photo can be large. */}
      <div className="flex gap-3">
        <ProductPhoto url={pack.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {pack.name}
            {pack.packLabel && <span className="font-normal text-zinc-500"> · {pack.packLabel}</span>}
          </p>
          <p className="mt-1 text-sm">
            <strong className="text-base tabular-nums">{kr(best.price)} kr.</strong> hos {shopName(shops, best.shopId)}
            {ties > 0 && <span className="text-zinc-500"> (+{ties} til samme pris)</span>}
          </p>
          <OfferDetails offer={best} pack={pack} page={page} />
          <AddToBasket
            label="Sæt på listen"
            variant="secondary"
            className="mt-2"
            item={{ key: `p-${pack.productId}`, kind: "product", productId: pack.productId, label: pack.name, quantity: 1 }}
          />
        </div>
      </div>
      {rest.length > 0 && (
        <details className="group mt-1">
          <summary className="-mx-1 flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-1 text-sm text-zinc-700 [&::-webkit-details-marker]:hidden dark:text-zinc-300">
            <span aria-hidden className="inline-block text-xs transition-transform group-open:rotate-90">
              ▶
            </span>
            Priser i alle {pack.offers.length} butikker
          </summary>
          <ul className="flex flex-col gap-1.5 pb-1">
            {pack.offers.map((o) => (
              <li key={`${o.shopId}-${o.url}`} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline-offset-2 hover:underline">
                    {shopName(shops, o.shopId)}
                  </a>
                  <strong className={`shrink-0 tabular-nums ${o.price === best.price ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                    {kr(o.price)} kr.
                  </strong>
                </div>
                <OfferDetails offer={o} pack={pack} page={page} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/** Per-liter price, badges and the report link under a price. */
function OfferDetails({ offer: o, pack, page }: { offer: Offer; pack: Pack; page: string }) {
  return (
    <div className="text-xs text-zinc-500">
      {o.pricePerUnit !== null && pack.contentUnit && (
        <span>
          {kr(o.pricePerUnit)} kr. {PER_UNIT_LABEL[pack.contentUnit]}
        </span>
      )}
      {o.onOffer && <OfferBadge endsAt={o.offerEndsAt} />}
      {o.multiBuy && <MultiBuyBadge quantity={o.multiBuy.quantity} price={o.multiBuy.price} />}
      {o.coupon && <CouponBadge />}
      {o.savingVsDkPercent !== null && <span className="ml-1">(butikken: spar {o.savingVsDkPercent}% ift. DK)</span>}
      <ReportLink shop={o.shopId} product={pack.name} price={o.price} page={page} />
    </div>
  );
}

/**
 * The shop's own product photo, linked straight from its site (only the address is
 * stored). A plain <img>: routing shop photos through Next's image optimizer would
 * copy them onto our servers. Newsletter-only products get an empty tile.
 */
function ProductPhoto({ url }: { url: string | null }) {
  return (
    <div
      className={`flex h-24 w-24 shrink-0 sm:h-28 sm:w-28 items-center justify-center overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700 ${
        url ? "bg-white" : "bg-zinc-100 dark:bg-zinc-800"
      }`}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={112} height={112} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
      )}
    </div>
  );
}
