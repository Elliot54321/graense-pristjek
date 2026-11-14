/**
 * GET /api/families?q=rødvin&side=N   or   ?kategori=vin&side=N  ->  { families, more }
 *
 * Page N (1, 2, ...) of search or category results; page 0 comes with the page itself.
 * `more`: whether later pages exist (a page can be short when items aren't sold right now). Cached on Vercel's CDN for an hour like /api/popular,
 * since the serverless functions don't keep the in-memory cache between requests.
 */
import { categoryBySlug } from "@/catalog/categories";
import { categoryFamilies, categoryHasMore, searchFamilies, searchHasMore } from "@/catalog/data";

/** Far beyond what anyone scrolls to; stops silly requests. */
const MAX_PAGE = 200;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("side"));
  const query = params.get("q")?.trim().slice(0, 100);
  const category = categoryBySlug(params.get("kategori") ?? "");
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE || (!query && !category)) {
    return Response.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  }
  const [families, more] = query
    ? await Promise.all([searchFamilies(query, page), searchHasMore(query, page)])
    : await Promise.all([categoryFamilies(category!.id, page), categoryHasMore(category!.id, page)]);
  return Response.json({ families, more }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
