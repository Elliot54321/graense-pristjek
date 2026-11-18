/**
 * Subcategories for product families, and the move of chips, nuts and biscuits from
 * candy (and groceries) to the `snacks` top category (taxonomy: src/catalog/categories.ts,
 * roadmap "Category taxonomy with subcategories", 2026-11-17).
 *
 *   npx tsx --env-file-if-exists=.env.local src/matching/subcategories.ts <command>
 *     plan                     rules only: what they decide, what's left for the LLM, cost
 *     compare [--sample N]     Haiku vs Sonnet on N families (direct API, cached)
 *     submit [--model M]       the families the rules leave, as one Batch API job (half price)
 *     collect <batch-id>       store a finished batch's answers in the cache
 *     apply [--save]           rules + cached answers -> counts per subcategory, snacks moves, sample
 *
 * Cheap rules first: the shops' own category paths (Poetzsch, ScandiPark) and a few clear
 * name keywords (alcohol-free, cider, sparkling/fortified wine, tonic). A family's
 * listings must agree; any conflict goes to the model. The model may answer "other" or
 * "not sure": the family then keeps an empty subcategory, which the site shows as
 * "Øvrige" - a safe default. Existing subcategories are never overwritten.
 *
 * A candy or groceries family the model files under chips/nuts/biscuits moves to
 * `snacks` (category change). `unique (category, name)`: if `snacks` already has a family
 * of that name, the products join it and the empty family is renamed.
 *
 * Answers are cached per family (name + category + listing names), so the nightly
 * `match:new` (which calls `subcategoriesFor` for new families) never pays twice.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TOP_CATEGORIES } from "../catalog/categories";
import { adminClient, fetchAll } from "../db/admin";
import { isListed } from "./groups";
import { costUsd } from "./llm";

/** Chosen 2026-11-17 on 100 hand-checked families: Haiku 1 wrong + 5 more left empty, Sonnet 0 wrong. */
export const SUBCATEGORY_MODEL = "claude-sonnet-5-5";
const CACHE_DIR = "data/llm-batches/cache";
const MANIFEST_DIR = "data/llm-batches";
const CHUNK = 100;
/** Top categories whose families may move to `snacks`. */
const SNACK_SOURCES = new Set(["candy", "groceries"]);
const SNACK_SUBS = new Set<string>(TOP_CATEGORIES.find((c) => c.id === "snacks")!.subcategories.map((s) => s.id));

/** Subcategory ids a family of this category may get (candy/groceries also the snacks ones). */
export function allowedSubcategories(category: string): Set<string> {
  const own = TOP_CATEGORIES.find((c) => c.id === category)?.subcategories.map((s) => s.id) ?? [];
  return new Set<string>([...own, ...(SNACK_SOURCES.has(category) ? SNACK_SUBS : [])]);
}

/** The top category a family ends in: `snacks` for a snack subcategory, else unchanged. */
export const categoryFor = (category: string, subcategory: string | null) =>
  subcategory && SNACK_SUBS.has(subcategory) && SNACK_SOURCES.has(category) ? "snacks" : category;

// ---------------------------------------------------------------------------------------
// Rules

