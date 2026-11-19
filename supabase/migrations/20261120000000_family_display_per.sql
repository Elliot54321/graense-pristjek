-- Display unit for family prices, 2026-11-20 (roadmap "Perfume shown per 100 ml").
--
-- Display only: comparison stays per liter, so the cheapest pick never changes. Perfume reads
-- "1.499,75 kr. pr. liter" today; with display_per = '100 ml' the site shows the same price
-- per 100 ml (149,98 kr.). Shampoo and other toiletries stay per liter (decided). Matching
-- fills the column; the website only reads it.
--
-- New column on an existing table: its grants and "public read" policy already cover it.

alter table product_families add column display_per text
  check (display_per is null or display_per in ('100 ml'));
