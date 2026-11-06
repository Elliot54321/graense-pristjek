import { NEWSLETTER_SHOPS } from "@/catalog/compare";
import { getFreshness } from "@/catalog/data";
import { day } from "@/lib/format";

const time = (iso: string) =>
  new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

/** "Priser opdateret 6. november kl. 09.45" - so shoppers can see how fresh the data is. */
export async function Freshness() {
  const all = await getFreshness();
  const newsletters = all.filter((f) => NEWSLETTER_SHOPS.has(f.shop.id));
  const scraped = all.filter((f) => !NEWSLETTER_SHOPS.has(f.shop.id) && f.lastSeen);
  const stale = scraped.filter((f) => f.stale);
  const fresh = scraped.filter((f) => !f.stale);
  // The oldest of the up-to-date shops, so the date is true for all of them.
  const updated = fresh.map((f) => f.lastSeen!).sort()[0];
  return (
    <p className="mt-1">
      {updated && <>Priser opdateret {time(updated)}. </>}
      {stale.map((f) => (
        <span key={f.shop.id}>{f.shop.name}: senest opdateret {time(f.lastSeen!)}. </span>
      ))}
      {/* Newsletters sharing an end date in one phrase: "Calle og Fleggaard: avispriser gældende til 24. november." */}
      {[...Map.groupBy(newsletters, (f) => f.listedUntil ?? "")].map(([until, fs]) => (
        <span key={until}>
          {fs.map((f) => f.shop.name).join(" og ")}: {until ? `avispriser gældende til ${day(until)}` : "ingen gældende avis lige nu"}.{" "}
        </span>
      ))}
    </p>
  );
}