/** Shop category path -> [top category, subcategory]. Only paths that are unambiguous. */
const PATH_RULES: [RegExp, string, string][] = [
  [/^poetzsch\|Vin\/Rødvin$|^scandipark\|(wein|bag-in-box-weine)\/rotwein$/, "wine", "red"],
  [/^poetzsch\|Vin\/Hvidvin$|^scandipark\|(wein|bag-in-box-weine)\/weisswein$/, "wine", "white"],
  [/^poetzsch\|Vin\/Rosévin$|^scandipark\|wein\/rosewein$/, "wine", "rose"],
  [/^poetzsch\|Vin\/Mousserende vin$|^scandipark\|getraenke\/sekt-champagner$/, "wine", "sparkling"],
  [/^poetzsch\|Vin\/Portvin og sherry$/, "wine", "fortified"],
  [/^poetzsch\|Vin\/Alkoholfri vin$/, "wine", "alcohol_free_wine"],
  [/^poetzsch\|Spiritus\/Whisky$|^scandipark\|spirituosen\/whisky$/, "spirits", "whisky"],
  [/^poetzsch\|Spiritus\/Rom$|^scandipark\|spirituosen\/rum$/, "spirits", "rum"],
  [/^poetzsch\|Spiritus\/Gin$/, "spirits", "gin"],
  [/^poetzsch\|Spiritus\/Vodka$/, "spirits", "vodka"],
  [/^poetzsch\|Spiritus\/Likør$|^scandipark\|spirituosen\/likoer$/, "spirits", "liqueur"],
  [/^poetzsch\|Spiritus\/Shots$/, "spirits", "shots"],
  [/^poetzsch\|Spiritus\/Cognac og brandy$/, "spirits", "brandy"],
  [/^poetzsch\|Spiritus\/Bitter$/, "spirits", "bitter"],
  [/^poetzsch\|Spiritus\/Akvavit og snaps$/, "spirits", "aquavit"],
  [/^poetzsch\|Vand\/Energidrik$/, "soda", "energy"],
  [/^poetzsch\|Vand\/Danskvand og kildevand$/, "soda", "water"],
  [/^poetzsch\|Slik\/Chokolade$|^scandipark\|suesswaren\/(schokolade|pralinen)$/, "candy", "chocolate"],
  [/^poetzsch\|Slik\/Karameller$|^poetzsch\|Slik\/Bolsjer og slikkepinde$|^scandipark\|suesswaren\/bonbons-lutscher$/, "candy", "caramels"],
  [/^poetzsch\|Slik\/Tyggegummi og pastiller$/, "candy", "pastilles"],
  [/^poetzsch\|Slik\/Flødeboller og skum$|^scandipark\|suesswaren\/fruchtgummi$/, "candy", "gummies"],
  [/^scandipark\|suesswaren\/lakritz$/, "candy", "liquorice"],
  [/^poetzsch\|Dagligvarer\/Kaffe, te og kakao$|^scandipark\|lebensmittel\/kakao-tee-kaffee$/, "groceries", "coffee_tea"],
  [/^poetzsch\|Dagligvarer\/Morgenmadsprodukter$|^scandipark\|lebensmittel\/brotaufstriche$/, "groceries", "breakfast"],
  [
    /^poetzsch\|Dagligvarer\/(Pasta, ris og nudler|Konserves|Olie, eddike, krydderier og bouillon|Dressing og sauce|Bagning)$|^scandipark\|lebensmittel\/(gewuerze-saucen|konserven|backzutaten)$/,
    "groceries",
    "pantry",
  ],
  [/^poetzsch\|Husholdning\/Toiletpapir og køkkenrulle$/, "household", "paper"],
  [/^poetzsch\|Husholdning\/Engangsservice$/, "household", "wraps"],
];

/** Name keywords that settle a subcategory on their own (tested on family + listing names). */
const NAME_RULES: [RegExp, string, string][] = [
  [/\b0[,.]0 ?%|alkoholfri|alcohol[- ]?free|alkoholfrei|\bnordic\b/i, "beer", "alcohol_free_beer"],
  [/\bcider\b|somersby|rekorderlig|kopparberg|strongbow|mokai/i, "beer", "cider"],
  [/\b0[,.]0 ?%|alkoholfri|alcohol[- ]?free|alkoholfrei/i, "wine", "alcohol_free_wine"],
  [/champagne|\bcava\b|prosecco|cr[ée]mant|mousserende|\bsekt\b|spumante|\basti\b/i, "wine", "sparkling"],
  [/portvin|\bport(o)?\b|sherry|madeira|gløgg|glühwein/i, "wine", "fortified"],
  [/\btonic\b|ginger ale|bitter lemon/i, "soda", "mixers"],
  // Poetzsch files ice tea under "Danskvand og kildevand" and cereals under "Pasta, ris og
  // nudler" (subcategory check 2026-11-18), so these keywords beat the path.
  [/ice ?tea|iste\b/i, "soda", "soft_drinks"],
  [/kellogg|corn ?flakes|frosties|froot loops|krispies|müsli|musli|granola|cruesli|havregryn|cheerios|chocapic|smacks|special k/i, "groceries", "breakfast"],
];

