/**
 * LLM matching: group shop products into product families and exact variants.
 *
 * A *variant* is the exact same thing in different shops (same product, flavour,
 * sugar/alcohol content and pack). A *family* is the same product regardless of
 * pack, so baskets can compare price per liter/kg (see roadmap "Decisions").
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** $ per million tokens (input, output), from the Claude API price list. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export interface LlmProduct {
  id: number;
  shop: string;
  name: string;
  brand: string | null;
  content: string | null; // e.g. "7.92 l"
  category: string;
}

export const MatchResult = z.object({
  families: z.array(
    z.object({
      family: z.string().describe("Danish display name of the product family, without pack size"),
      search_words: z.array(z.string()).describe("2-6 lowercase Danish words a shopper might type"),
      variants: z.array(
        z.object({
          pack: z.string().describe('Pack description, e.g. "24 x 0,33 l dåse"'),
          ids: z.array(z.number()).describe("ids of the exact same product, from one or more shops"),
          confidence: z
            .enum(["high", "medium", "low"])
            .describe("How sure you are that the ids are the exact same product (high if only one id)"),
        }),
      ),
    }),
  ),
});
export type MatchResult = z.infer<typeof MatchResult>;

const INSTRUCTIONS = `You match products from Danish border shops (grænsehandel) so a price
comparison site can compare them across shops.

Group the products below into product families, and inside each family into variants.

- A VARIANT is the exact same product: same brand, same product line and flavour, same
  sugar status (regular vs. zero/sukkerfri/light), same alcohol status (regular vs.
  0,0%/alkoholfri), and the same pack (number of units, unit size, can vs. bottle vs. PET).
  Put the ids of that product from every shop that sells it in one variant. A variant can
  contain products from only one shop.
- A FAMILY is the same product regardless of pack size or packaging, so it can be compared
  per liter or kg: e.g. a cola in 24 x 0,33 l cans and in 6 x 1,5 l bottles is one family
  with two variants. Regular and sugar-free versions are different families, and so are
  regular and alcohol-free beers, and different flavours.
- Shops name the same product differently: different languages (Danish, German, English,
  Swedish), local or marketing names, alcohol percentages, pack details or none at all.
  Use your knowledge of these brands to recognise the same product.
- Only group products you are confident are the same. When unsure, keep them apart. Give each
  variant a confidence: high when you are sure, medium when very likely, low when plausible
  but uncertain.
- Every id must appear in exactly one variant.
- Family names in Danish, without pack size. Search words: lowercase Danish words a
  shopper might type to find it, including generic ones (e.g. the product type).`;

export function formatProducts(products: LlmProduct[]): string {
  return products
    .map((p) => `${p.id} | ${p.shop} | ${p.name} | brand: ${p.brand ?? "-"} | ${p.content ?? "?"} | ${p.category}`)
    .join("\n");
}

export interface MatchCall {
  result: MatchResult;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Request body for one block of products; used directly and in the Batch API. */
export function matchRequest(model: string, products: LlmProduct[]) {
  return {
    model,
    max_tokens: 16000,
    output_config: { effort: "low" as const, format: zodOutputFormat(MatchResult) },
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user" as const,
        content: `id | shop | name | brand | content | category\n${formatProducts(products)}`,
      },
    ],
  };
}

/** Parse the JSON text of a batch result (the Batch API has no parse helper). */
export function parseMatchText(text: string): MatchResult {
  return MatchResult.parse(JSON.parse(text));
}

export function costUsd(model: string, inputTokens: number, outputTokens: number, batch = false) {
  const price = PRICES[model];
  if (!price) return NaN;
  return ((inputTokens * price.input + outputTokens * price.output) / 1e6) * (batch ? 0.5 : 1);
}

export async function matchProducts(
  client: Anthropic,
  model: string,
  products: LlmProduct[],
): Promise<MatchCall> {
  const response = await client.messages.parse(matchRequest(model, products));

  if (response.stop_reason === "refusal") throw new Error(`${model} declined the request`);
  if (response.stop_reason === "max_tokens") throw new Error(`${model} ran out of output tokens`);
  if (!response.parsed_output) throw new Error(`${model} returned no parsable result`);

  const { input_tokens, output_tokens } = response.usage;
  return {
    result: response.parsed_output,
    inputTokens: input_tokens,
    outputTokens: output_tokens,
    costUsd: costUsd(model, input_tokens, output_tokens),
  };
}

/** Ids that are missing from the result or appear more than once. */
export function checkCompleteness(products: LlmProduct[], result: MatchResult) {
  const seen = new Map<number, number>();
  for (const f of result.families) for (const v of f.variants) for (const id of v.ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  return {
    missing: products.filter((p) => !seen.has(p.id)).map((p) => p.id),
    duplicated: [...seen].filter(([, n]) => n > 1).map(([id]) => id),
    unknown: [...seen.keys()].filter((id) => !products.some((p) => p.id === id)),
  };
}
