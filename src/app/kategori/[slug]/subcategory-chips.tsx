"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Props = { categorySlug: string; categoryLabel: string; subs: { slug: string; label: string }[]; current: string };

/**
 * The subcategory chips ("Alle", "Rødvin", ...). They keep the chosen order (?sorter=), so
 * moving between subcategories doesn't reset the sort. The order is read in the browser, so
 * the page stays prerendered; the fallback (and the static HTML) links without it.
 */
export function SubcategoryChips(props: Props) {
  const sorter = useSearchParams().get("sorter");
  return <Chips {...props} query={sorter ? `?sorter=${encodeURIComponent(sorter)}` : ""} />;
}

export function Chips({ categorySlug, categoryLabel, subs, current, query = "" }: Props & { query?: string }) {
  return (
    // Scrolls sideways on phones (up to 10 subcategories), wraps on wider screens.
    <nav aria-label={`Underkategorier i ${categoryLabel}`} className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
        {[{ slug: "", label: "Alle" }, ...subs].map((s) => {
          const active = current === s.slug;
          return (
            <li key={s.slug}>
              <Link
                href={`/kategori/${categorySlug}${s.slug ? `/${s.slug}` : ""}${query}`}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
                  active
                    ? "border-zinc-700 bg-zinc-700 text-white"
                    : "border-zinc-300 bg-white hover:border-emerald-600 hover:bg-emerald-100 hover:text-emerald-900"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
