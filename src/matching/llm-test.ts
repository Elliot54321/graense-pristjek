/**
 * Compare models on LLM matching before running it on the whole catalog.
 *
 *   npm run match:llm-test -- claude-haiku-5-5 claude-sonnet-5-5
 *
 * Builds a few blocks of similar products from both shops (sodas, beers,
 * spirits, candy), asks each model to group them, and scores the cross-shop
 * links against known answers: pairs already linked by EAN, plus hand-checked
 * pairs that have different EANs. Writes nothing to the database; results go
 * to data/llm-tests/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { adminClient, fetchAll } from "../db/admin";
import { checkCompleteness, type LlmProduct, matchProducts } from "./llm";

interface Row {
  id: number;
  shop_id: string;
  name: string;
  brand: string | null;
  categories: string[];
  content_amount: number | null;
  content_unit: string | null;
  product_matches: { product_id: number }[] | { product_id: number } | null;
}

const productId = (r: Row) => {
  const m = r.product_matches;
  return Array.isArray(m) ? m[0]?.product_id : m?.product_id;
};

/** Similar products from both shops; includes look-alikes on purpose. */
const BLOCKS: { label: string; name: RegExp; content?: { amount: number; unit: string } }[] = [
  { label: "Cola, orange and lemon sodas, 24 x 0,33", name: /coca|pepsi|fanta|sprite|mirinda|7up|mountain dew/i, content: { amount: 7.92, unit: "l" } },
  { label: "Energy drinks 12 x 0,5 / 24 x 0,25", name: /monster|red bull|cult|faxe kondi energy/i, content: { amount: 6, unit: "l" } },
  { label: "Danish and imported beer, 24 x 0,33", name: /carlsberg|carls|tuborg|harboe|royal|heineken|moretti|san miguel/i, content: { amount: 7.92, unit: "l" } },
  { label: "Spirits 1 l", name: /j(ä|ae)germeister|aalborg|jim beam|bombay|gammel dansk|smirnoff/i, content: { amount: 1, unit: "l" } },
  { label: "Candy and chocolate", name: /matador|toblerone|pringles/i },
];

/** Same product, different EAN - checked by hand (poetzsch name, bordershop name prefix). */
const KNOWN_PAIRS: [string, string][] = [
  ["Fanta Orange", "Fanta 24x0,33L dåse"],
  ["Sprite Lemon Lime", "Sprite Zitrone-Limette"],
  ["Mirinda Orange", "Mirinda Orange 24x0,33L"],
  ["Monster Energy", "Monster Energy 12x0,5L dåse"],
  ["Monster Energy Ultra White", "Monster Ultra White"],
  ["Carlsberg Pilsner", "Carlsberg Grøn 4,6%"],
  ["Tuborg Pilsner", "Tuborg Grøn 4,6 %"],
  ["Tuborg Guld", "Tuborg Guld 5,6"],
  ["Carlsberg Sort Guld", "Carlsberg Black Gold"],
  ["Carlsberg Elephant", "Carlsberg Elephant 24"],
  ["Harboe Pilsner", "Harboe Pilsner 4,6%"],
  ["Royal Pilsner", "Royal Pilsner 24x0,33L"],
  ["Royal Export", "Royal Export 24x0,33L"],
  ["Heineken", "Heineken-kuffert"],
  ["Birra Moretti", "Birra Moretti 4,6%"],
  ["San Miguel Premium Especial", "San Miguel 5,4%"],
  ["Jägermeister 56 Kräuter 1 l.", "Jägermeister Likør 35 % 1L"],
  ["Aalborg Taffel Akvavit", "Aalborg Taffel Akvavit 41"],
  ["Jim Beam Kentucky Straight Bourbon Whiskey 1 l.", "Jim Beam White"],
  ["Bombay Sapphire London Dry Gin 1 l.", "Bombay Sapphire Gin 40 % 1L"],
  ["Haribo Matador Mix 1 kg", "Haribo Matador i bøtte"],
  ["Toblerone Milk 340 gram", "Toblerone Milk bar 340g"],
];

const pairKey = (a: number, b: number) => `${a}-${b}`;

