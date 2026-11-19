/**
 * Comparison unit per family for groceries and household (roadmap "stk. prices", step 2):
 * `product_families.compare_unit` ('l' | 'kg' | 'piece') and `piece_label` ("vask", "rulle", ...;
 * null = "stk."). Count-type items (tabs, capsules, rolls, bags, nappies) are compared per piece,
 * everything else per kg/l as today.
 *
 *   npx tsx --env-file-if-exists=.env.local src/matching/units.ts <command>
 *     plan                  rules only: what they decide, what's left for the model, cost
 *     rules                 every rule decision, for checking: data/llm-batches/units-rules.txt
 *     submit                the families the rules leave, as one Batch API job (half price)
 *     collect <batch-id>    store a finished batch's answers in the cache
 *     apply [--save]        rules + cached answers -> counts, data/llm-batches/units.txt; --save writes
 *     perfume [--save]      perfume families -> display_per "100 ml" (shown pr. 100 ml, still compared per l)
 *     dear [--save] [--with-100g]  families on sale at 1.000+ kr. per l/kg: one-at-a-time items -> piece,
 *                           small cosmetics -> "100 ml", small food packs -> "100 g"; spirits/wine/beer left alone
 *     nightly [--max-usd N] families of the last 3 days without a unit: rules, then the model directly;
 *                           over the cap (default $0.50) the model isn't asked and the run exits 1
 *
 * Rules first, on the family name and its shop listings: pet food and clear liquids/powders
 * keep their content unit; clear count words (tabs, kapsler, toiletpapir, affaldsposer, bleer,
 * æg, lys ...) give 'piece'. Laundry is 'piece' with "vask" only when a listing prints washes or
 * is pods/caps, else l/kg. A family no rule settles - unknown content, or a count word that isn't
 * clear on its own (tea, vitamins, "20 stk." with no context) - goes to the model, which may say
 * "not sure": such a family keeps null (as today). Piece counts don't decide anything here:
 * names give them for too few products (architect, 2026-11-19).
 *
 * Never overwrites a family whose compare_unit is already set (a human or an earlier run decided).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { adminClient, fetchAll } from "../db/admin";
import { costUsd } from "./llm";
import { familiesOnSale, loadFamilies, type FamilyInfo } from "./subcategories";

export const UNIT_MODEL = "claude-sonnet-5-5";
const CATEGORIES = ["groceries", "household"];
const CACHE_DIR = "data/llm-batches/cache";
const MANIFEST_DIR = "data/llm-batches";
const REVIEW_FILE = `${MANIFEST_DIR}/units.txt`;
const CHUNK = 100;
/** `nightly` looks at families created this many days back (a missed night is caught up). */
const RECENT_DAYS = 3;

type Unit = "l" | "kg" | "piece";
interface Decision {
  unit: Unit;
  label: string | null;
  why: string;
}
interface Family extends FamilyInfo {
  /** Content units of the family's products (null = unknown), and product names with content. */
  units: (string | null)[];
  /** Content in liters per product (null when not in l). */
  liters: (number | null)[];
  products: string[];
}

// ---------------------------------------------------------------------------------------
// Perfume: shown "pr. 100 ml" (display only - still compared per liter; decided 2026-11-19)

const PERFUME = /eau de toilette|eau de parfum|eau de cologne|\bparfum\b|\bparfume\b|\bperfume\b|\bparfüm\b|\bcologne\b|\bedt[sp]?\b|\bedp\b|after ?shave|body ?mist/;
/** Per liter on purpose: deodorant, shampoo, shower gel, soap, creams - and "parfumefri" products. */
const NOT_PERFUME = /deo|antiperspirant|roll-on|shampoo|balsam|balm|shower|brusegel|brusebad|dusch|sæbe|soap|seife|lotion|creme|cream|parfumefri|uden parfume|ohne parfum|parfümfrei|fragrance.?free/;
/** Perfume sizes: every product with a known content at most this many liters (aftershave and body mist included). */
const PERFUME_MAX_L = 0.25;

export function isPerfume(f: Family): boolean {
  if (f.category !== "household") return false;
  const t = textOf(f);
  if (!PERFUME.test(t) || NOT_PERFUME.test(t)) return false;
  return f.liters.every((l) => l === null || l <= PERFUME_MAX_L) && f.units.every((u) => u === null || u === "l");
}

// ---------------------------------------------------------------------------------------
// Rules

const PET = /foder|whiskas|pedigree|dreamies|vitakraft|zooroyal|kattegrus|katte|chrisco|frolic|frolig|topdog|jollypaw|dogman|felix|sheba|gourmet|hunde|undulat|marsvin|kanin|\bkat\b|hundesnack|tyggeben|jumbone|dentastix|dentabites/;
/** Words that make a household item a liquid, cream, powder or spray: compared per l/kg. */
const LIQUID = /shampoo|balsam|showergel|shower gel|brusegel|brusebad|dusche|duschgel|deo|parfum|eau de|cologne|aftershave|tandpasta|zahnpasta|creme|cream|lotion|spray|sæbe|seife|olie|gel\b|rens\b|universalrens|opvaskemiddel|håndopvask|flydende|pulver|powder|salt\b|eddike|afkalker|kalkfjerner|klorin|hårvoks|voks|wax|mundskyl|skyllemiddel|vaskemiddel|plet|vanish|lampeolie|lightergas|\bgas\b/;

