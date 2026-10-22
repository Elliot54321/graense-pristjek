/**
 * Extract prices from a shop's PDF newsletter/flyer with Claude (vision).
 *
 *   npm run flyer:extract -- data/newsletters/<file>.pdf [--pages 2,6,26] [--model claude-sonnet-5-5]
 *
 * Fleggaard doesn't allow scraping their website, so their prices come from the
 * newsletter they send out. Each page is rendered to an image (poppler's
 * pdftoppm) and read by the model; the PDF's text layer is passed along only as
 * a hint for exact digits - it is scrambled and contains leftover template text.
 *
 * Writes <pdf>.offers.json next to the PDF (git-ignored folder) and prints a
 * table. Nothing goes to the database - review the result first.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { costUsd } from "../matching/llm";

const IMAGE_WIDTH = 1150; // px; small print ("18 x 0,33 l.") stays readable

const Offer = z.object({
  products: z
    .array(z.string())
    .describe('Every product the price applies to, each fully named, e.g. "Royal XMAS", "Royal Blanche", "Royal IPA"'),
  more_variants: z.boolean().describe('True if the flyer says "Flere varianter" or similar'),
  pack: z.string().describe('Pack as printed, e.g. "18 x 0,33 l." or "250-375 g."'),
  unit_count: z.number().nullable().describe("Number of items in the pack (18 for 18 x 0,33 l.), null if not stated"),
  unit_size: z.number().nullable().describe("Size of one item in liters or kg (0.33), null if a range or unknown"),
  unit: z.enum(["l", "kg", "stk"]).nullable(),
  price: z.number().describe('Price in DKK for one price unit; "5999" printed large = 59.99, "22,-" = 22'),
  price_unit: z.string().describe('As printed: "Pr. ks.", "Pr. fl.", "Pr. ps." ...'),
  price_per_liter_or_kg: z.number().nullable().describe('From "Pr. liter 10,10." / "Pr. kg 49,95."; null if absent'),
  price_per_is_max: z.boolean().describe('True if printed as "max", e.g. "Pr. liter max 13,47."'),
  multi_buy: z
    .object({ quantity: z.number(), total_price: z.number() })
    .nullable()
    .describe('E.g. "3 ks. 155,-" -> {quantity: 3, total_price: 155}'),
  always_low_price: z.boolean().describe('"ALTID LAV PRIS" badge - a regular price, not a temporary offer'),
  saving_vs_dk_percent: z.number().nullable().describe('From "SPAR 33% ift. DK*"'),
  no_deposit: z.boolean().describe('"Ingen pant" printed for this item'),
  limit_note: z.string().nullable().describe('Purchase limits or conditions, e.g. "Max 5 kg pr. kunde."'),
});

const PageResult = z.object({
  offers: z.array(Offer),
  valid_from: z.string().nullable().describe("YYYY-MM-DD if this page prints when its prices start, else null"),
  valid_to: z.string().nullable().describe("YYYY-MM-DD if this page prints when its prices end, else null"),
});
type PageResult = z.infer<typeof PageResult>;

const INSTRUCTIONS = `You read one page of a Danish border shop's printed newsletter (Fleggaard,
German side of the border, prices in DKK) and list every priced product on it.

- The page image is the truth. A text layer from the PDF follows as a hint for exact
  digits and spelling only: it is scrambled across columns and contains leftover text
  from old templates (other dates, other years) - never take a price or date from it
  unless you can see it in the image.
- Big prices are printed with small superscript decimals: "5999" means 59,99 DKK and
  "189 99" means 189,99. "22,-" means 22,00.
- One price often covers several products ("Royal XMAS, Blanche el. IPA", "Pepsi, Mirinda
  el. Mountain Dew"). List each product fully named ("Royal XMAS", "Royal Blanche",
  "Royal IPA"). If it also says "Flere varianter", set more_variants.
- Only list items with a price. Skip pure images, recipes, headings and store adverts.
- Dates: only when this page prints a validity period ("Priserne gælder fra ... til og
  med ..."), and only from the image.`;

function pdfPageCount(pdf: string): number {
  const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
}

function renderPage(pdf: string, page: number, dir: string): string {
  const prefix = path.join(dir, `p${page}`);
  execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to-x", String(IMAGE_WIDTH), "-scale-to-y", "-1",
    "-jpeg", "-jpegopt", "quality=85", pdf, prefix]);
  const file = readdirSync(dir).find((f) => f.startsWith(`p${page}-`) && f.endsWith(".jpg"));
  if (!file) throw new Error(`Could not render page ${page}`);
  return path.join(dir, file);
}

function pageText(pdf: string, page: number): string {
  return execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", pdf, "-"], { encoding: "utf8" })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function readPage(client: Anthropic, model: string, pdf: string, page: number, dir: string) {
  const image = readFileSync(renderPage(pdf, page, dir)).toString("base64");
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(PageResult) },
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: `Page ${page}. Text layer (hint only):\n${pageText(pdf, page)}` },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error(`Page ${page}: model declined`);
  if (response.stop_reason === "max_tokens") throw new Error(`Page ${page}: ran out of output tokens`);
  if (!response.parsed_output) throw new Error(`Page ${page}: no parsable result`);
  return {
    result: response.parsed_output,
    cost: costUsd(model, response.usage.input_tokens, response.usage.output_tokens),
    tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

function parsePages(arg: string | undefined, total: number): number[] {
  if (!arg) return Array.from({ length: total }, (_, i) => i + 1);
  return arg.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const pdf = args.find((a) => a.endsWith(".pdf"));
  const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  if (!pdf) {
    console.error("Usage: npm run flyer:extract -- <file.pdf> [--pages 2,6,26 | 1-10] [--model <id>]");
    process.exit(1);
  }
  const model = opt("--model") ?? "claude-sonnet-5-5";
  const pages = parsePages(opt("--pages"), pdfPageCount(pdf));
  const client = new Anthropic();
  const dir = mkdtempSync(path.join(tmpdir(), "flyer-"));

  const out: { page: number; result: PageResult }[] = [];
  let cost = 0;
  try {
    for (const page of pages) {
      const { result, cost: c, tokens } = await readPage(client, model, pdf, page, dir);
      cost += c;
      out.push({ page, result });
      const dates = result.valid_from || result.valid_to ? ` | valid ${result.valid_from ?? "?"} - ${result.valid_to ?? "?"}` : "";
      console.log(`\nPage ${page}: ${result.offers.length} offers, ${tokens.input}+${tokens.output} tokens, $${c.toFixed(4)}${dates}`);
      for (const o of result.offers) {
        const extras = [
          o.multi_buy && `${o.multi_buy.quantity} for ${o.multi_buy.total_price}`,
          o.always_low_price && "ALTID LAV PRIS",
          o.saving_vs_dk_percent !== null && `spar ${o.saving_vs_dk_percent}%`,
          o.no_deposit && "ingen pant",
          o.more_variants && "flere varianter",
          o.limit_note,
        ].filter(Boolean);
        console.log(
          `  ${o.products.join(" / ").slice(0, 60).padEnd(60)} ${o.pack.padEnd(16)} ${String(o.price).padStart(7)} ${o.price_unit.padEnd(8)} ` +
            `${o.price_per_liter_or_kg ?? "-"}${o.price_per_is_max ? " (max)" : ""}  ${extras.join(", ")}`,
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const file = pdf.replace(/\.pdf$/, `.offers.json`);
  writeFileSync(file, JSON.stringify({ pdf: path.basename(pdf), model, extractedAt: new Date().toISOString(), pages: out }, null, 2));
  const offers = out.reduce((n, p) => n + p.result.offers.length, 0);
  console.log(`\n${offers} offers from ${out.length} pages. Cost: $${cost.toFixed(4)}. Saved to ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