async function main() {
  const models = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!models.length) {
    console.error("Usage: npm run match:llm-test -- <model> [model ...]");
    process.exit(1);
  }

  const db = adminClient();
  const rows = await fetchAll<Row>((from, to) =>
    db
      .from("shop_products")
      .select("id, shop_id, name, brand, categories, content_amount, content_unit, product_matches(product_id)")
      .order("id")
      .range(from, to),
  );

  // Build blocks.
  const blocks = BLOCKS.map((b) => {
    const items = rows.filter(
      (r) =>
        b.name.test(r.name) &&
        (!b.content ||
          (r.content_unit === b.content.unit &&
            r.content_amount !== null &&
            Math.abs(r.content_amount - b.content.amount) / b.content.amount <= 0.02)),
    );
    return { label: b.label, rows: items };
  });
  const inBlocks = blocks.flatMap((b) => b.rows);
  const byId = new Map(inBlocks.map((r) => [r.id, r]));

  // Known answers: pairs linked by EAN inside the blocks, plus hand-checked pairs.
  const truth = new Set<string>();
  const truthSource = new Map<string, string>();
  for (const block of blocks) {
    const ps = block.rows.filter((r) => r.shop_id === "poetzsch");
    const bs = block.rows.filter((r) => r.shop_id === "bordershop");
    for (const p of ps)
      for (const b of bs)
        if (productId(p) !== undefined && productId(p) === productId(b)) {
          truth.add(pairKey(p.id, b.id));
          truthSource.set(pairKey(p.id, b.id), "EAN");
        }
    for (const [pName, bPrefix] of KNOWN_PAIRS) {
      const p = ps.find((r) => r.name === pName);
      const b = bs.find((r) => r.name.startsWith(bPrefix));
      if (p && b) {
        truth.add(pairKey(p.id, b.id));
        truthSource.set(pairKey(p.id, b.id), "hand-checked");
      }
    }
  }
  const partnersInTruth = new Set([...truth].flatMap((k) => k.split("-").map(Number)));
  console.log(
    `${inBlocks.length} products in ${blocks.length} blocks; ${truth.size} known cross-shop pairs ` +
      `(${[...truthSource.values()].filter((s) => s === "EAN").length} by EAN, ` +
      `${[...truthSource.values()].filter((s) => s === "hand-checked").length} hand-checked)`,
  );
  for (const b of blocks) console.log(`  ${b.label}: ${b.rows.length} products`);

  const client = new Anthropic();
  mkdirSync("data/llm-tests", { recursive: true });

  for (const model of models) {
    console.log(`\n=== ${model}`);
    const predicted = new Set<string>();
    const families: { family: string; search_words: string[]; size: number }[] = [];
    let cost = 0, inTok = 0, outTok = 0;
    const raw: unknown[] = [];

    for (const block of blocks) {
      const products: LlmProduct[] = block.rows.map((r) => ({
        id: r.id,
        shop: r.shop_id,
        name: r.name,
        brand: r.brand,
        content: r.content_amount !== null ? `${r.content_amount} ${r.content_unit}` : null,
        category: r.categories.join("/"),
      }));
      const started = Date.now();
      const call = await matchProducts(client, model, products);
      cost += call.costUsd;
      inTok += call.inputTokens;
      outTok += call.outputTokens;
      raw.push({ block: block.label, ...call });

      const check = checkCompleteness(products, call.result);
      console.log(
        `  ${block.label}: ${call.result.families.length} families, ${Math.round((Date.now() - started) / 1000)}s, ` +
          `$${call.costUsd.toFixed(4)}` +
          (check.missing.length || check.duplicated.length || check.unknown.length
            ? ` | PROBLEMS missing ${check.missing.length}, duplicated ${check.duplicated.length}, unknown ids ${check.unknown.length}`
            : ""),
      );
      for (const f of call.result.families) {
        families.push({ family: f.family, search_words: f.search_words, size: f.variants.reduce((n, v) => n + v.ids.length, 0) });
        for (const v of f.variants) {
          const ps = v.ids.filter((id) => byId.get(id)?.shop_id === "poetzsch");
          const bs = v.ids.filter((id) => byId.get(id)?.shop_id === "bordershop");
          for (const p of ps) for (const b of bs) predicted.add(pairKey(p, b));
        }
      }
    }

    const correct = [...predicted].filter((k) => truth.has(k));
    const missed = [...truth].filter((k) => !predicted.has(k));
    // Wrong for sure: a product that has a known partner was linked to something else.
    const wrong = [...predicted].filter((k) => !truth.has(k) && k.split("-").map(Number).some((id) => partnersInTruth.has(id)));
    const unverified = [...predicted].filter((k) => !truth.has(k) && !wrong.includes(k));
    const name = (k: string) => k.split("-").map((id) => `"${byId.get(Number(id))?.name}"`).join("  <->  ");
    const handFound = correct.filter((k) => truthSource.get(k) === "hand-checked").length;
    const handTotal = [...truthSource.values()].filter((s) => s === "hand-checked").length;

    console.log(`  Found ${correct.length}/${truth.size} known pairs (hand-checked, different EAN: ${handFound}/${handTotal})`);
    console.log(`  Definitely wrong links: ${wrong.length}`);
    for (const k of wrong) console.log(`    WRONG  ${name(k)}`);
    console.log(`  Missed:`);
    for (const k of missed) console.log(`    ${truthSource.get(k)}  ${name(k)}`);
    console.log(`  Other links (can't verify automatically): ${unverified.length}`);
    for (const k of unverified) console.log(`    ?  ${name(k)}`);
    console.log(`  Tokens: ${inTok} in, ${outTok} out. Cost: $${cost.toFixed(4)}`);
    console.log(`  Sample families: ${families.slice(0, 8).map((f) => `${f.family} [${f.search_words.join(", ")}]`).join(" | ")}`);

    writeFileSync(`data/llm-tests/${model}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(raw, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
