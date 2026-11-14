import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { Suspense } from "react";
import { BasketLink } from "@/components/basket-link";
import { Freshness } from "@/components/freshness";
import { MobileMenu, SiteNav } from "@/components/site-nav";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Pages set their own title ("Din indkøbsliste"); the template adds the site name.
  title: { default: `${SITE_NAME} – find den billigste grænsebutik`, template: `%s – ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // The share card (app/opengraph-image.tsx) is added automatically.
  openGraph: { siteName: SITE_NAME, locale: "da_DK", type: "website", url: "/", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
          <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
            {/* One word like the domain, but two-toned so "Pris" and "grænsen" read apart. */}
            <Link href="/" aria-label={SITE_NAME} className="text-2xl font-bold tracking-tight sm:text-3xl">
              <span aria-hidden>
                Pris<span className="text-emerald-600">grænsen</span>
              </span>
            </Link>
            <SiteNav />
            <div className="flex items-center gap-2 md:ml-auto">
              <BasketLink />
              <MobileMenu />
            </div>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5">{children}</div>
        {/* Full-width band; inside, the price info and the page links share the width on wider screens. */}
        <footer className="mt-10 border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 text-sm text-zinc-600 md:grid-cols-[2fr_1fr]">
            <div>
              <p className="text-base font-bold tracking-tight text-zinc-900">
                Pris<span className="text-emerald-600">grænsen</span>
              </p>
              <p className="mt-2">
                Sammenligner priserne hos Fleggaard, Calle, Poetzsch, Scandinavian Park og BorderShop, så du kan se, hvor
                din indkøbsliste bliver billigst. Siden er uafhængig og ikke tilknyttet nogen af butikkerne.
              </p>
              <div className="mt-3 text-xs text-zinc-500">
                Priserne hentes fra butikkernes hjemmesider og aviser hver nat og kan afvige fra priserne i butikken.
                <Suspense>
                  <Freshness />
                </Suspense>
              </div>
            </div>
            <nav aria-label="Sidefod">
              <p className="font-semibold text-zinc-900">Sider</p>
              <ul className="mt-2 flex flex-col">
                {[
                  { href: "/guide", label: "Sådan gør du" },
                  { href: "/om", label: "Om os – priser og dine data" },
                  { href: "/kontakt", label: "Kontakt" },
                  { href: "/liste", label: "Din indkøbsliste" },
                ].map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-9 items-center underline-offset-2 hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </footer>
        {/* Cookie-free page-view counts (Vercel Web Analytics); no consent banner needed. */}
        <Analytics />
      </body>
    </html>
  );
}
