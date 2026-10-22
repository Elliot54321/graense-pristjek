import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only client with the publishable key (RLS: public read, no writes).
 * Used by the website's server code; safe even if it ever reached the browser.
 */
export function publicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
