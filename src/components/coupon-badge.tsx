/**
 * Calle's "KUPONTILBUD" prices only apply with the coupon from its newsletter
 * (bring it or show it on the phone, max 1 per household per day). Shown next to
 * every such price so it's never mistaken for a shelf price.
 */
export const COUPON_NOTE = "Kuponpris: kræver kuponen fra butikkens avis (medbring den eller vis den på mobilen, max 1 pr. husstand pr. dag).";

export function CouponBadge() {
  return (
    <span
      title={COUPON_NOTE}
      className="ml-1 rounded bg-fuchsia-100 px-1 text-xs text-fuchsia-900 dark:bg-fuchsia-900 dark:text-fuchsia-100"
    >
      Kuponpris
    </span>
  );
}
