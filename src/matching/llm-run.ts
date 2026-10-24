/**
 * LLM matching over the catalog: families, search words and cross-shop links.
 *
 *   npm run match:llm -- plan                      show chunks and estimated cost (no API calls)
 *   npm run match:llm -- run [--chunks N] [--dry-run]   call the API directly (small runs, tests)
 *   npm run match:llm -- submit                    send all chunks as one Batch API job (50% cheaper)
 *   npm run match:llm -- collect <batch-id> [--dry-run]  fetch batch results and save them
 *
 * Only shop products whose product has no family yet are sent, so a run picks
 * up where the last one stopped. Matches a human reviewed (or made by hand) are
 * never changed.
 *
 * A wrong link gives a wrong "cheapest" answer, so links are only saved when the
 * model is confident (high/medium) AND the prices look alike (within
 * PRICE_OUTLIER) AND the names don't mix bottles with cans or gift boxes with
 * plain packs AND alcohol % and content size agree. Anything else is
 * saved as a suggestion note on the shop product's match, for the review view.
 * `run` caches API answers in data/llm-batches/cache so rules can be re-tested
 * for free.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { adminClient, fetchAll } from "../db/admin";
import {
  checkCompleteness,
  costUsd,
  type LlmProduct,
  matchProducts,
  matchRequest,
  type MatchResult,
  parseMatchText,
} from "./llm";
import { linkDoubts } from "./safety";

const MODEL = "claude-sonnet-5-5";
const CHUNK_SIZE = 100;
const MAX_CHUNK = 140; // allow a chunk to grow this far to keep a brand together
const BATCH_SIZE = 500;
const CONFIDENCE = { high: 0.9, medium: 0.75 } as const;
const MANIFEST_DIR = "data/llm-batches";

/** Comparison categories (wine, toys and "More" - mostly perfume and gadgets - left out). */
const GROUPS: { id: string; poetzsch?: RegExp; bordershop?: RegExp }[] = [
  { id: "soda", poetzsch: /^Vand/, bordershop: /^Beverages$/ },
  { id: "beer", poetzsch: /^Øl/, bordershop: /^Beer$/ },
  { id: "candy", poetzsch: /^Slik|Chips og snacks/, bordershop: /^Candy and Snacks$/ },
  { id: "spirits", poetzsch: /^Spiritus/, bordershop: /^Spirits$/ },
  { id: "groceries", poetzsch: /^Dagligvarer(?!\/Chips og snacks)/ },
  { id: "household", poetzsch: /^Husholdning|^Dyrefoder/, bordershop: /^Household$/ },
];

interface ShopRow {
  id: number;
  shop_id: string;
  name: string;
  brand: string | null;
  categories: string[];
  content_amount: number | null;
  content_unit: string | null;
  product_matches: MatchEmbed[] | MatchEmbed | null;
}
interface MatchEmbed {
  product_id: number;
  method: string;
  confidence: number;
  reviewed: boolean;
}
interface Chunk {
  customId: string;
  group: string;
  ids: number[];
}
interface Manifest {
  batchId: string;
  model: string;
  createdAt: string;
  chunks: Chunk[];
}

const embed = (r: ShopRow): MatchEmbed | undefined =>
  Array.isArray(r.product_matches) ? r.product_matches[0] : (r.product_matches ?? undefined);

function groupOf(r: ShopRow): string | undefined {
  const path = r.categories.join("/");
  return GROUPS.find((g) => (r.shop_id === "poetzsch" ? g.poetzsch : g.bordershop)?.test(path))?.id;
}

/** Sort key that keeps the same brand together across shops ("Coca-Cola" / "Coca Cola"). */
const sortKey = (r: ShopRow) => r.name.toLowerCase().replace(/[^a-zæøåäöü0-9]/g, "");

function toLlmProduct(r: ShopRow): LlmProduct {
  return {
    id: r.id,
    shop: r.shop_id,
    name: r.name,
    brand: r.brand,
    content: r.content_amount !== null ? `${r.content_amount} ${r.content_unit}` : null,
    category: r.categories.join("/"),
  };
}

async function loadCatalog() {
  const db = adminClient();
  const shopRows = await fetchAll<ShopRow>((from, to) =>
    db
      .from("shop_products")
      .select("id, shop_id, name, brand, categories, content_amount, content_unit, product_matches(product_id, method, confidence, reviewed)")
      .order("id")
      .range(from, to),
  );
  const products = await fetchAll<{ id: number; name: string; family_id: number | null }>((from, to) =>
    db.from("products").select("id, name, family_id").order("id").range(from, to),
  );
  const prices = await fetchAll<{ shop_product_id: number; price: number }>((from, to) =>
    db.from("current_prices").select("shop_product_id, price").order("shop_product_id").range(from, to),
  );
  return {
    db,
    shopRows,
    byId: new Map(shopRows.map((r) => [r.id, r])),
    products: new Map(products.map((p) => [p.id, p])),
    prices: new Map(prices.map((p) => [p.shop_product_id, Number(p.price)])),
  };
}

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

