import type { FamilyResult, Shop } from "@/catalog/types";
import { PopularCard } from "./popular-card";
import { PopularMore } from "./popular-more";

/**
 * The front page's popular items. The first page is part of the prerendered front page;
 * "Vis flere varer" loads the rest from /api/popular (cached on Vercel's CDN).
 * Two columns on phones, four on wide screens. Each card is an item family; its variants open
 * in a sheet (PopularCard).
 */
export function PopularGrid({ families, shops }: { families: FamilyResult[]; shops: Shop[] }) {
  return (
    <section className="mt-8 sm:mt-12">
      <h2 className="text-2xl font-bold tracking-tight">Populære varer</h2>
      <p className="mt-1 text-sm text-zinc-600">Det køber de fleste ved grænsen – vælg selv størrelse og emballage.</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {families.map((f) => (
          <PopularCard key={f.id} family={f} shops={shops} />
        ))}
      </ul>
      {/* With no prerendered items (the build couldn't fetch them), the browser loads from page 0. */}
      <PopularMore shops={shops} startPage={families.length ? 1 : 0} />
    </section>
  );
}
