-- Product families and best-price views (roadmap "Decisions", 2026-10-17).
--
-- product_families    the same drink/candy regardless of pack size, so baskets
--                     can compare price per liter/kg; carries search words
-- products.family_id  which family an exact product belongs to
-- product_best_prices cheapest current price per exact product, and where
-- family_best_prices  cheapest current price per liter/kg per family, and which
--                     product/shop gives it

create table product_families (
  id bigint generated always as identity primary key,
  name text not null,                        -- Danish display name, no pack size
  category text not null,                    -- comparison category, e.g. 'beer'
  search_words text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (category, name)
);

create index product_families_search_idx on product_families using gin (search_words);

alter table products add column family_id bigint references product_families (id) on delete set null;
create index products_family_idx on products (family_id);

-- Allow LLM matches to say why they need review (e.g. a price outlier).
alter table product_matches add column note text;

-- Latest price of every shop product, with the product it is matched to.
create view matched_prices with (security_invoker = true) as
select
  pm.product_id,
  cp.*
from current_prices cp
join product_matches pm on pm.shop_product_id = cp.shop_product_id;

create view product_best_prices with (security_invoker = true) as
select distinct on (p.id)
  p.id as product_id,
  p.family_id,
  p.name,
  p.content_amount,
  p.content_unit,
  mp.shop_id,
  mp.shop_product_id,
  mp.price,
  mp.price_per_unit,
  mp.on_offer,
  mp.url,
  mp.observed_at
from products p
join matched_prices mp on mp.product_id = p.id
order by p.id, mp.price asc;

create view family_best_prices with (security_invoker = true) as
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
  mp.url
from product_families f
join products p on p.family_id = f.id
join matched_prices mp on mp.product_id = p.id
where mp.price_per_unit is not null
order by f.id, mp.price_per_unit asc;

-- Access: same pattern as the initial schema (public read, secret key writes).
alter table product_families enable row level security;
grant select on product_families, matched_prices, product_best_prices, family_best_prices
  to anon, authenticated;
grant all on product_families to service_role;
grant usage, select on all sequences in schema public to service_role;
create policy "public read" on product_families for select to anon, authenticated using (true);
