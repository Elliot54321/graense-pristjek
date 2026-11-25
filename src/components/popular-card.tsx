"use client";

import { X } from "lucide-react";
import { useRef } from "react";
import { dealPerPiece, effectivePrice } from "@/catalog/compare";
import type { FamilyResult, Shop } from "@/catalog/types";
import { kr, smallUnitWords, perUnit, pieceWords } from "@/lib/format";
import { AddToBasket } from "./add-to-basket";
import { useBasket } from "./basket";
import { CouponBadge, MultiBuyBadge, OfferBadge } from "./badges";
import { FamilyCard } from "./family-list";
import { cheapestListItem } from "./list-item";

/**
 * One popular item family on the front page: a big photo, the cheapest price per liter/kg
 * ("fra ...") and two actions. "Vælg variant" (or a tap on the photo/name) opens the
 * family's own search result card in a sheet, variants already open, so people pick their
 * size and packaging there - the same card as search, not a second picker. "Billigste på
 * listen" adds the cheapest per liter/kg like search. Used on the server (first page) and
 * in the browser ("Vis flere varer").
 */
export function PopularCard({ family: f, shops }: { family: FamilyResult; shops: Shop[] }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const shopById = new Map(shops.map((s) => [s.id, s]));
  // The family's photo (Catalog, photos.ts): its most widely sold pack with one - the one people
  // recognise, not necessarily the cheapest per liter (for Jägermeister that's a 3-litre bottle).
  const image = f.imageUrl;
  const sizes = [...new Set(f.packs.flatMap((p) => (p.packLabel ? [smallUnitWords(pieceWords(p.packLabel, p.pieceLabel), p.displayPer)] : [])))];
  // "149,99 kr. pr. 100 ml" for perfume, else per liter/kg/piece.
  const shown = f.best ? perUnit(f.best.pricePerUnit, f.best.unit, f) : null;
  const item = cheapestListItem(f);
  // No price per liter/kg/piece (a piece family whose packs aren't all counted): the cheapest pack price.
  const packOffer = f.best
    ? null
    : f.packs.flatMap((p) => p.offers).sort((a, b) => effectivePrice(a) - effectivePrice(b))[0];
  const open = () => sheet.current?.showModal();
  // Exact variants picked in the sheet ("Sæt på listen" there); the family itself shows as a stepper below.
  const packIds = new Set(f.packs.map((p) => p.productId));
  const variantsOnList = useBasket().filter((i) => i.kind === "product" && packIds.has(i.productId)).length;

  return (
    <li className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-100 p-2.5 sm:p-3">
      <button type="button" onClick={open} className="flex flex-1 cursor-pointer flex-col text-left">
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
          {image && (
            // Linked from the shop's site like the search photos (see zoomable-photo.tsx); here a tap opens the item instead.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-3" />
          )}
          <span className="absolute left-1.5 top-1.5 [&>span]:ml-0">
            <DealBadge family={f} />
          </span>
        </div>
        <h3 className="mt-2 font-semibold leading-snug">{f.name}</h3>
        <p className="text-xs text-zinc-500">{f.packs.length > 1 ? `${f.packs.length} varianter` : sizes[0]}</p>
        {f.best && (
          <p className="mt-auto pt-1.5 leading-tight">
            <span className="text-xs text-zinc-600">fra </span>
            <strong className="text-lg text-emerald-700">{kr(shown!.price)} kr.</strong>{" "}
            <span className="text-xs text-zinc-600">{shown!.label}</span>
            <span className="block truncate text-xs text-zinc-600">
              hos {shopById.get(f.best.shopId)?.name ?? f.best.shopId}
              {f.best.deal && ` ved ${f.best.deal.quantity} stk.`}
            </span>
          </p>
        )}
        {packOffer && (
          <p className="mt-auto pt-1.5 leading-tight">
            <span className="text-xs text-zinc-600">fra </span>
            <strong className="text-lg text-emerald-700">{kr(effectivePrice(packOffer))} kr.</strong>{" "}
            <span className="text-xs text-zinc-600">pr. pakke</span>
            <span className="block truncate text-xs text-zinc-600">hos {shopById.get(packOffer.shopId)?.name ?? packOffer.shopId}</span>
          </p>
        )}
      </button>
      <button
        type="button"
        onClick={open}
        className="mt-2 min-h-10 w-full cursor-pointer rounded-md border border-zinc-700 bg-zinc-700 px-2 text-sm font-medium text-white transition-colors hover:border-emerald-700 hover:bg-emerald-700"
      >
        Vælg variant
      </button>
      {item && <AddToBasket item={item} label={item.kind === "family" ? "Billigste på listen" : "Sæt på listen"} variant="secondary" full className="mt-1.5" />}
      {variantsOnList > 0 && (
        <p className="mt-1 text-xs text-emerald-700">
          {variantsOnList === 1 ? "1 variant" : `${variantsOnList} varianter`} på listen ✓
        </p>
      )}

      {/* A native modal: Escape, focus and the dimmed backdrop come for free. Phones: a sheet
          from the bottom; wider screens: centred. A tap on the backdrop closes it. */}
      <dialog
        ref={sheet}
        aria-label={`Vælg variant af ${f.name}`}
        onClick={(e) => e.target === sheet.current && sheet.current.close()}
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-2xl bg-white p-0 text-left backdrop:bg-black/40 sm:m-auto sm:max-w-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white py-1 pl-4 pr-2">
          <p className="font-semibold">Vælg variant</p>
          <button
            type="button"
            onClick={() => sheet.current?.close()}
            aria-label="Luk"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <ul className="grid p-3">
          <FamilyCard family={f} shops={shopById} page="/" openVariants />
        </ul>
      </dialog>
    </li>
  );
}

/** Offer, multi-buy or coupon on the cheapest pack, as a small label on the photo. */
function DealBadge({ family: f }: { family: FamilyResult }) {
  const pack = f.best ? f.packs.find((p) => p.name === f.best!.productName) : undefined;
  const offer = pack?.offers[0];
  if (!offer) return null;
  if (offer.coupon) return <CouponBadge />;
  if (offer.multiBuy && dealPerPiece(offer) !== null) return <MultiBuyBadge quantity={offer.multiBuy.quantity} price={offer.multiBuy.price} />;
  if (offer.onOffer) return <OfferBadge endsAt={null} />;
  return null;
}
