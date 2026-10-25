/**
 * LLM matching for NEW shop products against what's already matched.
 *
 *   npm run match:new [-- --dry-run] [--limit-chunks N]
 *
 * "New" = shop products with no match yet (e.g. newsletter products, which have
 * no EAN) or whose product has no family yet. Each is shown to Sonnet 5.5 with
 * similar existing products (sharing name words, same category) and their
 * families. For every new product the model answers: the exact same product as an
 * existing one, a new pack in an existing family, or a new family.
 *
 * The same safety rules as the full run apply (src/matching/safety.ts): a link to
 * an existing product is only saved when it's safe; otherwise the new product gets
 * its own product (in the family, if the model is sure) and a suggestion note for
 * the review page. Answers are cached in data/llm-batches/cache, so re-runs and
 * dry runs of the same input cost nothing.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { adminClient, fetchAll } from "../db/admin";
import { costUsd } from "./llm";
import { isCatchAllFamilyName, linkDoubts } from "./safety";

const MODEL = "claude-sonnet-5-5";
const CHUNK_SIZE = 40;
const CANDIDATES_PER_ITEM = 6;
const CONCURRENCY = 4;
const CACHE_DIR = "data/llm-batches/cache";
const CONFIDENCE = { high: 0.9, medium: 0.75 } as const;

/** Comparison categories per shop (wine, toys and BorderShop's "More" are left out). */
const GROUPS: Record<string, (r: ShopRow) => string | undefined> = {
  poetzsch: (r) => {
    const p = r.categories.join("/");
    if (/^Vand/.test(p)) return "soda";
    if (/^Øl/.test(p)) return "beer";
    if (/^Slik|Chips og snacks/.test(p)) return "candy";
    if (/^Spiritus/.test(p)) return "spirits";
    if (/^Dagligvarer/.test(p)) return "groceries";
    if (/^Husholdning|^Dyrefoder/.test(p)) return "household";
  },
  bordershop: (r) =>
    ({ Beverages: "soda", Beer: "beer", "Candy and Snacks": "candy", Spirits: "spirits", Household: "household" })[r.categories[0]],
  // Newsletter products carry the comparison category directly.
  fleggaard: (r) => (["soda", "beer", "candy", "spirits", "groceries", "household"].includes(r.categories[0]) ? r.categories[0] : undefined),
};

