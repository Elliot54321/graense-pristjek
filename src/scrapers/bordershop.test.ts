// npx tsx --test src/scrapers/bordershop.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardContradictsPack } from "./bordershop";

const pack = (packCount: number, amount: number, unit = "l") => ({ packCount, unitSize: { amount, unit: unit as "l" } });

test("a card that is no whole number of the named item loses to the name", () => {
  assert.equal(cardContradictsPack({ amount: 7.2, unit: "l" }, pack(12, 0.33)), true); // Jacobsen Christmas Ale
  assert.equal(cardContradictsPack({ amount: 2.055, unit: "l" }, pack(6, 0.33)), true); // Frem 6 x 33 cl
  assert.equal(cardContradictsPack({ amount: 0.06, unit: "l" }, pack(3, 0.2)), true); // Grönstedts 3x20cl
  assert.equal(cardContradictsPack({ amount: 6.24, unit: "l" }, pack(12, 0.5)), true); // Cult 12x0,5L
});

test("a card of a whole number of items is kept", () => {
  assert.equal(cardContradictsPack({ amount: 7.92, unit: "l" }, pack(24, 0.33)), false); // agrees
  assert.equal(cardContradictsPack({ amount: 0.05, unit: "l" }, pack(12, 0.05)), false); // sells one, names the carton
  assert.equal(cardContradictsPack({ amount: 0.24, unit: "l" }, pack(25, 0.02)), false); // Kuemmerling, swapped names
  assert.equal(cardContradictsPack({ amount: 0.75, unit: "l" }, null), false); // no pack in the name
  assert.equal(cardContradictsPack({ amount: 24, unit: "piece" }, pack(24, 0.33)), false); // other unit
});
