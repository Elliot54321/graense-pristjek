/**
 * NOT USED YET - the free-text shopping list is shelved until the final stages
 * (roadmap, 2026-10-25). Kept because it's tested: on 4 sample lists Haiku,
 * Sonnet and Opus 5.5 gave the same items and amounts.
 *
 * Turn a free-text Danish shopping list into items with an amount, using Claude.
 * Finding the products is NOT done by the model: each item's search words go
 * through the site's own search (searchFamilies), so results stay consistent
 * with what the search page shows.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const LIST_MODEL = process.env.LIST_MODEL ?? "claude-opus-5-5";
export const MAX_LIST_CHARS = 1000;

export const ListItems = z.object({
  items: z.array(
    z.object({
      original: z.string().describe("The part of the user's text this item comes from, as written"),
      search: z
        .string()
        .describe('Short Danish search words for the product, brand first if given, e.g. "cola", "tuborg grøn", "haribo matador", "kaffe"'),
      liters: z.number().nullable().describe('Wanted volume in liters, e.g. "24 dåser" -> 7.92 (cans are 0,33 l unless stated)'),
      kg: z.number().nullable().describe('Wanted weight in kg, e.g. "500 g" -> 0.5'),
      packs: z
        .number()
        .nullable()
        .describe('Number of packs/bottles/bags when that is how it was asked: "2 ks", "en flaske", "3 poser"'),
    }),
  ),
});
export type ListItem = z.infer<typeof ListItems>["items"][number];

const INSTRUCTIONS = `You read a Danish shopping list for a trip to the border shops (beer, soda,
candy, spirits, wine, groceries) and split it into items.

For each item give the search words and ONE amount:
- liters for drinks asked by volume or by number of cans/bottles of a known size
  ("24 dåser cola" = 24 x 0,33 = 7.92 l; "10 l øl" = 10),
- kg for things asked by weight ("2 kg kaffe" = 2; "500 g lakrids" = 0.5),
- packs when asked by pack ("2 ks tuborg" = 2 cases, "en flaske gin" = 1, "3 poser chips" = 3).
If no amount is given, use packs = 1.

Danish shorthand: ks/kasse = case, ds/dåse = can, fl/flaske = bottle, ps/pose = bag, stk = pieces.
Keep brand names as written. Ignore greetings and anything that isn't a product.`;

/** Ask Claude to split the list. Throws on refusal or unusable output. */
export async function interpretList(
  text: string,
  model = LIST_MODEL,
): Promise<{ items: ListItem[]; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ListItems) },
    system: INSTRUCTIONS,
    messages: [{ role: "user", content: text.slice(0, MAX_LIST_CHARS) }],
  });
  if (response.stop_reason === "refusal") throw new Error("Listen kunne ikke læses.");
  if (!response.parsed_output) throw new Error(`No usable output (${response.stop_reason})`);
  return {
    items: response.parsed_output.items.slice(0, 40),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
