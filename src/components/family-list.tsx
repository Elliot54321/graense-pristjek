import { dealPerPiece, effectivePrice } from "@/catalog/compare";
import type { DisplayPer, FamilyResult, Offer, Pack, Shop, Unit } from "@/catalog/types";
import { AddToBasket } from "@/components/add-to-basket";
import { cheapestListItem } from "@/components/list-item";
import { CouponBadge, COUPON_NOTE, MultiBuyBadge, OfferBadge } from "@/components/badges";
import { ReportLink } from "@/components/report-link";
import { ZoomablePhoto } from "@/components/zoomable-photo";
import { ChevronDown } from "lucide-react";
import { kr, mlWords, perUnit as shownPerUnit, pieceWords } from "@/lib/format";
import { FamilyMore, type ResultSource } from "./family-more";

/** The two-column result grid; each card spans three rows through a subgrid (see FamilyCard). */
export const RESULT_GRID = "grid gap-x-4 gap-y-4 lg:grid-cols-2";

/**
 * The first page of search or category results, then "Vis flere resultater" for the rest
 * (FamilyMore). page: where "Fejl?" returns to.
 */
export function FamilyList({
  families,
  shops,
  page,
  source,
  next,
}: {
  families: FamilyResult[];
  shops: Shop[];
  page: string;
  source: ResultSource;
  /** Where the second page starts; null when this page held everything. */
  next: number | null;
}) {
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const hasCoupon = families.some((f) => f.packs.some((p) => p.offers.some((o) => o.coupon)));
  return (
    <>
      <ul className={`mt-6 ${RESULT_GRID}`}>
        {families.map((f) => (
          <FamilyCard key={f.id} family={f} shops={shopById} page={page} />
        ))}
      </ul>
      {/* Keyed by the search/category: moving from Øl to Vin starts a fresh list instead of keeping beer pages. */}
      <FamilyMore
        key={JSON.stringify(source)}
        source={source}
        shops={shops}
        page={page}
        next={next}
      />
      {hasCoupon && <p className="mt-4 text-xs text-zinc-500">{COUPON_NOTE}</p>}
    </>
  );
}

/** Short shop name for price rows ("BorderShop Puttgarden"); where the store is lives on /om and the basket. */
const shopName = (shops: Map<string, Shop>, id: string) => shops.get(id)?.name ?? id;