function buildChunks(cat: Catalog): Chunk[] {
  const todo = cat.shopRows.filter((r) => {
    const productId = embed(r)?.product_id;
    return productId !== undefined && cat.products.get(productId)?.family_id == null && groupOf(r);
  });
  const chunks: Chunk[] = [];
  for (const g of GROUPS) {
    const rows = todo.filter((r) => groupOf(r) === g.id).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    let current: ShopRow[] = [];
    const flush = () => {
      if (current.length) chunks.push({ customId: `${g.id}-${chunks.length}`, group: g.id, ids: current.map((r) => r.id) });
      current = [];
    };
    for (const r of rows) {
      const full = current.length >= CHUNK_SIZE;
      // Past the target size, keep going while the brand (first 4 letters) stays the same.
      const sameBrand = current.length && sortKey(current[current.length - 1]).slice(0, 4) === sortKey(r).slice(0, 4);
      if ((full && !sameBrand) || current.length >= MAX_CHUNK) flush();
      current.push(r);
    }
    flush();
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Turning model output into database writes

interface MatchWrite {
  shop_product_id: number;
  product_id: number;
  method: string;
  confidence: number;
  reviewed: boolean;
  note: string | null;
}

interface Plan {
  families: Map<string, { category: string; name: string; search_words: Set<string> }>;
  productFamily: Map<number, string>; // product id -> family key
  matches: MatchWrite[]; // new links, and suggestion notes on existing matches
  linked: string[];
  suggested: string[];
  skippedReviewed: number;
  problems: string[];
}

const familyKey = (category: string, name: string) => `${category}|${name.trim().toLowerCase()}`;

function newPlan(): Plan {
  return { families: new Map(), productFamily: new Map(), matches: [], linked: [], suggested: [], skippedReviewed: 0, problems: [] };
}

function addToPlan(plan: Plan, cat: Catalog, chunk: Chunk, result: MatchResult) {
  const products = chunk.ids.map((id) => toLlmProduct(cat.byId.get(id)!));
  const check = checkCompleteness(products, result);
  if (check.missing.length || check.duplicated.length || check.unknown.length) {
    plan.problems.push(
      `${chunk.customId}: missing ${check.missing.length}, duplicated ${check.duplicated.length}, unknown ${check.unknown.length}`,
    );
  }
  const inChunk = new Set(chunk.ids);
  const used = new Set<number>();

  for (const fam of result.families) {
    const key = familyKey(chunk.group, fam.family);
    const family = plan.families.get(key) ?? { category: chunk.group, name: fam.family.trim(), search_words: new Set<string>() };
    for (const w of fam.search_words) family.search_words.add(w.trim().toLowerCase());
    plan.families.set(key, family);

    for (const variant of fam.variants) {
      // Ignore ids the model invented or repeated.
      const rows = variant.ids
        .filter((id) => inChunk.has(id) && !used.has(id))
        .map((id) => (used.add(id), cat.byId.get(id)!));
      if (!rows.length) continue;

      // Link everything to the product most of the variant already belongs to.
      const counts = new Map<number, number>();
      for (const r of rows) counts.set(embed(r)!.product_id, (counts.get(embed(r)!.product_id) ?? 0) + 1);
      const target = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      for (const productId of counts.keys()) plan.productFamily.set(productId, key);

      if (counts.size === 1) continue; // already one product - nothing to link

      // Is this link safe to save, or only a suggestion for review?
      const shops = new Set(rows.map((r) => r.shop_id));
      const doubts = linkDoubts(
        rows.map((r) => ({
          shopId: r.shop_id,
          name: r.name,
          contentAmount: r.content_amount === null ? null : Number(r.content_amount),
          contentUnit: r.content_unit,
          price: cat.prices.get(r.id),
        })),
        variant.confidence,
      );
      const describe = rows.map((x) => `${x.shop_id} "${x.name}" ${cat.prices.get(x.id) ?? "?"}`).join("  <->  ");

      if (doubts.length) {
        plan.suggested.push(`[${doubts.join(", ")}] ${fam.family}: ${describe}`);
      } else {
        plan.linked.push(`[${variant.confidence}${shops.size > 1 ? "" : ", same shop"}] ${fam.family}: ${describe}`);
      }

      for (const r of rows) {
        const current = embed(r)!;
        if (current.product_id === target) continue;
        if (current.reviewed || current.method === "manual") {
          plan.skippedReviewed++;
          continue;
        }
        plan.matches.push(
          doubts.length
            ? // Keep the current match; record the suggestion for the review view.
              { shop_product_id: r.id, product_id: current.product_id, method: current.method, confidence: Number(current.confidence),
                reviewed: false, note: `LLM suggests same product as #${target} ("${fam.family}"), not linked: ${doubts.join(", ")}` }
            : { shop_product_id: r.id, product_id: target, method: "llm", confidence: CONFIDENCE[variant.confidence as "high" | "medium"],
                reviewed: false, note: null },
        );
      }
    }
  }
}

function printPlan(plan: Plan) {
  console.log(`Families: ${plan.families.size}`);
  console.log(`Products getting a family: ${plan.productFamily.size}`);
  console.log(`Linked (saved as matches): ${plan.linked.length}`);
  for (const l of plan.linked.slice(0, 40)) console.log(`  ${l}`);
  console.log(`Suggested only (saved as notes for review): ${plan.suggested.length}`);
  for (const l of plan.suggested.slice(0, 40)) console.log(`  ${l}`);
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(
    `${MANIFEST_DIR}/last-links.txt`,
    `LINKED\n${plan.linked.join("\n")}\n\nSUGGESTED (not linked)\n${plan.suggested.join("\n")}\n`,
  );
  console.log(`(full lists in ${MANIFEST_DIR}/last-links.txt)`);
  if (plan.skippedReviewed) console.log(`Skipped (already reviewed or manual): ${plan.skippedReviewed}`);
  if (plan.problems.length) console.log(`Chunk problems:\n  ${plan.problems.join("\n  ")}`);
}

async function savePlan(plan: Plan, cat: Catalog) {
  const { db } = cat;
  // 1. Families (merge search words with families saved by earlier runs).
  const existing = await fetchAll<{ id: number; category: string; name: string; search_words: string[] }>((from, to) =>
    db.from("product_families").select("id, category, name, search_words").order("id").range(from, to),
  );
  const existingByKey = new Map(existing.map((f) => [familyKey(f.category, f.name), f]));
  const familyRows = [...plan.families.entries()].map(([key, f]) => {
    const old = existingByKey.get(key);
    return {
      category: f.category,
      name: old?.name ?? f.name,
      search_words: [...new Set([...(old?.search_words ?? []), ...f.search_words])],
    };
  });
  const familyIds = new Map<string, number>();
  for (let i = 0; i < familyRows.length; i += BATCH_SIZE) {
    const { data, error } = await db
      .from("product_families")
      .upsert(familyRows.slice(i, i + BATCH_SIZE), { onConflict: "category,name" })
      .select("id, category, name");
    if (error) throw error;
    for (const f of data) familyIds.set(familyKey(f.category, f.name), f.id);
  }

  // 2. Product -> family: one update per family (products.id can't be upserted -
  // it is GENERATED ALWAYS), several families at a time.
  const byFamily = new Map<number, number[]>();
  for (const [productId, key] of plan.productFamily) {
    const familyId = familyIds.get(key)!;
    byFamily.set(familyId, [...(byFamily.get(familyId) ?? []), productId]);
  }
  const updates = [...byFamily.entries()];
  const CONCURRENCY = 10;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const results = await Promise.all(
      updates.slice(i, i + CONCURRENCY).map(([familyId, ids]) => db.from("products").update({ family_id: familyId }).in("id", ids)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  const productCount = plan.productFamily.size;

  // 3. Re-linked matches.
  for (let i = 0; i < plan.matches.length; i += BATCH_SIZE) {
    const { error } = await db
      .from("product_matches")
      .upsert(plan.matches.slice(i, i + BATCH_SIZE), { onConflict: "shop_product_id" });
    if (error) throw error;
  }
  console.log(`Saved: ${familyRows.length} families, ${productCount} products, ${plan.matches.length} matches.`);
}

// ---------------------------------------------------------------------------
// Commands

async function plan() {
  const cat = await loadCatalog();
  const chunks = buildChunks(cat);
  const products = chunks.reduce((n, c) => n + c.ids.length, 0);
  console.log(`${products} shop products to process in ${chunks.length} chunks:`);
  for (const g of GROUPS) {
    const cs = chunks.filter((c) => c.group === g.id);
    console.log(`  ${g.id.padEnd(10)} ${String(cs.reduce((n, c) => n + c.ids.length, 0)).padStart(5)} products, ${cs.length} chunks`);
  }
  // From the 241-product test: ~73 input and ~42 output tokens per product on Sonnet 5.5.
  console.log(`Estimated cost: ~$${costUsd(MODEL, products * 73, products * 42, true).toFixed(2)} with the Batch API (~$${costUsd(MODEL, products * 73, products * 42).toFixed(2)} direct)`);
}

async function run(maxChunks: number | null, dryRun: boolean) {
  const cat = await loadCatalog();
  const chunks = buildChunks(cat).slice(0, maxChunks ?? undefined);
  const client = new Anthropic();
  const p = newPlan();
  let cost = 0;
  mkdirSync(`${MANIFEST_DIR}/cache`, { recursive: true });
  for (const chunk of chunks) {
    // Same products in the same order -> reuse the earlier answer instead of paying again.
    const cacheFile = `${MANIFEST_DIR}/cache/${MODEL}-${createHash("sha1").update(chunk.ids.join(",")).digest("hex")}.json`;
    let result: MatchResult;
    if (existsSync(cacheFile)) {
      result = JSON.parse(readFileSync(cacheFile, "utf8"));
      console.log(`  ${chunk.customId}: ${chunk.ids.length} products (cached answer)`);
    } else {
      const call = await matchProducts(client, MODEL, chunk.ids.map((id) => toLlmProduct(cat.byId.get(id)!)));
      result = call.result;
      cost += call.costUsd;
      writeFileSync(cacheFile, JSON.stringify(result));
      console.log(`  ${chunk.customId}: ${chunk.ids.length} products, ${result.families.length} families, $${call.costUsd.toFixed(4)}`);
    }
    addToPlan(p, cat, chunk, result);
  }
  printPlan(p);
  console.log(`API cost: $${cost.toFixed(4)}`);
  if (!dryRun) await savePlan(p, cat);
}

async function submit() {
  const cat = await loadCatalog();
  const chunks = buildChunks(cat);
  if (!chunks.length) return console.log("Nothing to do: every product already has a family.");
  const client = new Anthropic();
  const batch = await client.messages.batches.create({
    requests: chunks.map((c) => ({
      custom_id: c.customId,
      params: matchRequest(MODEL, c.ids.map((id) => toLlmProduct(cat.byId.get(id)!))),
    })),
  });
  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest: Manifest = { batchId: batch.id, model: MODEL, createdAt: new Date().toISOString(), chunks };
  writeFileSync(`${MANIFEST_DIR}/${batch.id}.json`, JSON.stringify(manifest, null, 2));
  console.log(`Submitted ${chunks.length} chunks as batch ${batch.id} (${batch.processing_status}).`);
  console.log(`Collect with: npm run match:llm -- collect ${batch.id}`);
}

async function collect(batchId: string, dryRun: boolean) {
  const file = `${MANIFEST_DIR}/${batchId}.json`;
  if (!existsSync(file)) throw new Error(`No manifest ${file} - was the batch submitted from this machine?`);
  const manifest: Manifest = JSON.parse(readFileSync(file, "utf8"));
  const client = new Anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  const c = batch.request_counts;
  console.log(`Batch ${batchId}: ${batch.processing_status} (processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}, expired ${c.expired})`);
  if (batch.processing_status !== "ended") return console.log("Not finished yet - try again later.");

  const cat = await loadCatalog();
  const chunks = new Map(manifest.chunks.map((ch) => [ch.customId, ch]));
  const p = newPlan();
  let inTok = 0, outTok = 0;
  for await (const item of await client.messages.batches.results(batchId)) {
    const chunk = chunks.get(item.custom_id);
    if (!chunk) continue;
    if (item.result.type !== "succeeded") {
      p.problems.push(`${item.custom_id}: ${item.result.type} - will be retried by the next submit`);
      continue;
    }
    const message = item.result.message;
    inTok += message.usage.input_tokens;
    outTok += message.usage.output_tokens;
    if (message.stop_reason !== "end_turn") {
      p.problems.push(`${item.custom_id}: stopped with ${message.stop_reason}`);
      continue;
    }
    const text = message.content.find((b) => b.type === "text");
    try {
      addToPlan(p, cat, chunk, parseMatchText(text?.type === "text" ? text.text : ""));
    } catch (e) {
      p.problems.push(`${item.custom_id}: could not parse result (${String(e).slice(0, 120)})`);
    }
  }
  printPlan(p);
  console.log(`Tokens: ${inTok} in, ${outTok} out. Cost: $${costUsd(manifest.model, inTok, outTok, true).toFixed(2)} (batch price)`);
  if (dryRun) return console.log("Dry run - nothing saved.");
  await savePlan(p, cat);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const chunksArg = args.indexOf("--chunks");
  if (command === "plan") return plan();
  if (command === "run") return run(chunksArg >= 0 ? Number(args[chunksArg + 1]) : null, dryRun);
  if (command === "submit") return submit();
  if (command === "collect" && args[0] && !args[0].startsWith("--")) return collect(args[0], dryRun);
  console.error("Usage: npm run match:llm -- plan | run [--chunks N] [--dry-run] | submit | collect <batch-id> [--dry-run]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
