"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { categoryIcon, categoryStyle } from "./category-style";
import type { NavCategory } from "./visible-categories";

const LINKS = [
  { href: "/guide", label: "Sådan gør du" },
  { href: "/om", label: "Om os" },
  { href: "/kontakt", label: "Kontakt" },
];

/** Calls `close` on a pointer press outside `ref` or on Escape, while `active`. */
function useDismiss(active: boolean, ref: React.RefObject<HTMLElement | null>, close: (byEscape: boolean) => void) {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref, close]);
}

/** The header links on wider screens: "Kategorier" (a dropdown) and the info pages. */
export function SiteNav({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hovedmenu" className="hidden items-center gap-1 md:flex">
      <CategoryMenu categories={categories} />
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname === l.href ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 ${pathname === l.href ? "bg-zinc-100" : "text-zinc-700"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Desktop "Kategorier": opens on hover and on click, as a panel under the header with
 * every category and its subcategories. Closes on Escape (focus back on the button),
 * a click outside, moving the mouse away, tabbing out, or opening a page.
 */
function CategoryMenu({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  // The page the menu was opened on: navigating elsewhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // When hover opened it: a click right after (the same gesture) shouldn't close it again.
  const hoverOpenedAt = useRef(0);
  const [close] = useState(() => (byEscape: boolean) => {
    setOpenOn(null);
    if (byEscape) button.current?.focus();
  });
  useDismiss(open, wrapper, close);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  return (
    <div
      ref={wrapper}
      onMouseEnter={() => {
        clearTimeout(leaveTimer.current);
        if (!open) {
          hoverOpenedAt.current = Date.now();
          setOpenOn(pathname);
        }
      }}
      // A short delay, so crossing the gap between the button and the panel doesn't close it.
      onMouseLeave={() => {
        leaveTimer.current = setTimeout(() => setOpenOn(null), 200);
      }}
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget as Node | null)) setOpenOn(null);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="category-menu"
        onClick={() => {
          if (open && Date.now() - hoverOpenedAt.current < 500) return;
          setOpenOn(open ? null : pathname);
        }}
        className={`flex cursor-pointer items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 ${
          open || pathname.startsWith("/kategori") ? "bg-zinc-100" : "text-zinc-700"
        }`}
      >
        Kategorier
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        // Positioned against the header's inner container, so it spans the page width.
        <div id="category-menu" className="absolute inset-x-4 top-full z-20 rounded-b-xl border border-t-0 border-zinc-200 bg-white p-5 shadow-lg">
          <ul className="grid grid-cols-4 gap-x-6 gap-y-6">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              const style = categoryStyle(c.color);
              return (
                <li key={c.slug}>
                  <Link href={`/kategori/${c.slug}`} className="flex items-center gap-2 font-semibold hover:text-emerald-700">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
                      <Icon aria-hidden className={`h-4 w-4 ${style.text}`} strokeWidth={2} />
                    </span>
                    {c.label}
                  </Link>
                  <ul className="mt-1.5 pl-10">
                    {c.subcategories.map((s) => (
                      <li key={s.slug}>
                        <Link
                          href={`/kategori/${c.slug}/${s.slug}`}
                          className="block py-1 text-sm text-zinc-600 hover:text-emerald-700 hover:underline underline-offset-2"
                        >
                          {s.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Phones: a menu button that opens categories (expandable) and the info pages in a panel under the header. */
export function MobileMenu({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const ref = useRef<HTMLDivElement>(null);
  const [close] = useState(() => () => setOpenOn(null));
  useDismiss(open, ref, close);

  const row = "flex min-h-12 items-center border-t border-zinc-100 text-base font-medium";
  return (
    <div ref={ref} className="md:hidden">
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Luk menu" : "Menu"}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300"
      >
        {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
      </button>
      {open && (
        // Scrolls inside itself when the categories are open, so the header stays put.
        <nav
          id="mobile-menu"
          aria-label="Hovedmenu"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-zinc-200 bg-white px-4 pb-3 shadow-sm"
        >
          <details className="group/cats" open={pathname.startsWith("/kategori")}>
            <summary className={`${row} cursor-pointer list-none justify-between border-t-0 [&::-webkit-details-marker]:hidden`}>
              Kategorier
              <ChevronDown aria-hidden className="h-5 w-5 text-zinc-500 transition-transform group-open/cats:rotate-180" />
            </summary>
            <ul className="pb-2">
              {categories.map((c) => {
                const Icon = categoryIcon(c.icon);
                const style = categoryStyle(c.color);
                return (
                  <li key={c.slug}>
                    <details className="group/cat" open={pathname.startsWith(`/kategori/${c.slug}`)}>
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 pl-1 [&::-webkit-details-marker]:hidden">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
                          <Icon aria-hidden className={`h-4 w-4 ${style.text}`} strokeWidth={2} />
                        </span>
                        <span className="flex-1">{c.label}</span>
                        <ChevronDown aria-hidden className="h-4 w-4 text-zinc-400 transition-transform group-open/cat:rotate-180" />
                      </summary>
                      <ul className="mb-1 ml-5 border-l border-zinc-200 pl-6">
                        <li>
                          <Link
                            href={`/kategori/${c.slug}`}
                            className={`flex min-h-10 items-center text-sm font-medium ${pathname === `/kategori/${c.slug}` ? "text-emerald-700" : ""}`}
                          >
                            Alle {c.label.toLowerCase()}
                          </Link>
                        </li>
                        {c.subcategories.map((s) => {
                          const href = `/kategori/${c.slug}/${s.slug}`;
                          return (
                            <li key={s.slug}>
                              <Link
                                href={href}
                                aria-current={pathname === href ? "page" : undefined}
                                className={`flex min-h-10 items-center text-sm ${pathname === href ? "font-medium text-emerald-700" : "text-zinc-700"}`}
                              >
                                {s.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </details>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`${row} ${pathname === l.href ? "text-emerald-700" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