/** Laundry with printed washes (or pods/caps): per wash. */
const WASHES = /\d+\s*(vaske\b|vasker\b|vask\b|wl\b|washes|wäschen|wg\b|scoops)|\bpods\b|\bcaps\b|kapsler|kapseln|discs|pouches|\btabs\b/;
const DISHWASHER_TABS = /tabs?\b|tabletter|tabletten|quantum|all.?in.?(1|one)|\bcaps\b|kapsler/;
const DISHWASHER = /opvask|maskin|dishwasher|spülmaschine|geschirr|finish|fairy|neutral|somat|sun\b|ecover|blå/;
const ROLLS = /(?<!fugtigt )toiletpapir|toilet ?papir|toiletrulle|køkkenrul|husholdningsrul|husholdningspapir|klopapier|toilettenpapier|küchenrolle|lambi|lotus|serla|tork/;
const BAGS = /affaldspose|affaldssæk|affaldsposer|affaldssække|skraldepose|fryseposer|frysepose|madpose|plastpose|bæreposer|müllbeutel|gefrierbeutel|hundeposer|\bposer\b|\bsække?\b|\bbags?\b/;
const COUNT_ITEMS: [RegExp, string][] = [
  [/vådserviet|vådservietter|babyservietter|wipes|feuchttücher|renseservietter|servietter|lommetørklæde|kleenex|ansigtsservietter|klude|microfiberklud/, "wipes/napkins"],
  [/\bbleer\b|libero|pampers|bukseble|natbukser|huggies (?!.*serviet)/, "nappies"],
  [/\bbind\b|binde|libresse|always\b|tampon|o\.b\.|trusseindlæg|inkontinens|tena\b/, "pads"],
  [/engangs|flergangs|kaffekop|paptallerken|tallerken|bestik|gafler|\bknive\b|\bskeer\b|plastkrus|papkrus|\bkrus\b|bæger|bægre|sugerør|\bkopper\b|rødvinglas|hvidvinsglas|vinglas|champagneglas|ølglas|drikkeglas|\bglas\b|træspyd|grillspyd|cocktailpinde|kagepynt/, "tableware"],
  [/\blys\b|stearinlys|fyrfadslys|bloklys|kronelys|antiklys|kerze|teelicht|lighter|fyrtøj|tændstik|tændblok|optændingsblok/, "candles/lighters"],
  [/barberblad|barberblade|skraber|klinger|tandbørst|zahnbürste|plaster|batteri|svamp|skuresvamp|grydesvamp|\bpære\b|pærer|led\b|lyskæde|vatpinde|vatrondel|bomuldspind|q-tips|tandstikker|tandtråd|wc-?blok|toiletblok|wc frisch|wc-stein|duftblok|elastikker|hårelastik/, "count item"],
];
/** Danish letters aren't word characters for \b, so "pålæg" would match \bæg\b. */
const EGGS = /(^|[^a-zæøåäöüß])(æg|eier)([^a-zæøåäöüß]|$)|skrabeæg|frilandsæg|buræg|økoæg/;
const CAPSULES = /kapsl|kapsel|capsul|kapseln|dolce gusto|tassimo|nespresso|k-fee|cápsulas|\bpods\b/;
const PADS = /kaffepude|kaffepuder|senseo|\bpads\b/;
const TABLETS = /tablet|tabletter|tabletten|brusetablet|brausetablet|sødetablet|tyggetablet|ampul|kapsler\b/;
/** Count words that need a look (no context of their own): such families go to the model. */
const UNCLEAR = /\d+\s*(stk|stück|er\b|x\b|breve|teposer|beutel|bags)|\bte\b|\btea\b|\btee\b|vitamin|kosttilskud|elektrolyt|kapsler/;

const textOf = (f: Family) => [f.name, ...f.listings.map((l) => l.name)].join(" ; ").toLowerCase();

/** Content unit all products agree on (l or kg), or null. */
function contentUnit(f: Family): Unit | null {
  const known = new Set(f.units.filter((u): u is string => !!u));
  if (known.size !== 1) return null;
  const [u] = known;
  return u === "l" || u === "kg" || u === "piece" ? u : null;
}

