/**
 * GET /api/families?q=rødvin&fra=N   or   ?kategori=vin[&under=rodvin]&fra=N   [&sorter=<id>]  ->  { families, next }
 *
 * The page of search or category results starting at position N of the ranked list
 * (the first page comes with the page itself; each page's `next` says where the
 * following one starts, null at the end). `under` is a subcategory slug of `kategori`
 * (categories.ts); an unknown one is a bad request. `sorter` is a sort id from sort.ts
 * (omitted = "populaer", the default order); an unknown one is a bad request. With a sort, `fra=0`
 * is allowed too: the page itself is prerendered in the default order, so the UI loads the first
 * page of any other order here. Cached on Vercel's CDN for an hour,
 * since the serverless functions don't keep the in-memory cache between requests.
 */
import { categoryBySlug, subcategoryBySlug } from "@/catalog/categories";
import { categoryFamilies, searchFamilies } from "@/catalog/data";
import { DEFAULT_SORT, parseSort } from "@/catalog/sort";

/** Far beyond any real list; stops silly requests. */
const MAX_FROM = 50_000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = Number(params.get("fra"));
  const query = params.get("q")?.trim().slice(0, 100);
  const category = categoryBySlug(params.get("kategori") ?? "");
  const under = params.get("under");
  const subcategory = category && under ? subcategoryBySlug(category, under) : undefined;
  const sort = parseSort(params.get("sorter"));
  const firstAllowed = sort && sort !== DEFAULT_SORT ? 0 : 1;
  if (!sort || !Number.isInteger(from) || from < firstAllowed || from > MAX_FROM || (!query && !category) || (under && !query && !subcategory)) {
    return Response.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  }
  const page = query ? await searchFamilies(query, from, sort) : await categoryFamilies(category!.id, from, subcategory?.id, sort);
  return Response.json(page, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