export interface FamilyInfo {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  /** Shop listings: "shop|path" and name; on-sale ones first. */
  listings: { shop: string; path: string; name: string }[];
}

/** One subcategory every listing agrees on, from paths and name keywords - or null. */
export function ruleSubcategory(f: FamilyInfo): { sub: string; why: string } | null {
  const votes = new Map<string, string>();
  const allowed = allowedSubcategories(f.category);
  for (const l of f.listings) {
    const key = `${l.shop}|${l.path}`;
    const hit = PATH_RULES.find(([re, cat]) => cat === f.category && re.test(key));
    if (hit) votes.set(hit[2], `path ${key}`);
  }
  const text = [f.name, ...f.listings.map((l) => l.name)].join(" ; ");
  for (const [re, cat, sub] of NAME_RULES) if (cat === f.category && re.test(text)) votes.set(sub, `name /${re.source}/`);
  // Keywords beat paths: Poetzsch files an alcohol-free red under "Vin/Rødvin", a port
  // under "Vin/Rødvin" too. Alcohol-free beats everything; then one special keyword.
  const pickIf = (sub: string | undefined) => (sub && allowed.has(sub) ? { sub, why: votes.get(sub)! } : null);
  const alcoholFree = [...votes.keys()].find((k) => k.startsWith("alcohol_free"));
  if (alcoholFree) return pickIf(alcoholFree);
  const special = [...votes.keys()].filter((k) => ["cider", "fortified", "sparkling", "mixers", "soft_drinks", "breakfast"].includes(k));
  if (special.length === 1) return pickIf(special[0]);
  if (special.length > 1) return null;
  if (votes.size !== 1) return null;
  const [[sub, why]] = [...votes];
  return allowed.has(sub) ? { sub, why } : null;
}

// ---------------------------------------------------------------------------------------
// The model

const Answer = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      subcategory: z.string().describe('a subcategory id from the list for the family\'s top category, or "other"'),
      sure: z.boolean().describe("false when the name doesn't make it clear"),
    }),
  ),
});
type Answer = z.infer<typeof Answer>["items"][number];

function taxonomyText(): string {
  return TOP_CATEGORIES.map((c) => {
    const subs = c.subcategories.map((s) => `  - ${s.id}: ${s.label}${"hint" in s && s.hint ? ` (${s.hint})` : ""}`).join("\n");
    return `${c.id} - ${c.label}\n${subs}`;
  }).join("\n");
}

const INSTRUCTIONS = `You sort product families from a Danish border-shop price comparison site into
subcategories. A family is one product regardless of pack size (e.g. "Coca-Cola Zero", "Villa
Antinori Rosso"). You get its top category, its name and how shops list it (shop, the shop's own
category path, product name).

Taxonomy (top category id - label, then subcategory ids):
${"{TAXONOMY}"}

Rules:
- Pick a subcategory of the family's own top category.
- Exception: a family in candy or groceries that is chips, popcorn, crisps, nuts, peanuts,
  almonds, a nut mix, biscuits, cookies, crackers, cakes or wafers gets the matching snacks
  subcategory (chips, nuts or biscuits). Chocolate bars and chocolate-covered sweets stay
  chocolate; a chocolate biscuit (Kit Kat, Twix, Oreo) is biscuits only if it's mainly a
  biscuit (Oreo, digestive), else chocolate.
- Answer "other" when no subcategory fits (e.g. gift sets, mixed boxes, toys, pet food, a
  wine of unknown colour) and set sure=false whenever the name doesn't make it clear. An
  empty subcategory is safe; a wrong one is not.
- Beer: lager = pilsner/lager/premium lager; classic = classic, guld, export, strong lager;
  specialty = IPA, ale, wheat, stout, bock, christmas/easter beer, craft. Shandies/radler
  and alcopops that aren't cider: other.
- Soda: sugar_free for zero/light/max/free/sukkerfri versions of any soft drink or squash;
  energy drinks stay energy also when sugar-free; juice includes saft and syrup.
- Spirits: shots = small shot bottles and shot mixes (Fisk, Ga-Jol, Små Shots, minis packs);
  bitter = herbal bitters and aperitivo (Gammel Dansk, Jägermeister, Fernet, Campari, Aperol);
  ready-to-drink cans and cocktail mixes: other.`;

