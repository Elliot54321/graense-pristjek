import { dealPerPiece, effectivePrice } from "@/catalog/compare";
import type { FamilyResult, Offer, Pack, Shop } from "@/catalog/types";
import { AddToBasket } from "@/components/add-to-basket";
import { CouponBadge, COUPON_NOTE, MultiBuyBadge, OfferBadge } from "@/components/badges";
import { ReportLink } from "@/components/report-link";
import { kr, PER_UNIT_LABEL } from "@/lib/format";

/** SHOWN families are listed; the rest sit behind "Vis X flere varer". page: where "Fejl?" returns to. */
export function FamilyList({ families, shops, page, shown = 6 }: { families: FamilyResult[]; shops: Shop[]; page: string; shown?: number }) {
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const hasCoupon = families.some((f) => f.packs.some((p) => p.offers.some((o) => o.coupon)));
  // Two columns on wide screens; cards keep their own height (items-start).
  const grid = "grid items-start gap-4 lg:grid-cols-2";
  return (
    <>
      <ul className={`mt-6 ${grid}`}>
        {families.slice(0, shown).map((f) => (
          <FamilyCard key={f.id} family={f} shops={shopById} page={page} />
        ))}
      </ul>
      {/* Broad words ("cola") match many families; the best-ranked come first, the rest one tap away. */}
      {families.length > shown && (
        <details className="group mt-4">
          <summary className="mx-auto flex min-h-11 max-w-md cursor-pointer items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium group-open:hidden dark:border-zinc-700">
            Vis {families.length - shown} flere varer
          </summary>
          <ul className={grid}>
            {families.slice(shown).map((f) => (
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
              {family.best.deal && <span className="text-zinc-500"> ved {family.best.deal.quantity} stk.</span>}
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
  // Offers are sorted by the price a bulk shopper pays (multi-buy rate when there is one),
  // so the first is the cheapest; others may tie with it.
  const [best, ...rest] = pack.offers;
  const low = effectivePrice(best);
  const ties = rest.filter((o) => Math.abs(effectivePrice(o) - low) < 0.005).length;
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
            <strong className="text-base tabular-nums">
              {kr(low)} kr.{low < best.price && " stk."}
            </strong>{" "}
            hos {shopName(shops, best.shopId)}
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
                  <strong
                    className={`shrink-0 tabular-nums ${Math.abs(effectivePrice(o) - low) < 0.005 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                  >
                    {kr(effectivePrice(o))} kr.
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

/**
 * Per-liter price, badges and the report link under a price. With a multi-buy deal
 * the price above is the deal rate, so the single price is shown here ("71,99 kr. for 1").
 */
function OfferDetails({ offer: o, pack, page }: { offer: Offer; pack: Pack; page: string }) {
  const deal = dealPerPiece(o) !== null ? o.multiBuy : null;
  return (
    <div className="text-xs text-zinc-500">
      {o.pricePerUnit !== null && pack.contentUnit && (
        <span>
          {kr((o.pricePerUnit * effectivePrice(o)) / o.price)} kr. {PER_UNIT_LABEL[pack.contentUnit]}
        </span>
      )}
      {deal && <MultiBuyBadge quantity={deal.quantity} price={deal.price} />}
      {deal && <span className="ml-1 whitespace-nowrap">{kr(o.price)} kr. for 1</span>}
      {o.onOffer && <OfferBadge endsAt={o.offerEndsAt} />}
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
