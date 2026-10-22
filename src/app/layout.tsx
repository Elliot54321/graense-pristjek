import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { BasketLink } from "@/components/basket-link";
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
  title: "Grænse Pris – find den billigste grænsebutik",
  description: "Sammenlign priser på sodavand, øl, slik og spiritus i grænsebutikkerne.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Grænse Pris
            </Link>
            <BasketLink />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5">{children}</div>
        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-zinc-500">
          Priserne er hentet fra butikkernes hjemmesider hver nat og kan afvige fra priserne i butikken.
        </footer>
      </body>
    </html>
  );
}