const instructions = () => INSTRUCTIONS.replace("{TAXONOMY}", taxonomyText());

const line = (f: FamilyInfo) =>
  `${f.id} | ${f.category} | ${f.name} | ${f.listings
    .slice(0, 3)
    .map((l) => `${l.shop} [${l.path || "-"}] "${l.name}"`)
    .join("; ")}`;

const cacheFile = (model: string, f: FamilyInfo) =>
  `${CACHE_DIR}/subcat-${model}-${createHash("sha1").update(`${instructions()}|${line(f)}`).digest("hex")}.json`;

function request(model: string, families: FamilyInfo[]) {
  return {
    model,
    max_tokens: 8000,
    output_config: { effort: "low" as const, format: zodOutputFormat(Answer) },
    system: instructions(),
    messages: [{ role: "user" as const, content: `id | top category | family | shop listings\n${families.map(line).join("\n")}` }],
  };
}

/** A model answer turned into a subcategory, or null (other / unsure / not allowed). */
function accept(f: FamilyInfo, a: Answer | undefined): string | null {
  if (!a || !a.sure || a.subcategory === "other") return null;
  // Plain crispbread is bread, not a biscuit (the model put Wasa Knækbrød there); crispbread snacks stay.
  if (a.subcategory === "biscuits" && /knækbrød|knäckebrot|crispbread/i.test(f.name) && !/snack/i.test(f.name)) return null;
  return allowedSubcategories(f.category).has(a.subcategory) ? a.subcategory : null;
}

function cached(model: string, f: FamilyInfo): Answer | undefined {
  const file = cacheFile(model, f);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}
function remember(model: string, families: FamilyInfo[], answers: Answer[]) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const byId = new Map(answers.map((a) => [a.id, a]));
  for (const f of families) {
    const a = byId.get(f.id);
    if (a) writeFileSync(cacheFile(model, f), JSON.stringify(a));
  }
}

/** Ask the model directly (cached per family). Returns answers and cost. */
async function askDirect(client: Anthropic, model: string, families: FamilyInfo[]) {
  let cost = 0;
  const todo = families.filter((f) => !cached(model, f));
  for (let i = 0; i < todo.length; i += CHUNK) {
    const part = todo.slice(i, i + CHUNK);
    const response = await client.messages.parse(request(model, part));
    if (response.stop_reason !== "end_turn" || !response.parsed_output) {
      console.warn(`  ${model}: stopped with ${response.stop_reason} - ${part.length} families skipped`);
      continue;
    }
    cost += costUsd(model, response.usage.input_tokens, response.usage.output_tokens);
    remember(model, part, response.parsed_output.items);
  }
  return { answers: new Map(families.map((f) => [f.id, cached(model, f)])), cost };
}

/**
 * Subcategory (and resulting top category) for families - used by the nightly match:new
 * for new families. Rules first, then the model (direct, cached). Never throws on an API
 * problem: those families just stay without a subcategory until the next run.
 */
export async function subcategoriesFor(client: Anthropic, families: FamilyInfo[]) {
  const result = new Map<number, { category: string; subcategory: string | null }>();
  const rest: FamilyInfo[] = [];
  for (const f of families) {
    const rule = ruleSubcategory(f);
    if (rule) result.set(f.id, { category: categoryFor(f.category, rule.sub), subcategory: rule.sub });
    else rest.push(f);
  }
  let cost = 0;
  try {
    const asked = await askDirect(client, SUBCATEGORY_MODEL, rest);
    cost = asked.cost;
    for (const f of rest) {
      const sub = accept(f, asked.answers.get(f.id));
      result.set(f.id, { category: categoryFor(f.category, sub), subcategory: sub });
    }
  } catch (e) {
    console.warn(`Subcategories: model call failed (${String(e).slice(0, 120)}) - left empty for now`);
  }
  return { result, cost };
}

