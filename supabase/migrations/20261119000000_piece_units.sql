-- Comparison units per family and piece counts per pack, 2026-11-19 (roadmap "stk. prices",
-- step 1: schema only).
--
-- Count-type items (WC blocks, bin bags, dishwasher tabs, eggs, coffee capsules) are compared
-- per kg/l today, or not at all. This adds the columns; Matching fills the family units, Data
-- parses the piece counts. No view or pricing changes yet (step 4, once the data is filled).
--
-- New nullable columns on existing tables: their table grants and "public read" RLS policies
-- already cover them, so the website can read them with the publishable key.

-- How a family is compared: 'l', 'kg' or 'piece' (the base_unit domain). Null = as today
-- (the unit comes from the products' content).
alter table product_families add column compare_unit base_unit;

-- For 'piece' families: the word shown after a per-piece price ("pr. vask", "pr. rulle").
-- Null = "stk.". Ignored for 'l' and 'kg' families.
alter table product_families add column piece_label text
  check (piece_label is null or length(btrim(piece_label)) between 1 and 20);

-- Pieces in one sellable pack, counted in the family's piece_label: 20 for "Affaldssække 50 l,
-- 20 stk.", 40 for 40 dishwasher tabs, 48 for "6 x 8 ruller" toilet paper, 28 for 28 washes.
-- Not pack_count: that is the multipack count (24 for a case of 24 cans) and stays as it is.
-- Null = unknown; such a pack is priced per pack only, never per stk. (and in a 'piece' family
-- never per kg/l either).
--
-- On both, like content: shop_products holds what one listing says (parsed from its name or
-- newsletter text), products what the matched product is. When both are known and differ, use
-- the smaller - the same rule as content (offerContent in src/catalog/data.ts), since a misread
-- listing must never look falsely cheap.
alter table shop_products add column piece_count integer check (piece_count > 0);
alter table products add column piece_count integer check (piece_count > 0);
