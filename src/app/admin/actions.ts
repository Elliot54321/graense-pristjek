"use server";
/**
 * Admin server actions. They run on the server with the secret key; each one
 * checks the admin cookie first, because server actions can be called with a
 * plain POST, not just from our page. Every decision marks the match reviewed,
 * so later matching runs never change it again.
 */
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { adminClient } from "@/db/admin";
import { COOKIE_MAX_AGE, COOKIE_NAME, passwordMatches, requireAdmin, sessionToken } from "./auth";
import { parseSuggestion } from "./data";

/** Used with useActionState: returns an error message, or null after logging in. */
export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const attempt = String(formData.get("password") ?? "");
  if (!passwordMatches(attempt)) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down password guessing
    return "Forkert adgangskode.";
  }
  (await cookies()).set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: COOKIE_MAX_AGE,
  });
  refresh();
  return null;
}

export async function logout() {
  (await cookies()).delete({ name: COOKIE_NAME, path: "/admin" });
  refresh();
}

function idFrom(formData: FormData, key: string): number {
  const id = Number(formData.get(key));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Ugyldigt ${key}.`);
  return id;
}

async function loadMatch(shopProductId: number) {
  const { data, error } = await adminClient()
    .from("product_matches")
    .select("shop_product_id, product_id, method, reviewed, note")
    .eq("shop_product_id", shopProductId)
    .single();
  if (error) throw error;
  if (data.reviewed) throw new Error("Matchet er allerede gennemgået.");
  return data;
}

async function saveMatch(shopProductId: number, fields: Record<string, unknown>) {
  const { error } = await adminClient()
    .from("product_matches")
    .update({ ...fields, reviewed: true })
    .eq("shop_product_id", shopProductId)
    .eq("reviewed", false); // never overwrite a decision made meanwhile
  if (error) throw error;
}

/** Suggestion -> "Link": point the shop product at the suggested product. */
export async function linkSuggestion(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  const suggestion = parseSuggestion(match.note ?? "");
  if (!suggestion) throw new Error("Ingen forslag på dette match.");
  await saveMatch(shopProductId, { product_id: suggestion.targetId, method: "manual", confidence: 1, note: null });
  refresh();
}

/** Suggestion -> "Not the same": keep the current product, remember the rejection. */
export async function rejectSuggestion(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (!parseSuggestion(match.note ?? "")) throw new Error("Ingen forslag på dette match.");
  await saveMatch(shopProductId, { note: `Rejected in review: ${match.note}` });
  refresh();
}

/** LLM link -> "Confirm". */
export async function confirmLink(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (match.method !== "llm") throw new Error("Ikke et LLM-match.");
  await saveMatch(shopProductId, {});
  refresh();
}

/**
 * LLM link -> "Unlink": give the shop product its own product again. Every
 * shop product so far has an EAN, so its own product is normally the EAN
 * product it had before the LLM run moved it. If there is none, create one.
 */
export async function unlink(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (match.method !== "llm") throw new Error("Ikke et LLM-match.");
  const db = adminClient();

  const { data: sp, error: spError } = await db
    .from("shop_products")
    .select("name, brand, ean, categories, content_amount, content_unit")
    .eq("id", shopProductId)
    .single();
  if (spError) throw spError;

  const own = sp.ean
    ? (await db.from("products").select("id").eq("ean", sp.ean).maybeSingle()).data
    : null;
  if (own && own.id !== match.product_id) {
    await saveMatch(shopProductId, { product_id: own.id, method: "ean", confidence: 1, note: null });
  } else {
    // Same family as before: unlinking says "not the same exact product", the
    // family (e.g. "Coca-Cola" in any pack size) is usually still right.
    const { data: current } = await db.from("products").select("family_id").eq("id", match.product_id).single();
    const { data: created, error: createError } = await db
      .from("products")
      .insert({
        name: sp.name,
        brand: sp.brand,
        ean: own ? null : sp.ean, // ean is unique; keep it only if no product has it yet
        content_amount: sp.content_amount,
        content_unit: sp.content_unit,
        category: sp.categories?.[0] ?? null,
        family_id: current?.family_id ?? null,
      })
      .select("id")
      .single();
    if (createError) throw createError;
    await saveMatch(shopProductId, { product_id: created.id, method: "manual", confidence: 1, note: null });
  }
  refresh();
}
