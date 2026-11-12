import Link from "next/link";

/**
 * Small "Fejl?" link next to a price; opens the report form pre-filled with what it's about.
 * The padding (cancelled by negative margins) gives a finger-sized tap area without taking space.
 */
export function ReportLink({ shop, product, price, page }: { shop: string; product: string; price: number; page: string }) {
  const q = new URLSearchParams({ butik: shop, vare: product, pris: String(price), side: page });
  return (
    <Link
      href={`/fejl?${q}`}
      className="-my-2 ml-1 inline-block px-1.5 py-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      aria-label={`Rapportér fejl i prisen på ${product}`}
    >
      Fejl?
    </Link>
  );
}
