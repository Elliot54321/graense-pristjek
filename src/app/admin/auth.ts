/**
 * Minimal protection for the admin pages: one shared password in the
 * ADMIN_PASSWORD env var. After login the browser gets an httpOnly cookie that
 * holds an HMAC of the password (never the password itself), so changing
 * ADMIN_PASSWORD logs everyone out. Without ADMIN_PASSWORD the admin is closed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_NAME = "graense_admin";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function password(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export function adminConfigured(): boolean {
  return password() !== null;
}

/** The cookie value for a correct login. */
export function sessionToken(): string {
  const pw = password();
  if (!pw) throw new Error("ADMIN_PASSWORD is not set.");
  return createHmac("sha256", pw).update("graense-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  // Hash both sides first so lengths match and the comparison takes constant time.
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(attempt: string): boolean {
  const pw = password();
  return pw !== null && safeEqual(attempt, pw);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return value !== undefined && safeEqual(value, sessionToken());
}

/** Call first in every admin server action: actions can be POSTed to directly. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Ikke logget ind.");
}
