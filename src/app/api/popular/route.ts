/**
 * GET /api/popular?side=N -> { families: FamilyResult[], shopNames: Record<id, name> }
 *
 * Page N of the front page's popular items (page 0 is part of the prerendered front page);
 * an empty list means the end.
 *
 * Computing the order means reading ~40,000 rows (popularFamilies in catalog/data.ts),
 * ~2.4 s, and Vercel's serverless functions don't keep the in-memory `use cache` between
 * requests. So the response is cached on Vercel's CDN (included in hosting): fresh for an
 * hour, then served from the CDN for up to a day while one request refreshes it in the
 * background. Prices change once a night, so an hour-old page is fine.
 */
import { getShops, popularFamilies } from "@/catalog/data";

/** Far beyond what anyone scrolls to; stops silly requests. */
const MAX_PAGE = 200;

export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("side") ?? "0");
  if (!Number.isInteger(page) || page < 0 || page > MAX_PAGE) {
    return Response.json({ error: "Ugyldig side" }, { status: 400 });
  }
  const [families, shops] = await Promise.all([popularFamilies(page), getShops()]);
  return Response.json(
    { families, shopNames: Object.fromEntries(shops.map((s) => [s.id, s.name])) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
