import type { FamilyResult, Shop } from "@/catalog/types";
import { PopularCard } from "./popular-card";
import { PopularMore } from "./popular-more";

/**
 * The front page's popular items: the first page is rendered here, "Vis flere varer"
 * loads the rest a page at a time (/api/popular). Two columns on phones, four on wide screens.
 */
export function PopularGrid({ families, shops }: { families: FamilyResult[]; shops: Shop[] }) {
  const shopNames = Object.fromEntries(shops.map((s) => [s.id, s.name]));
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Populære varer</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {families.map((f) => (
          <PopularCard key={f.id} family={f} shopName={(id) => shopNames[id] ?? id} />
        ))}
      </ul>
      <PopularMore shopNames={shopNames} />
    </section>
  );
}
