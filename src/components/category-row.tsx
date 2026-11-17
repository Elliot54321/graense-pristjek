import Link from "next/link";
import { categoryIcon, categoryStyle } from "./category-style";
import { visibleCategories } from "./visible-categories";

/**
 * The category tiles under the search box (categories with nothing on sale are left out).
 * large: the front page's big coloured tiles, 4 per row on phones and all 8 in one row
 * on wider screens. Otherwise (search and category pages) a compact row that scrolls
 * sideways on phones. `current`: the open category's slug.
 */
export async function CategoryRow({ current, large = false }: { current?: string; large?: boolean }) {
  const categories = await visibleCategories();

  if (large) {
    return (
      <nav aria-label="Kategorier" className="mt-6 sm:mt-8">
        <ul className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const style = categoryStyle(c.color);
            return (
              <li key={c.slug}>
                <Link
                  href={`/kategori/${c.slug}`}
                  className={`flex h-full flex-col items-center gap-2 rounded-2xl border px-1 py-3 text-center transition-colors sm:py-4 ${style.tile}`}
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14 ${style.badge}`}>
                    <Icon aria-hidden className={`h-7 w-7 sm:h-8 sm:w-8 ${style.text}`} strokeWidth={1.75} />
                  </span>
                  <span className="text-xs font-medium leading-tight text-zinc-800 sm:text-sm">{c.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <div className="relative">
      <nav aria-label="Kategorier" className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:px-0">
        <ul className="flex min-w-max gap-1 sm:min-w-0 sm:justify-between">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const style = categoryStyle(c.color);
            const active = c.slug === current;
            return (
              <li key={c.slug} className="sm:flex-1">
                <Link
                  href={`/kategori/${c.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-[76px] flex-col items-center gap-1.5 rounded-xl px-0.5 py-2.5 text-center text-xs leading-tight sm:w-auto sm:text-sm hover:bg-zinc-100 ${
                    active ? `font-semibold ${style.active}` : ""
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${style.badge}`}>
                    <Icon aria-hidden className={`h-5 w-5 ${style.text}`} strokeWidth={1.75} />
                  </span>
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