interface ShopRow {
  id: number;
  shop_id: string;
  name: string;
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
interface ProductRow {
  id: number;
  name: string;
  family_id: number | null;
  content_amount: number | null;
  content_unit: string | null;
}

const embed = (r: ShopRow): MatchEmbed | undefined =>
  Array.isArray(r.product_matches) ? r.product_matches[0] : (r.product_matches ?? undefined);

const Decision = z.object({
  decisions: z.array(
    z.object({
      new_id: z.number(),
      same_product_id: z
        .number()
        .nullable()
        .describe("EXISTING product id that is exactly the same item (brand, variety, sugar/alcohol, size and pack), else null"),
      family_id: z.number().nullable().describe("EXISTING family id it belongs to regardless of pack size, else null"),
      new_family: z
        .object({ name: z.string(), search_words: z.array(z.string()) })
        .nullable()
        .describe("Only when no existing family fits: Danish family name without pack size, and 2-6 lowercase Danish search words"),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});
type Decision = z.infer<typeof Decision>["decisions"][number];

const INSTRUCTIONS = `You match NEW products from Danish border shops against EXISTING products of a
price comparison site.

For every NEW product decide:
- same_product_id: the EXISTING product that is exactly the same item - same brand, product
  line, flavour, sugar status (regular vs zero/sukkerfri), alcohol status (regular vs
  0,0%/alkoholfri) and the same pack (units, unit size, can vs bottle). Null if none.
- family_id: the EXISTING family it belongs to regardless of pack size or packaging (e.g. a
  cola in cans and in bottles). Set it whenever a family fits, also with same_product_id.
- new_family: only when no existing family fits. Give a Danish name without pack size and
  search words a shopper might type, including the product type. NEW products that belong
  together get exactly the same new_family name. A family is ONE product (e.g. "Four Roses
  Bourbon"), never a catch-all like "Andre spiritus" or "Diverse slik".
- confidence: high when sure, medium when very likely, low when plausible but uncertain.

Shops name the same thing differently (languages, local names, with or without pack
details); use your knowledge of the brands. When unsure, don't link.`;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zæøåäöü0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

const fmtContent = (a: number | null, u: string | null) => (a !== null ? `${Number(a)} ${u}` : "?");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.indexOf("--limit-chunks");
  const limitChunks = limitArg >= 0 ? Number(args[limitArg + 1]) : null;
  const db = adminClient();

  const [shopRows, products, families, prices] = await Promise.all([
    fetchAll<ShopRow>((f, t) =>
      db.from("shop_products").select("id, shop_id, name, categories, content_amount, content_unit, product_matches(product_id, method, confidence, reviewed)").order("id").range(f, t),
    ),
    fetchAll<ProductRow>((f, t) => db.from("products").select("id, name, family_id, content_amount, content_unit").order("id").range(f, t)),
    fetchAll<{ id: number; name: string; category: string; search_words: string[] }>((f, t) =>
      db.from("product_families").select("id, name, category, search_words").order("id").range(f, t),
    ),
    fetchAll<{ shop_product_id: number; price: number }>((f, t) =>
      db.from("current_prices").select("shop_product_id, price").order("shop_product_id").range(f, t),
    ),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const familyById = new Map(families.map((f) => [f.id, f]));
  const priceOf = new Map(prices.map((p) => [p.shop_product_id, Number(p.price)]));
  const groupOf = (r: ShopRow) => GROUPS[r.shop_id]?.(r);

  // Existing products with a family, described by their shop listings, as candidates.
  const listings = new Map<number, ShopRow[]>();
  for (const r of shopRows) {
    const pid = embed(r)?.product_id;
    if (pid !== undefined) listings.set(pid, [...(listings.get(pid) ?? []), r]);
  }
  const candidates = products
    .filter((p) => p.family_id !== null && listings.has(p.id))
    .map((p) => {
      const rows = listings.get(p.id)!;
      return { product: p, group: groupOf(rows[0]), tokens: new Set(tokens([p.name, ...rows.map((r) => r.name)].join(" "))) };
    });

  // New items: no match yet, or a product without family.
  const newItems = shopRows.filter((r) => {
    if (!groupOf(r)) return false;
    const m = embed(r);
    return !m || productById.get(m.product_id)?.family_id == null;
  });
  console.log(`${newItems.length} new shop products to match against ${candidates.length} existing products.`);
  if (!newItems.length) return console.log("Nothing to match - no API calls made.");

  // Chunks per category, alphabetical so the same brand lands together.
  const chunks: { group: string; items: ShopRow[]; candidateIds: number[] }[] = [];
  for (const group of ["soda", "beer", "candy", "spirits", "groceries", "household"]) {
    const items = newItems.filter((r) => groupOf(r) === group).sort((a, b) => a.name.localeCompare(b.name));
    const pool = candidates.filter((c) => c.group === group);
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const part = items.slice(i, i + CHUNK_SIZE);
      const chosen = new Set<number>();
      for (const item of part) {
        const own = tokens(item.name);
        const first = own[0];
        pool
          .map((c) => ({ c, score: own.filter((t) => c.tokens.has(t)).length + (first && c.tokens.has(first) ? 2 : 0) }))
          .filter((x) => x.score >= 2 && x.c.product.id !== embed(item)?.product_id)
          .sort((a, b) => b.score - a.score)
          .slice(0, CANDIDATES_PER_ITEM)
          .forEach((x) => chosen.add(x.c.product.id));
      }
      chunks.push({ group, items: part, candidateIds: [...chosen] });
    }
  }
  const todo = chunks.slice(0, limitChunks ?? undefined);
  console.log(`${todo.length} chunks (of ${chunks.length}).`);

  // Ask the model (cached per chunk input).
  const client = new Anthropic();
  mkdirSync(CACHE_DIR, { recursive: true });
  let cost = 0;
  const answers: { chunk: (typeof chunks)[number]; decisions: Decision[] }[] = [];
  const ask = async (chunk: (typeof chunks)[number]) => {
    const existing = chunk.candidateIds.map((id) => {
      const p = productById.get(id)!;
      const fam = familyById.get(p.family_id!);
      const shopsText = listings.get(id)!.map((r) => `${r.shop_id} "${r.name}" ${priceOf.get(r.id) ?? "?"} kr`).join("; ");
      return `${id} | ${p.name} | ${fmtContent(p.content_amount, p.content_unit)} | family ${fam?.id} "${fam?.name}" | ${shopsText}`;
    });
    const fresh = chunk.items.map((r) => `${r.id} | ${r.shop_id} | ${r.name} | ${fmtContent(r.content_amount, r.content_unit)} | ${priceOf.get(r.id) ?? "?"} kr`);
    const prompt = `Category: ${chunk.group}\n\nNEW products (id | shop | name | content | price):\n${fresh.join("\n")}\n\nEXISTING products (id | name | content | family | shop listings):\n${existing.join("\n") || "(none)"}`;
    const cacheFile = `${CACHE_DIR}/new-${MODEL}-${createHash("sha1").update(prompt).digest("hex")}.json`;
    if (existsSync(cacheFile)) return { chunk, decisions: JSON.parse(readFileSync(cacheFile, "utf8")) as Decision[] };
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(Decision) },
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason !== "end_turn" || !response.parsed_output) {
      console.warn(`  ${chunk.group}: stopped with ${response.stop_reason} - skipped`);
      return { chunk, decisions: [] };
    }
    cost += costUsd(MODEL, response.usage.input_tokens, response.usage.output_tokens);
    writeFileSync(cacheFile, JSON.stringify(response.parsed_output.decisions));
    return { chunk, decisions: response.parsed_output.decisions };
  };
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    answers.push(...(await Promise.all(todo.slice(i, i + CONCURRENCY).map(ask))));
    process.stderr.write(`  asked ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length} chunks\n`);
  }

  // Turn decisions into writes.
  const newFamilies = new Map<string, { category: string; name: string; search_words: Set<string> }>();
  const familyFor = new Map<number, number | string>(); // shop product id -> family id or new-family key
  const linkTo = new Map<number, { productId: number; confidence: number }>();
  const notes = new Map<number, string>();
  const report = { linked: [] as string[], suggested: [] as string[], joinedFamily: 0, newFamily: 0, skipped: 0 };

  for (const { chunk, decisions } of answers) {
    const inChunk = new Map(chunk.items.map((r) => [r.id, r]));
    for (const d of decisions) {
      const item = inChunk.get(d.new_id);
      if (!item) continue;
      const current = embed(item);
      if (current?.reviewed || current?.method === "manual") {
        report.skipped++;
        continue;
      }
      const sure = d.confidence !== "low";
      // Family: an existing one (if sure and it exists), else the model's new family.
      if (sure && d.family_id !== null && familyById.has(d.family_id)) {
        familyFor.set(item.id, d.family_id);
        report.joinedFamily++;
      } else {
        // A catch-all name ("Andre spiritus A-F") would mix unrelated products; use the product's own name.
        const proposed = d.new_family?.name?.trim();
        const name = proposed && !isCatchAllFamilyName(proposed) ? proposed : item.name.trim();
        const key = `${chunk.group}|${name.toLowerCase()}`;
        const fam = newFamilies.get(key) ?? { category: chunk.group, name, search_words: new Set<string>() };
        for (const w of d.new_family?.search_words ?? []) fam.search_words.add(w.trim().toLowerCase());
        newFamilies.set(key, fam);
        familyFor.set(item.id, key);
        report.newFamily++;
      }
      // Exact product link, only when safe.
      if (d.same_product_id !== null && chunk.candidateIds.includes(d.same_product_id)) {
        const target = productById.get(d.same_product_id)!;
        const others = listings.get(target.id) ?? [];
        const describe = [item, ...others].map((r) => `${r.shop_id} "${r.name}" ${priceOf.get(r.id) ?? "?"}`).join("  <->  ");
        const doubts = linkDoubts(
          [item, ...others].map((r) => ({
            shopId: r.shop_id,
            name: r.name,
            contentAmount: r.content_amount === null ? null : Number(r.content_amount),
            contentUnit: r.content_unit,
            price: priceOf.get(r.id),
          })),
          d.confidence,
        );
        if (doubts.length) {
          notes.set(item.id, `LLM suggests same product as #${target.id} ("${target.name}"), not linked: ${doubts.join(", ")}`);
          report.suggested.push(`[${doubts.join(", ")}] ${describe}`);
        } else {
          linkTo.set(item.id, { productId: target.id, confidence: CONFIDENCE[d.confidence as "high" | "medium"] });
          if (target.family_id !== null) familyFor.set(item.id, target.family_id); // a linked product keeps its family
          report.linked.push(`[${d.confidence}] ${describe}`);
        }
      }
    }
  }

  console.log(`\nLinked to an existing product: ${report.linked.length}`);
  for (const l of report.linked.slice(0, 40)) console.log(`  ${l}`);
  console.log(`Suggested only (note for review): ${report.suggested.length}`);
  for (const l of report.suggested.slice(0, 20)) console.log(`  ${l}`);
  console.log(`Joined an existing family: ${report.joinedFamily}; new family: ${report.newFamily} (${newFamilies.size} distinct)`);
  if (report.skipped) console.log(`Skipped (reviewed/manual): ${report.skipped}`);
  console.log(`API cost: $${cost.toFixed(4)}`);
  writeFileSync(
    "data/llm-batches/last-new-links.txt",
    `LINKED\n${report.linked.join("\n")}\n\nSUGGESTED (not linked)\n${report.suggested.join("\n")}\n`,
  );
  if (dryRun) return console.log("Dry run - nothing saved. Full lists in data/llm-batches/last-new-links.txt");

  // 1. New families.
  const familyIds = new Map<string, number>();
  const famRows = [...newFamilies.values()].map((f) => ({ category: f.category, name: f.name, search_words: [...f.search_words] }));
  for (let i = 0; i < famRows.length; i += 500) {
    const { data, error } = await db.from("product_families").upsert(famRows.slice(i, i + 500), { onConflict: "category,name" }).select("id, category, name");
    if (error) throw error;
    for (const f of data) familyIds.set(`${f.category}|${f.name.toLowerCase()}`, f.id);
  }
  const resolveFamily = (v: number | string | undefined) => (typeof v === "string" ? familyIds.get(v) ?? null : v ?? null);

  // 2. Products: new items without a product get their own (unless linked); others get their family.
  const matchRows: { shop_product_id: number; product_id: number; method: string; confidence: number; reviewed: boolean; note: string | null }[] = [];
  let created = 0;
  for (const item of answers.flatMap((a) => a.chunk.items)) {
    if (!familyFor.has(item.id)) continue; // the model gave no decision for it
    const current = embed(item);
    const familyId = resolveFamily(familyFor.get(item.id));
    const link = linkTo.get(item.id);
    if (link) {
      matchRows.push({ shop_product_id: item.id, product_id: link.productId, method: "llm", confidence: link.confidence, reviewed: false, note: null });
      continue;
    }
    let productId = current?.product_id;
    if (productId === undefined) {
      const { data, error } = await db
        .from("products")
        .insert({ name: item.name, content_amount: item.content_amount, content_unit: item.content_unit, family_id: familyId })
        .select("id")
        .single();
      if (error) throw error;
      productId = data.id as number;
      created++;
    } else if (familyId !== null) {
      const { error } = await db.from("products").update({ family_id: familyId }).eq("id", productId);
      if (error) throw error;
    }
    if (!current || notes.has(item.id)) {
      matchRows.push({
        shop_product_id: item.id,
        product_id: productId,
        method: current?.method ?? "llm",
        confidence: current ? Number(current.confidence) : 1, // own product: nothing uncertain to review
        reviewed: false,
        note: notes.get(item.id) ?? null,
      });
    }
  }
  for (let i = 0; i < matchRows.length; i += 500) {
    const { error } = await db.from("product_matches").upsert(matchRows.slice(i, i + 500), { onConflict: "shop_product_id" });
    if (error) throw error;
  }
  console.log(`Saved: ${famRows.length} new families, ${created} new products, ${matchRows.length} matches.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
