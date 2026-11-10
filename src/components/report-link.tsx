import Link from "next/link";

/** Small "Fejl?" link next to a price; opens the report form pre-filled with what it's about. */
export function ReportLink({ shop, product, price, page }: { shop: string; product: string; price: number; page: string }) {
  const q = new URLSearchParams({ butik: shop, vare: product, pris: String(price), side: page });
  return (
    <Link
      href={`/fejl?${q}`}
      className="ml-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
      aria-label={`Rapportér fejl i prisen på ${product}`}
    >
      Fejl?
    </Link>
  );
}