// ---------------------------------------------------------------------------------------
// Loading and saving

interface ShopRow {
  id: number;
  shop_id: string;
  name: string;
  categories: string[];
  last_seen_at: string | null;
  listed_until: string | null;
}

export async function loadFamilies(onlyIds?: number[]): Promise<FamilyInfo[]> {
  const db = adminClient();
  const [families, products, matches, shopRows] = await Promise.all([
    fetchAll<{ id: number; name: string; category: string; subcategory: string | null }>((f, t) =>
      db.from("product_families").select("id, name, category, subcategory").order("id").range(f, t),
    ),
    fetchAll<{ id: number; family_id: number | null }>((f, t) => db.from("products").select("id, family_id").order("id").range(f, t)),
    fetchAll<{ shop_product_id: number; product_id: number }>((f, t) =>
      db.from("product_matches").select("shop_product_id, product_id").order("shop_product_id").range(f, t),
    ),
    fetchAll<ShopRow>((f, t) =>
      db.from("shop_products").select("id, shop_id, name, categories, last_seen_at, listed_until").order("id").range(f, t),
    ),
  ]);
  const familyOfProduct = new Map(products.map((p) => [p.id, p.family_id]));
  const shopById = new Map(shopRows.map((r) => [r.id, r]));
  const listings = new Map<number, ShopRow[]>();
  for (const m of matches) {
    const fam = familyOfProduct.get(m.product_id);
    const row = shopById.get(m.shop_product_id);
    if (fam == null || !row) continue;
    listings.set(fam, [...(listings.get(fam) ?? []), row]);
  }
  const wanted = onlyIds ? new Set(onlyIds) : null;
  return families
    .filter((f) => !wanted || wanted.has(f.id))
    .map((f) => ({
      ...f,
      listings: (listings.get(f.id) ?? [])
        .sort((a, b) => Number(isListed(b)) - Number(isListed(a)) || a.id - b.id)
        .map((r) => ({ shop: r.shop_id, path: r.categories.join("/"), name: r.name })),
    }));
}

/** Families on sale now (a listing seen in 3 days or a valid newsletter). */
export async function familiesOnSale(): Promise<Set<number>> {
  const db = adminClient();
  const rows = await fetchAll<{ product_id: number; products: { family_id: number | null } | { family_id: number | null }[] | null }>(
    (f, t) => db.from("matched_prices").select("product_id, products(family_id)").order("product_id").order("shop_product_id").range(f, t),
  );
  const out = new Set<number>();
  for (const r of rows) {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    if (p?.family_id != null) out.add(p.family_id);
  }
  return out;
}

/**
 * Write subcategories (and snacks moves). `changes`: family id -> new category + subcategory.
 * A move that would clash with an existing family of the same category and name joins it.
 */
