"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/guide", label: "Sådan gør du" },
  { href: "/om", label: "Om os" },
  { href: "/kontakt", label: "Kontakt" },
];

/** The header links: inline next to the logo on wider screens, behind a menu button on phones. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hovedmenu" className="hidden items-center gap-1 md:flex">
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

/** Phones: a menu button that opens the same links in a panel under the header. */
export function MobileMenu() {
  const pathname = usePathname();
  // The page the menu was opened on: navigating elsewhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const ref = useRef<HTMLDivElement>(null);

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpenOn(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

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
        <nav
          id="mobile-menu"
          aria-label="Hovedmenu"
          className="absolute inset-x-0 top-full border-b border-zinc-200 bg-white px-4 pb-3 shadow-sm"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`flex min-h-12 items-center border-t border-zinc-100 text-base font-medium first:border-t-0 ${
                pathname === l.href ? "text-emerald-700" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
