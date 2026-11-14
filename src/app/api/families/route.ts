/**
 * GET /api/families?q=rødvin&fra=N   or   ?kategori=vin&fra=N  ->  { families, next }
 *
 * The page of search or category results starting at position N of the ranked list
 * (the first page comes with the page itself; each page's `next` says where the
 * following one starts, null at the end). Cached on Vercel's CDN for an hour, since the
 * serverless functions don't keep the in-memory cache between requests.
 */
import { categoryBySlug } from "@/catalog/categories";
import { categoryFamilies, searchFamilies } from "@/catalog/data";

/** Far beyond any real list; stops silly requests. */
const MAX_FROM = 50_000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = Number(params.get("fra"));
  const query = params.get("q")?.trim().slice(0, 100);
  const category = categoryBySlug(params.get("kategori") ?? "");
  if (!Number.isInteger(from) || from < 1 || from > MAX_FROM || (!query && !category)) {
    return Response.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  }
  const page = query ? await searchFamilies(query, from) : await categoryFamilies(category!.id, from);
  return Response.json(page, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