export async function saveSubcategories(
  changes: Map<number, { from: string; category: string; subcategory: string | null; name: string }>,
  dryRun: boolean,
) {
  const db = adminClient();
  const moving = [...changes].filter(([, c]) => c.category !== c.from);
  const targetNames = [...new Set(moving.map(([, c]) => c.name))];
  const existing = new Map<string, number>();
  for (let i = 0; i < targetNames.length; i += 200) {
    const { data, error } = await db.from("product_families").select("id, name").eq("category", "snacks").in("name", targetNames.slice(i, i + 200));
    if (error) throw error;
    for (const f of data!) existing.set(f.name.toLowerCase(), f.id);
  }
  const joins: { from: number; into: number; name: string }[] = [];
  for (const [id, c] of moving) {
    const key = c.name.toLowerCase();
    const clash = existing.get(key);
    if (clash !== undefined && clash !== id) joins.push({ from: id, into: clash, name: c.name });
    else existing.set(key, id);
  }
  if (joins.length) console.log(`Same name already in snacks - products join it: ${joins.map((j) => `f${j.from} -> f${j.into} "${j.name}"`).join(", ")}`);
  if (dryRun) return;

  const joined = new Set(joins.map((j) => j.from));
  for (const j of joins) {
    const { error } = await db.from("products").update({ family_id: j.into }).eq("family_id", j.from);
    if (error) throw error;
    const { error: re } = await db.from("product_families").update({ name: `${j.name} (samlet i f${j.into})` }).eq("id", j.from);
    if (re) throw re;
  }
  let n = 0;
  for (const [id, c] of changes) {
    if (joined.has(id)) continue;
    const { error } = await db.from("product_families").update({ category: c.category, subcategory: c.subcategory }).eq("id", id);
    if (error) throw error;
    if (++n % 1000 === 0) process.stderr.write(`  saved ${n}\n`);
  }
  console.log(`Saved ${n} families (${joins.length} joined an existing snacks family).`);
}

// ---------------------------------------------------------------------------------------
// Commands

const todoFor = (families: FamilyInfo[]) => families.filter((f) => f.subcategory === null && !ruleSubcategory(f));

function estimate(families: FamilyInfo[]) {
  const chars = families.map(line).join("\n").length + instructions().length * Math.ceil(families.length / CHUNK);
  const inTok = chars / 3.2;
  const outTok = families.length * 18;
  return (model: string) => costUsd(model, inTok, outTok, true);
}

