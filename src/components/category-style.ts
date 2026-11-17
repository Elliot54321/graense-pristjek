/**
 * Icons and colours for the categories (names chosen in src/catalog/categories.ts).
 * Tailwind only ships classes it finds written out in full, so every colour's classes
 * are spelled out here rather than built from the name.
 */
import { Beer, Candy, CupSoda, Martini, Popcorn, ShoppingBasket, SprayCan, Tag, Wine, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Beer, Candy, CupSoda, Martini, Popcorn, ShoppingBasket, SprayCan, Wine };

/** Falls back to a plain tag if categories.ts names an icon that isn't mapped here yet. */
export const categoryIcon = (name: string): LucideIcon => ICONS[name] ?? Tag;

/** tile: the large front-page tile; badge: the round icon background; text: icon colour; active: the open category in the small row. */
interface Style {
  tile: string;
  badge: string;
  text: string;
  active: string;
}

const STYLES: Record<string, Style> = {
  amber: { tile: "border-amber-200 bg-amber-50 hover:border-amber-400", badge: "bg-amber-100", text: "text-amber-700", active: "bg-amber-50 ring-1 ring-amber-300" },
  sky: { tile: "border-sky-200 bg-sky-50 hover:border-sky-400", badge: "bg-sky-100", text: "text-sky-700", active: "bg-sky-50 ring-1 ring-sky-300" },
  rose: { tile: "border-rose-200 bg-rose-50 hover:border-rose-400", badge: "bg-rose-100", text: "text-rose-700", active: "bg-rose-50 ring-1 ring-rose-300" },
  violet: { tile: "border-violet-200 bg-violet-50 hover:border-violet-400", badge: "bg-violet-100", text: "text-violet-700", active: "bg-violet-50 ring-1 ring-violet-300" },
  pink: { tile: "border-pink-200 bg-pink-50 hover:border-pink-400", badge: "bg-pink-100", text: "text-pink-700", active: "bg-pink-50 ring-1 ring-pink-300" },
  orange: { tile: "border-orange-200 bg-orange-50 hover:border-orange-400", badge: "bg-orange-100", text: "text-orange-700", active: "bg-orange-50 ring-1 ring-orange-300" },
  emerald: { tile: "border-emerald-200 bg-emerald-50 hover:border-emerald-400", badge: "bg-emerald-100", text: "text-emerald-700", active: "bg-emerald-50 ring-1 ring-emerald-300" },
  teal: { tile: "border-teal-200 bg-teal-50 hover:border-teal-400", badge: "bg-teal-100", text: "text-teal-700", active: "bg-teal-50 ring-1 ring-teal-300" },
};

const ZINC: Style = { tile: "border-zinc-200 bg-zinc-50 hover:border-zinc-400", badge: "bg-zinc-100", text: "text-zinc-700", active: "bg-zinc-100 ring-1 ring-zinc-300" };

export const categoryStyle = (color: string): Style => STYLES[color] ?? ZINC;
