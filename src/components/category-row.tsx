import { Beer, Candy, CupSoda, Martini, ShoppingBasket, SprayCan, Wine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CATEGORIES, type Category } from "@/catalog/categories";

const ICONS: Record<Category["slug"], LucideIcon> = {
  ol: Beer,
  sodavand: CupSoda,
  vin: Wine,
  spiritus: Martini,
  slik: Candy,
  dagligvarer: ShoppingBasket,
  husholdning: SprayCan,
};

/**
 * Icon tiles for the categories, under the search box. On a phone the row scrolls
 * sideways; on wider screens the tiles share the width. `current`: the open category.
 */
export function CategoryRow({ current }: { current?: string }) {
  return (
    <div className="relative">
      <nav aria-label="Kategorier" className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 sm:min-w-0 sm:justify-between">
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c.slug];
            const active = c.slug === current;
            return (
              <li key={c.slug} className="sm:flex-1">
                <Link
                  href={`/kategori/${c.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-[70px] flex-col items-center gap-1.5 rounded-xl px-0.5 py-3 text-xs sm:w-auto sm:text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    active ? "bg-zinc-100 font-semibold dark:bg-zinc-800" : ""
                  }`}
                >
                  <Icon aria-hidden className="h-6 w-6" strokeWidth={1.75} />
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* Fade at the right edge on phones: shows that the row scrolls sideways. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 -right-4 w-10 bg-gradient-to-l from-background sm:hidden" />
    </div>
  );
}