async function plan() {
  const families = await loadFamilies();
  const onSale = await familiesOnSale();
  const counts = new Map<string, number>();
  let ruled = 0;
  for (const f of families) {
    const r = ruleSubcategory(f);
    if (!r) continue;
    ruled++;
    const k = `${f.category}/${r.sub}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const todo = todoFor(families);
  console.log(`${families.length} families (${onSale.size} on sale); rules decide ${ruled}:`);
  for (const [k, n] of [...counts].sort()) console.log(`  ${k.padEnd(28)} ${n}`);
  const est = estimate(todo);
  console.log(`Left for the model: ${todo.length} (${todo.filter((f) => onSale.has(f.id)).length} on sale).`);
  console.log(`Batch cost estimate: Haiku ~$${est("claude-haiku-5-5").toFixed(2)}, Sonnet ~$${est("claude-sonnet-5-5").toFixed(2)}`);
}

async function compare(sampleSize: number) {
  const families = await loadFamilies();
  const onSale = await familiesOnSale();
  // Deterministic sample: half rule-labelled (the rule is the reference), half for the model.
  const pick = (xs: FamilyInfo[], n: number) => [...xs].sort((a, b) => ((a.id * 2654435761) % 1000) - ((b.id * 2654435761) % 1000)).slice(0, n);
  const live = families.filter((f) => onSale.has(f.id));
  const ruled = pick(live.filter((f) => ruleSubcategory(f)), sampleSize / 2);
  const open = pick(live.filter((f) => !ruleSubcategory(f)), sampleSize / 2);
  const sample = [...ruled, ...open];
  const client = new Anthropic();
  const models = ["claude-haiku-5-5", "claude-sonnet-5-5"];
  const got = new Map<string, Map<number, Answer | undefined>>();
  for (const m of models) {
    const { answers, cost } = await askDirect(client, m, sample);
    got.set(m, answers);
    console.log(`${m}: $${cost.toFixed(4)} (0 if cached)`);
  }
  const out: string[] = [];
  for (const m of models) {
    const a = got.get(m)!;
    const right = ruled.filter((f) => accept(f, a.get(f.id)) === ruleSubcategory(f)!.sub).length;
    const empty = ruled.filter((f) => accept(f, a.get(f.id)) === null).length;
    console.log(`${m} vs rules on ${ruled.length}: ${right} same, ${empty} left empty, ${ruled.length - right - empty} different`);
  }
  let agree = 0;
  for (const f of sample) {
    const [h, s] = models.map((m) => accept(f, got.get(m)!.get(f.id)));
    const rule = ruleSubcategory(f)?.sub ?? "";
    if (h === s && (!rule || h === rule)) agree++;
    out.push(`${h === s ? " " : "*"} f${f.id} [${f.category}] ${f.name}  rule=${rule || "-"}  haiku=${h ?? "-"}  sonnet=${s ?? "-"}  | ${f.listings.slice(0, 2).map((l) => l.name).join(" ; ")}`);
  }
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(`${MANIFEST_DIR}/subcat-compare.txt`, out.join("\n") + "\n");
  console.log(`Haiku and Sonnet agree (and match the rule where there is one) on ${agree}/${sample.length}. Lines: ${MANIFEST_DIR}/subcat-compare.txt`);
}

async function submit(model: string) {
  const families = await loadFamilies();
  const todo = todoFor(families).filter((f) => !cached(model, f));
  if (!todo.length) return console.log("Nothing to ask - every family is decided by a rule or cached.");
  const chunks: { customId: string; ids: number[] }[] = [];
  for (let i = 0; i < todo.length; i += CHUNK) chunks.push({ customId: `subcat-${i / CHUNK}`, ids: todo.slice(i, i + CHUNK).map((f) => f.id) });
  const byId = new Map(todo.map((f) => [f.id, f]));
  const client = new Anthropic();
  const batch = await client.messages.batches.create({
    requests: chunks.map((c) => ({ custom_id: c.customId, params: request(model, c.ids.map((id) => byId.get(id)!)) })),
  });
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(`${MANIFEST_DIR}/${batch.id}.json`, JSON.stringify({ batchId: batch.id, model, chunks }, null, 2));
  console.log(`Submitted ${todo.length} families in ${chunks.length} requests as batch ${batch.id} (estimate ~$${estimate(todo)(model).toFixed(2)}).`);
}

async function collect(batchId: string) {
  const manifest = JSON.parse(readFileSync(`${MANIFEST_DIR}/${batchId}.json`, "utf8")) as { model: string; chunks: { customId: string; ids: number[] }[] };
  const client = new Anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  const c = batch.request_counts;
  console.log(`Batch ${batchId}: ${batch.processing_status} (succeeded ${c.succeeded}, errored ${c.errored}, processing ${c.processing})`);
  if (batch.processing_status !== "ended") return;
  const families = new Map((await loadFamilies(manifest.chunks.flatMap((ch) => ch.ids))).map((f) => [f.id, f]));
  const chunkById = new Map(manifest.chunks.map((ch) => [ch.customId, ch]));
  let inTok = 0, outTok = 0, stored = 0;
  for await (const item of await client.messages.batches.results(batchId)) {
    const chunk = chunkById.get(item.custom_id);
    if (!chunk || item.result.type !== "succeeded" || item.result.message.stop_reason !== "end_turn") {
      console.warn(`  ${item.custom_id}: not usable - submit again to retry`);
      continue;
    }
    inTok += item.result.message.usage.input_tokens;
    outTok += item.result.message.usage.output_tokens;
    const text = item.result.message.content.find((b) => b.type === "text");
    const parsed = Answer.parse(JSON.parse(text?.type === "text" ? text.text : "{}"));
    const fams = chunk.ids.map((id) => families.get(id)).filter((f): f is FamilyInfo => !!f);
    remember(manifest.model, fams, parsed.items);
    stored += parsed.items.length;
  }
  console.log(`Stored ${stored} answers. Cost: $${costUsd(manifest.model, inTok, outTok, true).toFixed(2)} (batch price)`);
}

async function apply(save: boolean, model: string) {
  const families = await loadFamilies();
  const onSale = await familiesOnSale();
  const changes = new Map<number, { from: string; category: string; subcategory: string | null; name: string }>();
  const source = new Map<number, string>();
  let unanswered = 0;
  for (const f of families) {
    if (f.subcategory !== null) continue;
    const rule = ruleSubcategory(f);
    let sub: string | null;
    if (rule) {
      sub = rule.sub;
      source.set(f.id, "rule");
    } else {
      const a = cached(model, f);
      if (!a) unanswered++;
      sub = accept(f, a);
      source.set(f.id, "model");
    }
    // A family with no listings (e.g. emptied by a merge) keeps its category: moving it
    // could only clash with the full family of the same name.
    if (!f.listings.length && sub && SNACK_SUBS.has(sub)) sub = null;
    const category = f.listings.length ? categoryFor(f.category, sub) : f.category;
    if (sub !== null || category !== f.category) changes.set(f.id, { from: f.category, category, subcategory: sub, name: f.name });
  }
  // Counts per subcategory, all families and on sale.
  const count = new Map<string, [number, number]>();
  for (const f of families) {
    const c = changes.get(f.id);
    const k = `${c?.category ?? f.category}/${c?.subcategory ?? f.subcategory ?? "(Øvrige)"}`;
    const v = count.get(k) ?? [0, 0];
    v[0]++;
    if (onSale.has(f.id)) v[1]++;
    count.set(k, v);
  }
  console.log(`Families without a subcategory before: ${families.filter((f) => f.subcategory === null).length}; unanswered by ${model}: ${unanswered}`);
  console.log("Per subcategory (all families / on sale):");
  for (const [k, [all, live]] of [...count].sort()) console.log(`  ${k.padEnd(32)} ${String(all).padStart(5)} / ${String(live).padStart(5)}${live < 15 && !k.endsWith("(Øvrige)") ? "  <- under 15 on sale" : ""}`);
  const moves = [...changes].filter(([, c]) => c.category !== c.from);
  console.log(`\nMoves to snacks: ${moves.length} (from candy ${moves.filter(([, c]) => c.from === "candy").length}, groceries ${moves.filter(([, c]) => c.from === "groceries").length})`);
  // Sample: a few per subcategory, on sale first.
  const lines: string[] = [];
  for (const k of [...count.keys()].sort()) {
    const [cat, sub] = k.split("/");
    const members = families.filter((f) => {
      const c = changes.get(f.id);
      return (c?.category ?? f.category) === cat && (c?.subcategory ?? f.subcategory ?? "(Øvrige)") === sub;
    });
    const shown = [...members].sort((a, b) => Number(onSale.has(b.id)) - Number(onSale.has(a.id)) || ((a.id * 2654435761) % 997) - ((b.id * 2654435761) % 997)).slice(0, 8);
    lines.push(`${k}: ${shown.map((f) => `${f.name}${source.get(f.id) === "rule" ? "ʳ" : ""}`).join(" · ")}`);
  }
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(`${MANIFEST_DIR}/subcat-sample.txt`, lines.join("\n") + "\n");
  writeFileSync(
    `${MANIFEST_DIR}/subcat-snacks-moves.txt`,
    moves.map(([id, c]) => `f${id} ${c.from} -> snacks/${c.subcategory}  ${c.name}`).sort().join("\n") + "\n",
  );
  console.log(`Sample: ${MANIFEST_DIR}/subcat-sample.txt (ʳ = by rule); moves: ${MANIFEST_DIR}/subcat-snacks-moves.txt`);
  await saveSubcategories(changes, !save);
  if (!save) console.log("Dry run - nothing saved. Add --save to write.");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const model = opt("--model") ?? SUBCATEGORY_MODEL;
  if (command === "plan") return plan();
  if (command === "compare") return compare(Number(opt("--sample") ?? 100));
  if (command === "submit") return submit(model);
  if (command === "collect" && args[0]) return collect(args[0]);
  if (command === "apply") return apply(args.includes("--save"), model);
  console.error("Usage: subcategories.ts plan | compare [--sample N] | submit [--model M] | collect <batch-id> | apply [--save] [--model M]");
  process.exit(1);
}

// Only run as a script, not when match:new imports subcategoriesFor.
if (process.argv[1]?.endsWith("subcategories.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