export function ruleUnit(f: Family): Decision | null {
  const t = textOf(f);
  const content = contentUnit(f);
  const byContent = (why: string): Decision | null => (content && content !== "piece" ? { unit: content, label: null, why } : null);

  if (f.category === "household") {
    if (/hundeposer|hundeaffaldsposer|affaldsposer/.test(t)) return { unit: "piece", label: "pose", why: "bags" };
    if (PET.test(t)) return byContent("pet food");
    if (/fugtigt toiletpapir/.test(t)) return { unit: "piece", label: null, why: "moist toilet paper (a pack of wipes)" };
    if (f.subcategory === "laundry" || /(?<!op)vaskemiddel|vaskepulver|skyllemiddel|colorvask|vaskekapsler|wäsche/.test(t)) {
      if (WASHES.test(t)) return { unit: "piece", label: "vask", why: "laundry, washes printed" };
      return byContent("laundry, no washes printed");
    }
    if (DISHWASHER_TABS.test(t) && DISHWASHER.test(t)) return { unit: "piece", label: "tab", why: "dishwasher tabs" };
    if (ROLLS.test(t)) return { unit: "piece", label: "rulle", why: "paper rolls" };
    if (BAGS.test(t) && !LIQUID.test(t)) return { unit: "piece", label: "pose", why: "bags" };
    for (const [re, why] of COUNT_ITEMS) if (re.test(t) && !LIQUID.test(t)) return { unit: "piece", label: null, why };
    if (LIQUID.test(t)) return byContent("liquid/cream/powder");
    if (UNCLEAR.test(t)) return null;
    return byContent("content unit");
  }

  // Groceries
  if (EGGS.test(t) && !/nudler|pasta|nudeln|likør|salat|æggehvide/.test(t)) return { unit: "piece", label: null, why: "eggs" };
  if (PADS.test(t)) return { unit: "piece", label: "pude", why: "coffee pads" };
  if (CAPSULES.test(t) && (f.subcategory === "coffee_tea" || /kaffe|coffee|espresso|lungo|cappuccino|latte|kakao|chococino|café|caffe|crema/.test(t)))
    return { unit: "piece", label: "kapsel", why: "coffee capsules" };
  if (TABLETS.test(t) && !/chokolade|schokolade|choco/.test(t)) return { unit: "piece", label: null, why: "tablets" };
  // Tea: bags or loose, and whether packs are sold by count - the model reads that.
  if (f.subcategory === "coffee_tea" && /te\b|tea\b|tee\b|teekanne|pukka|yogi|pickwick|twinings|lipton|rooibos/.test(t) && !/latte|ice ?tea|iced|eistee/.test(t)) return null;
  if (UNCLEAR.test(t) && (f.subcategory === "coffee_tea" || f.subcategory === null)) return null;
  return byContent("content unit");
}

// ---------------------------------------------------------------------------------------
// The model

const Answer = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      unit: z.enum(["l", "kg", "piece"]),
      label: z.string().describe('for piece: "vask", "rulle", "pose", "kapsel", "pude", "tab", or "" for stk.'),
      sure: z.boolean().describe("false when the names don't make it clear"),
    }),
  ),
});
type Answer = z.infer<typeof Answer>["items"][number];

const INSTRUCTIONS = `You decide how a Danish border-shop price comparison site compares products in a
family: per liter ("l"), per kilogram ("kg") or per piece ("piece"). A family is one product
regardless of pack size. You get its category, its name and the shops' listing names (Danish
and German), with the content the products are stored with.

- "piece" when shoppers buy and compare a count: dishwasher tabs, coffee capsules and pads,
  eggs, toilet paper and kitchen rolls, bags and sacks, wipes and napkins, nappies, sanitary
  pads, disposable tableware and cutlery, candles, lighters, razor blades, tea bags (when packs
  are sold by number of bags: "20 breve", "20 stk.", "20er"), vitamin and other tablets or
  capsules, electrolyte tablets, sweetener tablets.
- "kg" or "l" for food and drink, loose tea, powders, liquids, creams, sprays, toothpaste,
  perfume, pet food. Pick the unit the content is stored in when it is known; otherwise the one
  that fits the product (drinks and liquids l, food and powders kg).
- Laundry: "piece" with label "vask" only for pods/caps/tabs or packs that print washes;
  otherwise l/kg.
- label: for piece only - "vask" (laundry washes), "rulle" (rolls), "pose" (bags, also tea
  bags), "kapsel" (capsules), "pude" (coffee pads), "tab" (dishwasher tabs); "" for plain stk.
  For l/kg answer "".
- sure=false when the names don't make clear what the product is or how it is sold. A wrong
  unit makes the site call the wrong product cheapest; unsure is safe.`;

const line = (f: Family) =>
  `${f.id} | ${f.category}/${f.subcategory ?? "-"} | ${f.name} | ${[...new Set([...f.products, ...f.listings.map((l) => l.name)])].slice(0, 5).join("; ")}`;

const cacheFile = (f: Family) => `${CACHE_DIR}/unit-${UNIT_MODEL}-${createHash("sha1").update(`${INSTRUCTIONS}|${line(f)}`).digest("hex")}.json`;
const cached = (f: Family): Answer | undefined => (existsSync(cacheFile(f)) ? JSON.parse(readFileSync(cacheFile(f), "utf8")) : undefined);

function request(families: Family[]) {
  return {
    model: UNIT_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low" as const, format: zodOutputFormat(Answer) },
    system: INSTRUCTIONS,
    messages: [{ role: "user" as const, content: `id | category/subcategory | family | products and listings\n${families.map(line).join("\n")}` }],
  };
}

