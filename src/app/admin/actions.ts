"use server";
/**
 * Admin server actions. They run on the server with the secret key; each one
 * checks the admin cookie first, because server actions can be called with a
 * plain POST, not just from our page. Every decision marks the match reviewed,
 * so later matching runs never change it again.
 * Decisions don't refresh the page: the card shows "saved" in place (DecisionCard in
 * forms.tsx) so nothing moves; "Hent flere" reloads the queue.
 * A decision on a newsletter offer also covers its identical twins (decideTwins), and returns
 * their ids so their cards show "saved" too.
 */
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { adminClient } from "@/db/admin";
import { wordingKey } from "@/matching/carry-over";
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

const NEWSLETTER_SHOPS = new Set(["fleggaard", "calle"]);
const MAX_TWIN_PRICE_RATIO = 1.4; // same margin as the LLM link safety rule

interface TwinRow {
  shop_product_id: number;
  shop_products: { shop_id: string; name: string; content_amount: number | null; content_unit: string | null; listed_until: string | null };
}

/**
 * Fleggaard and Calle print the same offers, and one shop can print an offer in several issues,
 * so the same offer is often two or three listings on the same product - each with its own card.
 * After a decision on one of them, copy it to the others: newsletter listings still on sale with
 * the same wording and content, unreviewed, on the product the decided one had before, at a
 * similar price. They end up exactly where the decided one did (same product, method, note),
 * marked reviewed. Returns their ids so the page can mark their cards too.
 */
async function decideTwins(shopProductId: number, productBefore: number): Promise<{ also: number[] }> {
  const db = adminClient();
  const [{ data: self, error: selfError }, { data: decided, error: decidedError }] = await Promise.all([
    db.from("shop_products").select("shop_id, name, content_amount, content_unit").eq("id", shopProductId).single(),
    db.from("product_matches").select("product_id, method, confidence, note").eq("shop_product_id", shopProductId).single(),
  ]);
  if (selfError) throw selfError;
  if (decidedError) throw decidedError;
  if (!NEWSLETTER_SHOPS.has(self.shop_id)) return { also: [] };

  const { data: candidates, error } = await db
    .from("product_matches")
    .select("shop_product_id, shop_products(shop_id, name, content_amount, content_unit, listed_until)")
    .eq("product_id", productBefore)
    .eq("reviewed", false)
    .neq("shop_product_id", shopProductId)
    .overrideTypes<TwinRow[], { merge: false }>();
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const content = (r: { content_amount: number | null; content_unit: string | null }) =>
    `${r.content_amount === null ? "?" : Number(r.content_amount)}${r.content_unit ?? ""}`;
  let twins = (candidates ?? []).filter((c) => {
    const sp = c.shop_products;
    return (
      NEWSLETTER_SHOPS.has(sp.shop_id) &&
      !!sp.listed_until &&
      sp.listed_until >= today &&
      wordingKey(sp.name) === wordingKey(self.name) &&
      content(sp) === content(self)
    );
  });
  if (!twins.length) return { also: [] };

  // Same offer means about the same price; a very different one is left for its own card.
  const { data: prices, error: priceError } = await db
    .from("current_prices")
    .select("shop_product_id, price")
    .in("shop_product_id", [shopProductId, ...twins.map((t) => t.shop_product_id)]);
  if (priceError) throw priceError;
  const priceOf = new Map((prices ?? []).map((p) => [p.shop_product_id, Number(p.price)]));
  const own = priceOf.get(shopProductId);
  twins = twins.filter((t) => {
    const p = priceOf.get(t.shop_product_id);
    return !own || !p || Math.max(own, p) / Math.min(own, p) <= MAX_TWIN_PRICE_RATIO;
  });

  const also: number[] = [];
  for (const t of twins) {
    const { data, error: updateError } = await db
      .from("product_matches")
      .update({
        product_id: decided.product_id,
        method: decided.method,
        confidence: decided.confidence,
        note: decided.note ?? `Same newsletter offer as ${self.shop_id} #${shopProductId}, decided in review`,
        reviewed: true,
      })
      .eq("shop_product_id", t.shop_product_id)
      .eq("reviewed", false) // never overwrite a decision made meanwhile
      .select("shop_product_id");
    if (updateError) throw updateError;
    if (data?.length) also.push(t.shop_product_id);
  }
  return { also };
}

/** Suggestion -> "Link": point the shop product at the suggested product. */
export async function linkSuggestion(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  const suggestion = parseSuggestion(match.note ?? "");
  if (!suggestion) throw new Error("Ingen forslag på dette match.");
  await saveMatch(shopProductId, { product_id: suggestion.targetId, method: "manual", confidence: 1, note: null });
  return decideTwins(shopProductId, match.product_id);
}

/** Suggestion -> "Not the same": keep the current product, remember the rejection. */
export async function rejectSuggestion(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (!parseSuggestion(match.note ?? "")) throw new Error("Ingen forslag på dette match.");
  await saveMatch(shopProductId, { note: `Rejected in review: ${match.note}` });
  return decideTwins(shopProductId, match.product_id);
}

/** LLM link -> "Confirm". */
export async function confirmLink(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (match.method !== "llm") throw new Error("Ikke et LLM-match.");
  await saveMatch(shopProductId, {});
  return decideTwins(shopProductId, match.product_id);
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
  return decideTwins(shopProductId, match.product_id);
}

/**
 * Winning newsletter offer -> "Ikke sammenlignelig": wrong family or wrong link. The
 * shop product gets its own product with no family, so it is never compared with
 * other shops' products (it can still be found on its own).
 */
export async function separate(formData: FormData) {
  await requireAdmin();
  const shopProductId = idFrom(formData, "shopProductId");
  const match = await loadMatch(shopProductId);
  if (match.method !== "llm") throw new Error("Ikke et LLM-match.");
  const db = adminClient();
  const { data: sp, error: spError } = await db
    .from("shop_products")
    .select("name, content_amount, content_unit")
    .eq("id", shopProductId)
    .single();
  if (spError) throw spError;
  const { data: created, error: createError } = await db
    .from("products")
    .insert({ name: sp.name, content_amount: sp.content_amount, content_unit: sp.content_unit, family_id: null })
    .select("id")
    .single();
  if (createError) throw createError;
  await saveMatch(shopProductId, {
    product_id: created.id,
    method: "manual",
    confidence: 1,
    note: `Separated in review from product #${match.product_id}`,
  });
  return decideTwins(shopProductId, match.product_id);
}

/** Error report -> "Klaret": hide it from the list. */
export async function markReportHandled(formData: FormData) {
  await requireAdmin();
  const id = idFrom(formData, "reportId");
  const { error } = await adminClient().from("feedback").update({ handled: true }).eq("id", id);
  if (error) throw error;
}
