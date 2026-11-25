// npx tsx --test src/flyers/etilbudsavis.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScrapedProduct } from "../scrapers/types";
import { foldVariants, looseKey } from "./etilbudsavis";

const l = (amount: number) => ({ amount, unit: "l" as const });

test("looseKey ignores accents, case, spacing and punctuation, not content", () => {
  assert.equal(looseKey("Nicolas Potel Chardonnay Brut Premiere Cuvée 0,75 l.", l(0.75)), looseKey("Nicolas Potel Chardonnay Brut Premiere Cuvee 0,75 l.", l(0.75)));
  assert.equal(looseKey("Anima Negra ÃN/2 0,75 l.", l(0.75)), looseKey("Anima Negra ÀN/2 0,75 l.", l(0.75)));
  assert.equal(looseKey("Mutti Finthakkede Tomater 400 g", null), looseKey("Mutti Finthakkede Tomater 400 g.", null));
  assert.notEqual(looseKey("Coca Cola 24 x 0,33 l.", l(7.92)), looseKey("Coca Cola 24 x 0,33 l.", l(9)));
  assert.notEqual(looseKey("Carlsberg 24 x 0,33 l.", l(7.92)), looseKey("Tuborg 24 x 0,33 l.", l(7.92)));
});

const offer = (shopProductId: string, name: string, price: number, listedUntil: string) =>
  ({ shopProductId, name, price, listedUntil, totalContent: l(0.75), multiBuy: null }) as unknown as ScrapedProduct;

test("foldVariants keeps the cheapest, then the longest listed, under an existing key", () => {
  const a = offer("nl-a", "Potel Cuvee 0,75 l.", 64.99, "2026-12-08");
  const b = offer("nl-b", "Potel Cuvée 0,75 l.", 59.99, "2026-12-01");
  assert.deepEqual(foldVariants([a, b]).map((p) => [p.shopProductId, p.price]), [["nl-b", 59.99]]);
  const c = offer("nl-c", "Potel Cuvée 0,75 l.", 64.99, "2026-12-24");
  assert.deepEqual(foldVariants([a, c]).map((p) => p.listedUntil), ["2026-12-24"]);
  assert.deepEqual(foldVariants([a, c], () => "nl-old").map((p) => p.shopProductId), ["nl-old"]);
});
