import { day, kr } from "@/lib/format";

/**
 * Small price labels, styled alike everywhere (search and basket). They never wrap
 * inside themselves, so "Tilbud til 24. november" stays one readable pill.
 */
const PILL = "ml-1 inline-block whitespace-nowrap rounded px-1.5 text-xs font-medium leading-5";

/**
 * Calle's "KUPONTILBUD" prices only apply with the coupon from its newsletter
 * (bring it or show it on the phone, max 1 per household per day). Shown next to
 * every such price so it's never mistaken for a shelf price.
 */
export const COUPON_NOTE = "Kuponpris: kræver kuponen fra butikkens avis (medbring den eller vis den på mobilen, max 1 pr. husstand pr. dag).";

export function CouponBadge() {
  return (
    <span title={COUPON_NOTE} className={`${PILL} bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-400/20 dark:text-fuchsia-200`}>
      Kuponpris
    </span>
  );
}

export function OfferBadge({ endsAt }: { endsAt: string | null }) {
  return (
    <span className={`${PILL} bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200`}>
      Tilbud{endsAt ? ` til ${day(endsAt)}` : ""}
    </span>
  );
}

/** "Ta' 2 for 119,98" */
export function MultiBuyBadge({ quantity, price }: { quantity: number; price: number }) {
  return (
    <span className={`${PILL} bg-sky-100 text-sky-900 dark:bg-sky-400/20 dark:text-sky-200`}>
      {quantity} for {kr(price)}
    </span>
  );
}
