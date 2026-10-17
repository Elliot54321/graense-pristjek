import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Supabase's default max rows per request. */
export const PAGE_SIZE = 1000;

/** Server-side client with the secret key: bypasses RLS, never use in the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Read every row of a query, one page at a time. `page(from, to)` must apply a
 * stable order (e.g. by id) so rows aren't skipped or repeated between pages.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
