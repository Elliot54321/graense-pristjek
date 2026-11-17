-- Subcategories for product families, 2026-11-17 (roadmap "Category taxonomy with
-- subcategories").
--
-- The taxonomy lives in src/catalog/categories.ts (ids per top category, e.g. 'red'
-- under 'wine'). No check constraint on purpose: an id the site doesn't know, or null,
-- just means "Øvrige" - the family still shows on its top category's page. Matching
-- fills the column; the website only reads it.
--
-- New column on an existing table: the table's grants (public read, RLS "public read"
-- policy, service_role writes) already cover it.

alter table product_families add column subcategory text;

-- Category and subcategory pages read families by both.
create index product_families_category_subcategory_idx on product_families (category, subcategory);

-- family_best_prices gets the subcategory too (appended: `create or replace view` can
-- only add columns at the end). Otherwise unchanged from 20261018000000.
create or replace view family_best_prices with (security_invoker = true) as
select distinct on (f.id)
  f.id as family_id,
  f.name as family_name,
  f.category,
  f.search_words,
  mp.product_id,
  mp.name as product_name,
  mp.content_amount,
  mp.content_unit,
  mp.shop_id,
  mp.price,
  mp.price_per_unit,
  mp.on_offer,
  mp.url,
  f.subcategory
from product_families f
join products p on p.family_id = f.id
join matched_prices mp on mp.product_id = p.id
where mp.price_per_unit is not null
order by f.id, mp.price_per_unit asc;

grant select on family_best_prices to anon, authenticated;
