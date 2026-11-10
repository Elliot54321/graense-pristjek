/**
 * Error reports and search statistics for /admin. Reads private tables with the
 * secret key - only call after requireAdmin()/isAdmin().
 */
import { adminClient, fetchAll } from "@/db/admin";

export interface Report {
  id: number;
  message: string;
  shopId: string | null;
  product: string | null;
  price: number | null;
  page: string | null;
  createdAt: string;
}

export interface SearchCount {
  query: string;
  count: number;
}

const DAYS = 30;

export async function loadInsights() {
  const db = adminClient();
  const { data: reports, error } = await db
    .from("feedback")
    .select("id, message, shop_id, product, price, page, created_at")
    .eq("handled", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();
  const searches = await fetchAll<{ id: number; query: string; results: number }>((f, t) =>
    db.from("search_log").select("id, query, results").gte("created_at", since).order("id").range(f, t),
  );
  const count = (rows: typeof searches) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.query, (m.get(r.query) ?? 0) + 1);
    return [...m].map(([query, n]) => ({ query, count: n })).sort((a, b) => b.count - a.count);
  };

  return {
    reports: reports.map(
      (r): Report => ({
        id: r.id,
        message: r.message,
        shopId: r.shop_id,
        product: r.product,
        price: r.price === null ? null : Number(r.price),
        page: r.page,
        createdAt: r.created_at,
      }),
    ),
    days: DAYS,
    totalSearches: searches.length,
    topSearches: count(searches).slice(0, 25),
    emptySearches: count(searches.filter((s) => s.results === 0)).slice(0, 50),
  };
}