/** openVariants: start with "Se N andre varianter" open (the front page's variant picker). */
export function FamilyCard({
  family,
  shops,
  page,
  openVariants = false,
}: {
  family: FamilyResult;
  shops: Map<string, Shop>;
  page: string;
  openVariants?: boolean;
}) {
  const bestPack = family.best ? family.packs.find((p) => p.name === family.best!.productName) : undefined;
  // One pack per card - the cheapest per liter/kg, which "Billigste på listen" adds too -
  // so cards in the grid line up; the other variants (sizes, cans vs bottles) are one tap away.
  // Without one (priced per pack only), the pack the list would take - it has its own "Sæt på listen".
  const listPack = family.listPack ? family.packs.find((p) => p.productId === family.listPack!.productId) : undefined;
  const shown = bestPack ?? listPack ?? family.packs[0];
  const listItem = family.best ? cheapestListItem(family) : null;
  const others = family.packs.filter((p) => p !== shown);
  return (
    // Subgrid: the card's three parts (header, pack, variants) share rows with its neighbour, so the
    // variants buttons sit at the same height; opening one only grows the last row. gap-y-0: the
    // parts are spaced by their own margins, not the list's gap.
    <li className="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-xl border border-zinc-200 bg-zinc-100 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">{family.name}</h2>
          {family.best && (
            <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
              Billigst <strong className="text-emerald-700 dark:text-emerald-400">{perUnitText(family.best.pricePerUnit, family.best.unit, family)}</strong>{" "}
              hos {shopName(shops, family.best.shopId)}
              {family.best.deal && <span className="text-zinc-500"> ved {family.best.deal.quantity} stk.</span>}
              {family.best.coupon && <CouponBadge />}
            </p>
          )}
        </div>
        {listItem && <AddToBasket label="Billigste på listen" className="shrink-0" item={listItem} />}
      </div>
      <ul className="mt-3 border-t border-zinc-300 dark:border-zinc-800">
        <PackRow pack={shown} shops={shops} page={page} />
      </ul>
      {others.length > 0 ? (
        <details open={openVariants} className="group/sizes mt-1 min-w-0 self-start">
          {/* A preview, not just a label: photos and pack sizes show there's more to see.
              min-w-0 on the card and here lets the one-line size summary shrink instead of widening the page. */}
          <summary className="flex min-h-[3.875rem] cursor-pointer list-none items-center gap-3 rounded-lg border border-zinc-300 bg-white p-2 pr-3 transition-colors hover:border-emerald-600 hover:bg-emerald-100 group-open/sizes:mb-1 [&::-webkit-details-marker]:hidden">
            <VariantThumbs packs={others} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                <span className="group-open/sizes:hidden">Se {others.length} andre varianter</span>
                <span className="hidden group-open/sizes:inline">Skjul andre varianter</span>
              </span>
              <span className="block truncate text-xs text-zinc-600">{variantSummary(others)}</span>
            </span>
            <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-zinc-500 transition-transform group-open/sizes:rotate-180" />
          </summary>
          <ul className="divide-y divide-zinc-300 border-t border-zinc-300 dark:divide-zinc-800 dark:border-zinc-800">
            {others.map((p) => (
              <PackRow key={p.productId} pack={p} shops={shops} page={page} />
            ))}
          </ul>
        </details>
      ) : (
        // Keeps the third row filled so the subgrid stays three rows.
        <div />
      )}
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
  // The headline is the price per liter/kg: packs differ in size, so it's the number to compare
  // between variants (a 9 kr. bottle vs a 69 kr. crate). The pack price is what you pay, shown under it.
  const perUnit = best.pricePerUnit !== null && pack.contentUnit ? (best.pricePerUnit * low) / best.price : null;
  const deal = dealPerPiece(best) !== null ? best.multiBuy : null;
  // "40 kapsler" rather than the catalog's "40 stk." in piece families, "100 ml" rather than "0,1 l" for perfume.
  const label = mlWords(pieceWords(pack.packLabel, pack.pieceLabel), pack.displayPer);
  const shown = perUnit !== null && pack.contentUnit ? shownPerUnit(perUnit, pack.contentUnit, pack) : null;
  const packPrice = (
    <>
      {kr(low)} kr.{low < best.price && " stk."}
    </>
  );
  return (
    <li className="py-3">
      {/* Photo left, text and button right; the button sits under the price so the photo can be large. */}
      <div className="flex gap-3">
        <ZoomablePhoto url={pack.imageUrl} name={pack.name} pack={label} className="h-24 w-24 sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {pack.name}
            {/* The pack size is in the price line below ("69,95 kr. for 24 x 0,33 l") when there is one. */}
            {label && perUnit === null && <span className="font-normal text-zinc-500"> · {label}</span>}
          </p>
          {perUnit !== null && pack.contentUnit ? (
            <>
              <p className="mt-1">
                <strong className="text-lg tabular-nums">{kr(shown!.price)} kr.</strong>{" "}
                <span className="text-sm font-medium">{shown!.label}</span>
                {deal && <span className="text-sm text-zinc-500"> ved {deal.quantity} stk.</span>}
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {/* "ved 3 stk." in the headline already says this is the deal rate. */}
                <span className="tabular-nums">{kr(low)} kr.</span>
                {label && <> for {label}</>} hos {shopName(shops, best.shopId)}
                {ties > 0 && <span className="text-zinc-500"> (+{ties} til samme pris)</span>}
              </p>
            </>
          ) : (
            // Nothing to measure per liter/kg: the pack price is the comparison. In a piece family whose
            // pieces aren't counted, say it's the price for the pack - never a price per kg/l there.
            <p className="mt-1 text-sm">
              <strong className="text-lg tabular-nums">{packPrice}</strong>
              {pack.compareUnit === "piece" && low === best.price && " for pakken"} hos {shopName(shops, best.shopId)}
              {ties > 0 && <span className="text-zinc-500"> (+{ties} til samme pris)</span>}
            </p>
          )}
          <OfferDetails offer={best} pack={pack} page={page} perUnit={false} />
          <AddToBasket
            label="Sæt på listen"
            variant="secondary"
            className="mt-2"
            item={{ key: `p-${pack.productId}`, kind: "product", productId: pack.productId, label: pack.name, quantity: 1, imageUrl: pack.imageUrl ?? undefined }}
          />
        </div>
      </div>
      {rest.length > 0 && (
        <details className="group/shops mt-1">
          <summary className="-mx-1 flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-1 text-sm text-zinc-700 [&::-webkit-details-marker]:hidden dark:text-zinc-300">
            <span aria-hidden className="inline-block text-xs transition-transform group-open/shops:rotate-90">
              ▶
            </span>
            Priser i alle {pack.offers.length} butikker
          </summary>
          <ul className="flex flex-col gap-1.5 pb-1">
            {/* The index too: a newsletter shop can list the same pack twice with the same link. */}
            {pack.offers.map((o, i) => (
              <li key={`${o.shopId}-${o.url}-${i}`} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-semibold underline-offset-2 hover:underline">
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
/** perUnit: false where the price per liter/kg is already the headline above. */
function OfferDetails({ offer: o, pack, page, perUnit = true }: { offer: Offer; pack: Pack; page: string; perUnit?: boolean }) {
  const deal = dealPerPiece(o) !== null ? o.multiBuy : null;
  return (
    <div className="text-xs text-zinc-500">
      {perUnit && o.pricePerUnit !== null && pack.contentUnit && (
        <span>
          {perUnitText((o.pricePerUnit * effectivePrice(o)) / o.price, pack.contentUnit, pack)}
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

/** "149,99 kr. pr. 100 ml", "9,85 kr. pr. liter", "0,70 kr. pr. tab" - see perUnit() in format.ts. */
function perUnitText(price: number, unit: Unit, of: { pieceLabel: string | null; displayPer: DisplayPer | null }): string {
  const p = shownPerUnit(price, unit, of);
  return `${kr(p.price)} kr. ${p.label}`;
}

/** Up to three overlapping photos of the other variants, with "+N" for the rest. */
function VariantThumbs({ packs }: { packs: Pack[] }) {
  const photos = packs.flatMap((p) => (p.imageUrl ? [p.imageUrl] : [])).slice(0, 3);
  const more = packs.length - photos.length;
  return (
    <span aria-hidden className="flex shrink-0 -space-x-3">
      {photos.map((url, i) => (
        // Index key: two variants can share a photo.
        <span key={i} className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-0.5" />
        </span>
      ))}
      {more > 0 && (
        <span className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-200 bg-zinc-200 text-xs font-semibold text-zinc-700">
          +{more}
        </span>
      )}
    </span>
  );
}

/** "24 x 0,33 l, 0,5 l, 4 x 1,5 l og flere" - the pack sizes on offer, so people see the choice. */
function variantSummary(packs: Pack[]): string {
  const labels = [...new Set(packs.flatMap((p) => (p.packLabel ? [mlWords(pieceWords(p.packLabel, p.pieceLabel), p.displayPer)] : [])))];
  if (!labels.length) return "Andre pakninger og størrelser";
  return labels.slice(0, 3).join(", ") + (labels.length > 3 ? " og flere" : "");
}

