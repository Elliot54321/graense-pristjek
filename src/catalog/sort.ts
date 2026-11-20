/**
 * Sort orders for search and category results (2026-11-20). The id is the `sorter` URL value
 * (/api/families?sorter=enhedspris); the label is the dropdown text. data.ts sorts the whole
 * result list before it's cut into pages, so "Vis flere" continues the same order.
 * Plain data, no server imports - the browser imports it too.
 */
export const SORTS = [
  { id: "populaer", label: "Populære" }, // default, the ranking the site has always used
  { id: "enhedspris", label: "Laveste pris pr. enhed" },
  { id: "pakkepris", label: "Laveste pakkepris" },
  { id: "hoejest", label: "Højeste pris pr. enhed" },
  { id: "forskel", label: "Størst prisforskel" },
  { id: "tilbud", label: "Tilbud først" },
  { id: "navn", label: "Navn A–Å" },
] as const;

export type SortId = (typeof SORTS)[number]["id"];

export const DEFAULT_SORT: SortId = "populaer";

/** The sort for a URL value: undefined for an unknown one (the caller decides: 400, or the default). */
export function parseSort(v: string | null | undefined): SortId | undefined {
  if (v === null || v === undefined || v === "") return DEFAULT_SORT;
  return SORTS.find((s) => s.id === v)?.id;
}
