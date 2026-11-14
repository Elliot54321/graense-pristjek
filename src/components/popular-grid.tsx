import Link from "next/link";
import type { FamilyResult, Shop } from "@/catalog/types";
import { kr, PER_UNIT_LABEL } from "@/lib/format";

/**
 * The front page's popular items: photo, name and the cheapest price per liter/kg with
 * its shop. Each card opens the search for that item, where it can go on the list.
 * Two columns on phones (the first 8), four on wide screens (all 12).
 */
export function PopularGrid({ families, shops }: { families: FamilyResult[]; shops: Shop[] }) {
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Populære varer</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {families.map((f, i) => {
          // The photo of the most widely sold pack - the one people recognise - not necessarily the
          // cheapest per liter (for Jägermeister that's a 3-litre bottle).
          const image = [...f.packs].filter((p) => p.imageUrl).sort((a, b) => b.offers.length - a.offers.length)[0]?.imageUrl ?? null;
          return (
            <li key={f.id} className={i >= 8 ? "hidden sm:block" : undefined}>
              <Link
                href={`/?q=${encodeURIComponent(f.name)}`}
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
                      hos {shopName.get(f.best.shopId) ?? f.best.shopId}
                      {f.best.deal && ` ved ${f.best.deal.quantity} stk.`}
                    </span>
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
