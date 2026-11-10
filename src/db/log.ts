/**
 * Writes from the website to private tables, with the secret key (server only).
 * Logging must never break the page, so failures are only reported to the server log.
 */
import { adminClient } from "./admin";

/** One search and how many families it found (no IP or other personal data). */
export async function logSearch(query: string, results: number) {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
  if (!q) return;
  try {
    const { error } = await adminClient().from("search_log").insert({ query: q, results });
    if (error) console.error("search_log insert failed:", error.message);
  } catch (e) {
    console.error("search_log insert failed:", e);
  }
}
