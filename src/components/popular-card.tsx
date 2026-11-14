import Link from "next/link";
import type { FamilyResult } from "@/catalog/types";
import { kr, PER_UNIT_LABEL } from "@/lib/format";

/**
 * One popular item: photo, name and the cheapest price per liter/kg with its shop.
 * Opens the search for the item, where it can go on the list. Used on the server
 * (first page) and in the browser ("Vis flere varer").
 */
export function PopularCard({ family: f, shopName }: { family: FamilyResult; shopName: (id: string) => string }) {
  // The photo of the most widely sold pack - the one people recognise - not necessarily the
  // cheapest per liter (for Jägermeister that's a 3-litre bottle).
  const image = [...f.packs].filter((p) => p.imageUrl).sort((a, b) => b.offers.length - a.offers.length)[0]?.imageUrl ?? null;
  return (
    <li>
      <Link
        href={`/sog?q=${encodeURIComponent(f.name)}`}
        className="flex h-full flex-col rounded-xl border border-zinc-200 bg-zinc-100 p-3 hover:border-zinc-400"
      >
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white">
          {image && (
            // Linked from the shop's site like the search photos; see ProductPhoto in family-list.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
          )}
        </div>
        <h3 className="mt-2 font-semibold leading-snug">{f.name}</h3>
        {f.best && (
          <p className="mt-auto pt-1 text-sm">
            <strong className="text-emerald-700">
              {kr(f.best.pricePerUnit)} kr. {PER_UNIT_LABEL[f.best.unit]}
            </strong>
            <span className="block text-xs text-zinc-600">
              hos {shopName(f.best.shopId)}
              {f.best.deal && ` ved ${f.best.deal.quantity} stk.`}
            </span>
          </p>
        )}
      </Link>
    </li>
  );
}
