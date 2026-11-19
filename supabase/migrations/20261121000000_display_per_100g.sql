-- display_per '100 g', 2026-11-21 (roadmap "Small packs shown per 100 g").
--
-- Small-pack spices and cosmetics read e.g. "Santa Maria Oregano 30 g ... 1.666 kr. pr. kg"; with
-- display_per = '100 g' the site shows "166,63 kr. pr. 100 g". Display only, like '100 ml'
-- (20261120000000): comparison stays per kg, so the cheapest pick never changes.
--
-- The check from 20261120000000 was declared inline, so Postgres named it
-- product_families_display_per_check; it's replaced, not edited in the applied file.

alter table product_families drop constraint if exists product_families_display_per_check;

alter table product_families add constraint product_families_display_per_check
  check (display_per is null or display_per in ('100 ml', '100 g'));