function accept(a: Answer | undefined): Decision | null {
  if (!a || !a.sure) return null;
  const label = a.unit === "piece" && a.label.trim() ? a.label.trim().slice(0, 20) : null;
  return { unit: a.unit, label, why: "model" };
}

// ---------------------------------------------------------------------------------------
// Loading

async function load(): Promise<{ families: Family[]; set: Map<number, { unit: string | null }> }> {
  const db = adminClient();
  const infos = (await loadFamilies()).filter((f) => CATEGORIES.includes(f.category));
  const products = await fetchAll<{ family_id: number | null; name: string; content_amount: number | null; content_unit: string | null }>((f, t) =>
    db.from("products").select("family_id, name, content_amount, content_unit").not("family_id", "is", null).order("id").range(f, t),
  );
  const byFamily = new Map<number, typeof products>();
  for (const p of products) byFamily.set(p.family_id!, [...(byFamily.get(p.family_id!) ?? []), p]);
  // compare_unit exists only once the migration has run; before that every family counts as unset.
  const set = new Map<number, { unit: string | null }>();
  const probe = await db.from("product_families").select("id, compare_unit").limit(1);
  if (!probe.error) {
    const rows = await fetchAll<{ id: number; compare_unit: string | null }>((f, t) =>
      db.from("product_families").select("id, compare_unit").in("category", CATEGORIES).order("id").range(f, t),
    );
    for (const r of rows) set.set(r.id, { unit: r.compare_unit });
  }
  const families = infos.map((f) => {
    const ps = byFamily.get(f.id) ?? [];
    return {
      ...f,
      units: ps.map((p) => p.content_unit),
      liters: ps.map((p) => (p.content_unit === "l" && p.content_amount !== null ? Number(p.content_amount) : null)),
      products: ps.map((p) => `${p.name} [${p.content_amount ?? "?"} ${p.content_unit ?? "?"}]`),
    };
  });
  return { families, set };
}

const open = (families: Family[], set: Map<number, { unit: string | null }>) =>
  families.filter((f) => !set.get(f.id)?.unit && (f.products.length || f.listings.length));

function estimate(families: Family[]) {
  const chars = families.map(line).join("\n").length + INSTRUCTIONS.length * Math.ceil(families.length / CHUNK);
  return costUsd(UNIT_MODEL, chars / 3.2, families.length * 25, true);
}

// ---------------------------------------------------------------------------------------
// Commands

