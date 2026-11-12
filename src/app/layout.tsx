import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { Suspense } from "react";
import { BasketLink } from "@/components/basket-link";
import { Freshness } from "@/components/freshness";
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
  // Pages set their own title ("Din kurv"); the template adds the site name.
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
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              {SITE_NAME}
            </Link>
            <BasketLink />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5">{children}</div>
        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-zinc-500">
          Priserne er hentet fra butikkernes hjemmesider hver nat og kan afvige fra priserne i butikken.
          <Suspense>
            <Freshness />
          </Suspense>
          <p className="mt-2">
            <Link href="/om" className="underline underline-offset-2">
              Om siden
            </Link>{" "}
            – hvor priserne kommer fra, og hvordan vi håndterer dine data.{" "}
            <Link href="/fejl" className="underline underline-offset-2">
              Fundet en fejl?
            </Link>
          </p>
        </footer>
        {/* Cookie-free page-view counts (Vercel Web Analytics); no consent banner needed. */}
        <Analytics />
      </body>
    </html>
  );
}
