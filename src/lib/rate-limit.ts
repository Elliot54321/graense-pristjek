/**
 * A simple per-visitor rate limit, kept in the server's memory. It stops obvious
 * abuse (a script hammering the price comparison) without an extra service.
 *
 * Not exact: Vercel runs several server instances, each counting on its own, and a
 * restart forgets everything - fine at this size. The IP address is only held in
 * memory for the length of the window and never stored.
 */
const hits = new Map<string, number[]>();
let lastSweep = 0;

/** True if this visitor may make another request: at most `limit` per `windowMs`. */
export function allow(bucket: string, ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${bucket}|${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = recent.length < limit;
  if (ok) recent.push(now);
  hits.set(key, recent);

  // Forget visitors who have been quiet, so the map doesn't grow forever.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, times] of hits) if (!times.some((t) => now - t < 10 * 60_000)) hits.delete(k);
  }
  return ok;
}

/** The visitor's IP as Vercel passes it on (first address in x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
