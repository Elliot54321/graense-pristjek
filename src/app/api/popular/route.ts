/**
 * GET /api/popular?side=N -> { families: FamilyResult[] }
 *
 * Page N of the front page's popular items (page 0 is rendered with the page itself).
 * Read-only and cached for an hour in popularFamilies(); an empty list means the end.
 */
import { popularFamilies } from "@/catalog/data";

/** Far beyond what anyone scrolls to; stops silly requests. */
const MAX_PAGE = 200;

export async function GET(request: Request) {
  const page = Number(new URL(request.url).searchParams.get("side"));
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    return Response.json({ error: "Ugyldig side" }, { status: 400 });
  }
  return Response.json({ families: await popularFamilies(page) });
}