async function plan() {
  const { families, set } = await load();
  const todo = open(families, set);
  const counts = new Map<string, number>();
  const left: Family[] = [];
  for (const f of todo) {
    const d = ruleUnit(f);
    if (!d) {
      left.push(f);
      continue;
    }
    const k = `${f.category} ${d.unit}${d.label ? `/${d.label}` : ""} (${d.why})`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  console.log(`${families.length} grocery/household families, ${todo.length} without a unit and with products${set.size ? "" : " (migration not run yet)"}.`);
  for (const [k, n] of [...counts].sort()) console.log(`  ${k.padEnd(52)} ${n}`);
  console.log(`Left for the model: ${left.length}; batch estimate ~$${estimate(left).toFixed(2)} (${UNIT_MODEL}).`);
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(`${MANIFEST_DIR}/units-open.txt`, left.map(line).join("\n") + "\n");
  console.log(`Families left: ${MANIFEST_DIR}/units-open.txt`);
}

async function submit() {
  const { families, set } = await load();
  const todo = open(families, set).filter((f) => !ruleUnit(f) && !cached(f));
  if (!todo.length) return console.log("Nothing to ask - every family is decided by a rule or cached.");
  const chunks: { customId: string; ids: number[] }[] = [];
  for (let i = 0; i < todo.length; i += CHUNK) chunks.push({ customId: `unit-${i / CHUNK}`, ids: todo.slice(i, i + CHUNK).map((f) => f.id) });
  const byId = new Map(todo.map((f) => [f.id, f]));
  const batch = await new Anthropic().messages.batches.create({
    requests: chunks.map((c) => ({ custom_id: c.customId, params: request(c.ids.map((id) => byId.get(id)!)) })),
  });
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(`${MANIFEST_DIR}/${batch.id}.json`, JSON.stringify({ batchId: batch.id, model: UNIT_MODEL, chunks }, null, 2));
  console.log(`Submitted ${todo.length} families in ${chunks.length} requests as batch ${batch.id} (estimate ~$${estimate(todo).toFixed(2)}).`);
}

async function collect(batchId: string) {
  const manifest = JSON.parse(readFileSync(`${MANIFEST_DIR}/${batchId}.json`, "utf8")) as { chunks: { customId: string; ids: number[] }[] };
  const client = new Anthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  const c = batch.request_counts;
  console.log(`Batch ${batchId}: ${batch.processing_status} (succeeded ${c.succeeded}, errored ${c.errored}, processing ${c.processing})`);
  if (batch.processing_status !== "ended") return;
  const families = new Map((await load()).families.map((f) => [f.id, f]));
  const chunkById = new Map(manifest.chunks.map((ch) => [ch.customId, ch]));
  let inTok = 0, outTok = 0, stored = 0;
  mkdirSync(CACHE_DIR, { recursive: true });
  for await (const item of await client.messages.batches.results(batchId)) {
    const chunk = chunkById.get(item.custom_id);
    if (!chunk || item.result.type !== "succeeded" || item.result.message.stop_reason !== "end_turn") {
      console.warn(`  ${item.custom_id}: not usable - submit again to retry`);
      continue;
    }
    inTok += item.result.message.usage.input_tokens;
    outTok += item.result.message.usage.output_tokens;
    const text = item.result.message.content.find((b) => b.type === "text");
    const answers = Answer.parse(JSON.parse(text?.type === "text" ? text.text : "{}")).items;
    for (const a of answers) {
      const f = families.get(a.id);
      if (f && chunk.ids.includes(a.id)) {
        writeFileSync(cacheFile(f), JSON.stringify(a));
        stored++;
      }
    }
  }
  console.log(`Stored ${stored} answers. Cost: $${costUsd(UNIT_MODEL, inTok, outTok, true).toFixed(2)} (batch price)`);
}

async function apply(save: boolean) {
  const { families, set } = await load();
  const onSale = await familiesOnSale();
  const decided = new Map<number, Decision>();
  let unsure = 0;
  for (const f of open(families, set)) {
    const d = ruleUnit(f) ?? accept(cached(f));
    if (d) decided.set(f.id, d);
    else unsure++;
  }
  const counts = new Map<string, number>();
  for (const d of decided.values()) {
    const k = `${d.unit}${d.label ? `/${d.label}` : ""}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  console.log(`Decided ${decided.size}; left null (as today): ${unsure}.`);
  for (const [k, n] of [...counts].sort()) console.log(`  ${k.padEnd(16)} ${n}`);

  // Review list: every 'piece' family with its products, on-sale ones first.
  const pieces = families
    .filter((f) => decided.get(f.id)?.unit === "piece")
    .sort((a, b) => Number(onSale.has(b.id)) - Number(onSale.has(a.id)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "da"));
  const out = [
    `Families compared per piece (${pieces.length}; ${pieces.filter((f) => onSale.has(f.id)).length} on sale), ${new Date().toISOString().slice(0, 10)}.`,
    `Format: f<id> category/subcategory  name  -> pr. <label> (why); then its products [content].`,
    "",
  ];
  for (const f of pieces) {
    const d = decided.get(f.id)!;
    out.push(`${onSale.has(f.id) ? " " : "-"} f${f.id} ${f.category}/${f.subcategory ?? "-"}  ${f.name}  -> pr. ${d.label ?? "stk."} (${d.why})`);
    for (const p of f.products) out.push(`      ${p}`);
  }
  mkdirSync(MANIFEST_DIR, { recursive: true });
  writeFileSync(REVIEW_FILE, out.join("\n") + "\n");
  console.log(`Review list: ${REVIEW_FILE}`);

  if (!save) return console.log("Dry run - nothing saved.");
  if (!set.size) throw new Error("product_families.compare_unit doesn't exist yet - run the migration first.");
  console.log(`Saved ${await saveUnits(decided)} families.`);
}

/** Write units, one update per unit/label. Only where still unset, so a unit set meanwhile (by hand) is never overwritten. */
async function saveUnits(decided: Map<number, Decision>) {
  const db = adminClient();
  const groups = new Map<string, { d: Decision; ids: number[] }>();
  for (const [id, d] of decided) {
    const k = `${d.unit}|${d.label ?? ""}`;
    groups.set(k, { d, ids: [...(groups.get(k)?.ids ?? []), id] });
  }
  for (const { d, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db
        .from("product_families")
        .update({ compare_unit: d.unit, piece_label: d.label })
        .in("id", ids.slice(i, i + 200))
        .is("compare_unit", null);
      if (error) throw error;
    }
  }
  return decided.size;
}

/**
 * Nightly, after match:new: units for families that still have none (new families). Rules
 * first; the rest asked directly (cached). If the estimate for those is over `maxUsd`, the
 * rule decisions are still saved but the model isn't asked and the run fails (exit 1), so
 * GitHub emails - a big set should go through submit/collect/apply by hand instead.
 */
async function nightly(maxUsd: number) {
  const { families, set } = await load();
  if (!set.size) throw new Error("product_families.compare_unit doesn't exist yet - run the migration first.");
  // Only recent families: the runner has no answer cache, so older ones the model was unsure
  // about (left null on purpose) would otherwise be asked again every night.
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: recent, error } = await adminClient().from("product_families").select("id").gte("created_at", since).in("category", CATEGORIES);
  if (error) throw error;
  const recentIds = new Set((recent ?? []).map((r) => r.id as number));
  const todo = open(families, set).filter((f) => recentIds.has(f.id));
  const decided = new Map<number, Decision>();
  const ask: Family[] = [];
  for (const f of todo) {
    const d = ruleUnit(f) ?? accept(cached(f));
    if (d) decided.set(f.id, d);
    else if (!cached(f)) ask.push(f);
  }
  const est = estimate(ask) * 2; // direct API: full price, not batch
  let failed = false;
  if (ask.length && est > maxUsd) {
    console.error(`::error::${ask.length} families need the model (~$${est.toFixed(2)}), over the $${maxUsd} cap - not asked. Run units.ts submit / collect / apply --save by hand.`);
    failed = true;
  } else if (ask.length) {
    const client = new Anthropic();
    let cost = 0;
    for (let i = 0; i < ask.length; i += CHUNK) {
      const part = ask.slice(i, i + CHUNK);
      const response = await client.messages.parse(request(part));
      if (response.stop_reason !== "end_turn" || !response.parsed_output) {
        console.warn(`  stopped with ${response.stop_reason} - ${part.length} families left for the next run`);
        continue;
      }
      cost += costUsd(UNIT_MODEL, response.usage.input_tokens, response.usage.output_tokens);
      mkdirSync(CACHE_DIR, { recursive: true });
      const byId = new Map(response.parsed_output.items.map((a) => [a.id, a]));
      for (const f of part) {
        const a = byId.get(f.id);
        if (!a) continue;
        writeFileSync(cacheFile(f), JSON.stringify(a));
        const d = accept(a);
        if (d) decided.set(f.id, d);
      }
    }
    console.log(`Asked ${UNIT_MODEL} about ${ask.length} families: $${cost.toFixed(3)}.`);
  }
  for (const [id, d] of decided) {
    const f = families.find((x) => x.id === id)!;
    console.log(`  f${id} ${f.name}: ${d.unit}${d.label ? `/${d.label}` : ""} (${d.why})`);
  }
  console.log(`Families of the last ${RECENT_DAYS} days without a unit: ${todo.length}; set now: ${await saveUnits(decided)}; left null: ${todo.length - decided.size}.`);
  const perfumes = await perfume(true, recentIds, true);
  console.log(perfumes === null ? "Perfume display: display_per column not there yet - skipped." : `Perfume families set to "pr. 100 ml": ${perfumes}.`);
  // The 1.000 kr. flag on new families of every category (rules only; the rest a warning in the log).
  const { data: recentAll, error: e2 } = await adminClient().from("product_families").select("id").gte("created_at", since);
  if (e2) throw e2;
  const flagged = await dear(true, true, new Set((recentAll ?? []).map((r) => r.id as number)), true);
  console.log(`1.000+ kr. per unit: ${flagged.decided} families set, ${flagged.review} left for review.`);
  if (failed) process.exit(1);
}

/**
 * Perfume families -> display_per '100 ml'. Only fills null. `ids`: limit to these families
 * (nightly: recent ones). Returns how many were set, or null when the column doesn't exist yet.
 */
async function perfume(save: boolean, ids?: Set<number>, quiet = false): Promise<number | null> {
  const db = adminClient();
  const probe = await db.from("product_families").select("id, display_per").limit(1);
  const columnExists = !probe.error;
  const current = new Map<number, string | null>();
  if (columnExists) {
    const rows = await fetchAll<{ id: number; display_per: string | null }>((f, t) =>
      db.from("product_families").select("id, display_per").eq("category", "household").order("id").range(f, t),
    );
    for (const r of rows) current.set(r.id, r.display_per);
  }
  const { families } = await load();
  const hits = families.filter((f) => (!ids || ids.has(f.id)) && isPerfume(f) && !current.get(f.id));
  if (!quiet) {
    for (const f of hits.sort((a, b) => a.name.localeCompare(b.name, "da"))) console.log(`  f${f.id} ${f.name} | ${f.products.slice(0, 2).join("; ")}`);
    // What the rule leaves out among perfume-sounding families, to check the exclusions.
    const near = families.filter((f) => (!ids || ids.has(f.id)) && f.category === "household" && PERFUME.test(textOf(f)) && !isPerfume(f));
    console.log(`\nLeft per liter (perfume words, but excluded or not perfume-sized): ${near.length}`);
    for (const f of near) console.log(`  - f${f.id} ${f.name} | ${f.products.slice(0, 2).join("; ")}`);
    console.log(`\nPerfume families to show "pr. 100 ml": ${hits.length}${columnExists ? "" : " (display_per column not there yet)"}`);
  }
  if (!save || !columnExists) {
    if (save) console.log("display_per doesn't exist yet - run the migration first; nothing saved.");
    return columnExists ? 0 : null;
  }
  const hitIds = hits.map((f) => f.id);
  for (let i = 0; i < hitIds.length; i += 200) {
    const { error } = await db.from("product_families").update({ display_per: "100 ml" }).in("id", hitIds.slice(i, i + 200)).is("display_per", null);
    if (error) throw error;
  }
  return hitIds.length;
}

// ---------------------------------------------------------------------------------------
// Review flag: 1.000 kr. or more per l/kg (decided 2026-11-20 - a flag, not a rule)

const DEAR_PER_UNIT = 1000;
/** Real prices that vary by bottle size: stay per l (a per-bottle price would let the small one win). */
const DEAR_LEAVE = new Set(["spirits", "wine", "beer"]);
/** Sold one at a time - weight/volume is meaningless: novelty candy with toys, gift sets, lip balm, toys. */
const ONE_AT_A_TIME =
  /\bpez\b|lolly pop ?up|kinder surprise|surprise fan|choco biterz|scan choco|chokoladefrø|gavesæt|gift ?set|\bset\b|lip smacker|plys|legetøj|holy (energy|hydration)/;

interface DearDecision {
  familyId: number;
  name: string;
  /** 'piece' with counts per product, or a display_per. */
  action: { piece: Map<number, number | null> } | { displayPer: "100 g" | "100 ml" };
  why: string;
}

/** Pieces in one pack from the name: "3x7g" 3, "7 overraskelsesæg" 7, "6er" 6; else 1 for a single novelty item; null if unsure. */
function dearCount(names: string[], contentKg: number | null): number | null {
  // Printed counts in the product name and its listings' names; two different ones -> unsure.
  const printed = new Set<number>();
  for (const name of names) {
    const n = name.toLowerCase();
    const m = n.match(/(\d+)\s*x\s*\d+(?:[.,]\d+)?\s*g\b/) ?? n.match(/(\d+)\s*(?:overraskelsesæg|stk\.?|styk|er)\b/);
    if (m) printed.add(Number(m[1]));
  }
  if (printed.size) return printed.size === 1 ? [...printed][0] : null;
  // HOLY sticks are sold as 3 x 7 g; a 21 g pack without the "3x7g" is the same pack.
  if (names.some((n) => /holy/i.test(n))) return contentKg !== null && Math.abs(contentKg - 0.021) < 0.0005 ? 3 : null;
  return 1;
}

/** Decide one flagged family (null = leave as is and list for review). */
function dearDecision(
  f: { id: number; name: string; category: string; compare_unit: string | null },
  products: { id: number; name: string; content_amount: number | null; content_unit: string | null; listingNames?: string[] }[],
): DearDecision | null {
  if (DEAR_LEAVE.has(f.category) || f.compare_unit === "piece") return null;
  const text = [f.name, ...products.map((p) => p.name)].join(" ; ").toLowerCase();
  if (ONE_AT_A_TIME.test(text)) {
    const counts = new Map(
      products.map((p) => [p.id, dearCount([p.name, ...(p.listingNames ?? [])], p.content_unit === "kg" ? Number(p.content_amount) : null)] as const),
    );
    return { familyId: f.id, name: f.name, action: { piece: counts }, why: "sold one at a time" };
  }
  const units = new Set(products.map((p) => p.content_unit).filter(Boolean));
  if (units.size !== 1) return null;
  const [unit] = units;
  const small = products.every((p) => p.content_amount !== null && Number(p.content_amount) <= 0.1);
  if (unit === "l" && f.category === "household" && small) return { familyId: f.id, name: f.name, action: { displayPer: "100 ml" }, why: "small cosmetics pack" };
  if (unit === "kg" && f.category === "groceries" && small) return { familyId: f.id, name: f.name, action: { displayPer: "100 g" }, why: "small food pack (spice, dried fruit, snack)" };
  return null;
}

/**
 * Families on sale at >= 1.000 kr. per l/kg (matched_prices.price_per_unit), without a display_per:
 * rules move one-at-a-time items to 'piece' (with piece counts on their products), small cosmetics
 * to "pr. 100 ml" and small food packs to "pr. 100 g"; spirits, wine and beer are left alone (real
 * prices). Anything else is listed for review. `ids`: only these families (nightly: recent ones).
 * '100 g' is only written with `with100g` (needs migration 2026-11-20 allowing that value).
 */
async function dear(save: boolean, with100g: boolean, ids?: Set<number>, quiet = false) {
  const db = adminClient();
  const rows = await fetchAll<{ product_id: number; shop_product_id: number; price_per_unit: number }>((f, t) =>
    db.from("matched_prices").select("product_id, shop_product_id, price_per_unit").gte("price_per_unit", DEAR_PER_UNIT).order("product_id").order("shop_product_id").range(f, t),
  );
  const flaggedProducts = [...new Set(rows.map((r) => r.product_id))];
  const prodRows = await fetchAll<{ id: number; family_id: number | null }>((f, t) => db.from("products").select("id, family_id").in("id", flaggedProducts).order("id").range(f, t));
  const familyIds = [...new Set(prodRows.map((p) => p.family_id).filter((x): x is number => x !== null))].filter((id) => !ids || ids.has(id));
  if (!familyIds.length) {
    if (!quiet) console.log("No flagged families.");
    return { decided: 0, review: 0 };
  }
  const fams = await fetchAll<{ id: number; name: string; category: string; compare_unit: string | null; display_per: string | null }>((f, t) =>
    db.from("product_families").select("id, name, category, compare_unit, display_per").in("id", familyIds).order("id").range(f, t),
  );
  const prods = await fetchAll<{ id: number; name: string; family_id: number; content_amount: number | null; content_unit: string | null; piece_count: number | null }>((f, t) =>
    db.from("products").select("id, name, family_id, content_amount, content_unit, piece_count").in("family_id", familyIds).order("id").range(f, t),
  );
  // The shops' own names, for printed counts ("Mascot fyldt med 7 overraskelsesæg").
  const listed = await fetchAll<{ product_id: number; shop_product_id: number; name: string }>((f, t) =>
    db.from("matched_prices").select("product_id, shop_product_id, name").in("product_id", prods.map((p) => p.id)).order("product_id").order("shop_product_id").range(f, t),
  );
  const withNames = prods.map((p) => ({ ...p, listingNames: listed.filter((l) => l.product_id === p.id).map((l) => l.name) }));
  const decisions: DearDecision[] = [];
  const review: string[] = [];
  let left = 0;
  for (const f of fams.filter((x) => !x.display_per).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "da"))) {
    const ps = withNames.filter((p) => p.family_id === f.id);
    const d = dearDecision(f, ps);
    if (d) decisions.push(d);
    else if (DEAR_LEAVE.has(f.category) || f.compare_unit === "piece") left++;
    else review.push(`f${f.id} ${f.category} ${f.name} | ${ps.slice(0, 2).map((p) => `${p.name} [${p.content_amount ?? "?"} ${p.content_unit ?? ""}]`).join("; ")}`);
  }
  if (!quiet) {
    for (const d of decisions) {
      const what =
        "piece" in d.action
          ? `-> pr. stk.: ${[...d.action.piece].map(([id, n]) => `#${id} ${prods.find((p) => p.id === id)!.name} = ${n ?? "?"}`).join(", ")}`
          : `-> pr. ${d.action.displayPer}${d.action.displayPer === "100 g" && !with100g ? " (waits for the migration)" : ""}`;
      console.log(`  f${d.familyId} ${d.name} ${what}  (${d.why})`);
    }
    console.log(`\nLeft as is (spirits/wine/beer, or already per piece): ${left}`);
    console.log(`For review (flagged, no rule): ${review.length}`);
    for (const r of review) console.log(`  ? ${r}`);
  } else for (const r of review) console.log(`::warning::1.000+ kr. per unit, no rule: ${r}`);
  if (!save) return { decided: decisions.length, review: review.length };

  let n = 0;
  for (const d of decisions) {
    if ("piece" in d.action) {
      // Only families whose unit isn't already a human's 'piece' (handled above); counts only where none is set.
      const { error } = await db.from("product_families").update({ compare_unit: "piece", piece_label: null }).eq("id", d.familyId);
      if (error) throw error;
      for (const [pid, count] of d.action.piece) {
        if (count === null) continue;
        const { error: e2 } = await db.from("products").update({ piece_count: count }).eq("id", pid).is("piece_count", null);
        if (e2) throw e2;
      }
      n++;
    } else {
      if (d.action.displayPer === "100 g" && !with100g) continue;
      const { error } = await db.from("product_families").update({ display_per: d.action.displayPer }).eq("id", d.familyId).is("display_per", null);
      // 23514: the check constraint doesn't allow '100 g' yet (migration not run) - skip, don't fail the night.
      if (error?.code === "23514") {
        console.warn(`display_per '${d.action.displayPer}' not allowed yet - f${d.familyId} skipped.`);
        continue;
      }
      if (error) throw error;
      n++;
    }
  }
  if (!quiet) console.log(`Saved ${n} families.`);
  return { decided: n, review: review.length };
}

/** Every rule decision, for checking the rules: data/llm-batches/units-rules.txt. */
async function rules() {
  const { families, set } = await load();
  const out = open(families, set)
    .map((f) => [f, ruleUnit(f)] as const)
    .filter(([, d]) => d)
    .map(([f, d]) => `${d!.unit}${d!.label ? `/${d!.label}` : ""} (${d!.why}) | ${line(f)}`)
    .sort();
  writeFileSync(`${MANIFEST_DIR}/units-rules.txt`, out.join("\n") + "\n");
  console.log(`${out.length} rule decisions: ${MANIFEST_DIR}/units-rules.txt`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "plan") await plan();
  else if (cmd === "submit") await submit();
  else if (cmd === "collect" && arg) await collect(arg);
  else if (cmd === "apply") await apply(process.argv.includes("--save"));
  else if (cmd === "rules") await rules();
  else if (cmd === "perfume") {
    const n = await perfume(process.argv.includes("--save"));
    if (process.argv.includes("--save") && n !== null) console.log(`Saved ${n} families.`);
    else console.log("Dry run - nothing saved.");
  }
  else if (cmd === "dear") {
    const save = process.argv.includes("--save");
    await dear(save, process.argv.includes("--with-100g"));
    if (!save) console.log("Dry run - nothing saved.");
  } else if (cmd === "nightly") {
    const i = process.argv.indexOf("--max-usd");
    await nightly(i > 0 ? Number(process.argv[i + 1]) : 0.5);
  } else console.error("Usage: units.ts plan | rules | submit | collect <batch-id> | apply [--save] | perfume [--save] | dear [--save] [--with-100g] | nightly [--max-usd N]");
}
if (process.argv[1]?.endsWith("units.ts")) main();
