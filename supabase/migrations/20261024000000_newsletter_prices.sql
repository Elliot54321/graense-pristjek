-- Prices from shop newsletters (Fleggaard), 2026-10-24.
--
-- Fleggaard doesn't allow scraping, so its prices come from its PDF newsletter
-- (src/flyers/). Newsletter prices are valid until a printed end date rather
-- than "while we still see the product nightly", and often come with multi-buy
-- deals and a "SPAR x% ift. DK" claim.

insert into shops (id, name, website, location) values
  ('fleggaard', 'Fleggaard', 'https://www.fleggaard.dk', 'Padborg / Harrislee')
on conflict (id) do nothing;

-- Products from a newsletter count as available until this date (inclusive).
alter table shop_products add column listed_until date;

alter table prices add column multi_buy_quantity integer check (multi_buy_quantity > 1);
alter table prices add column multi_buy_price numeric(10, 2);   -- total for multi_buy_quantity units
alter table prices add column saving_vs_dk_percent numeric(5, 1);

-- New columns go at the end so the existing ones keep their position.
create or replace view current_prices with (security_invoker = true) as
select distinct on (sp.id)
  sp.id as shop_product_id,
  sp.shop_id,
  sp.name,
  sp.brand,
  sp.ean,
  sp.content_amount,
  sp.content_unit,
  sp.url,
  p.price,
  p.currency,
  p.price_per_unit,
  p.on_offer,
  p.regular_price,
  p.offer_ends_at,
  p.pfand,
  p.observed_at,
  p.multi_buy_quantity,
  p.multi_buy_price,
  p.saving_vs_dk_percent,
  sp.listed_until
from shop_products sp
join prices p on p.shop_product_id = sp.id
order by sp.id, p.observed_at desc;

-- A product counts as on sale if a scraper saw it in the last 3 days, or a
-- newsletter lists it until today or later.
create or replace view matched_prices with (security_invoker = true) as
select
  pm.product_id,
  cp.shop_product_id,
  cp.shop_id,
  cp.name,
  cp.brand,
  cp.ean,
  cp.content_amount,
  cp.content_unit,
  cp.url,
  cp.price,
  cp.currency,
  cp.price_per_unit,
  cp.on_offer,
  cp.regular_price,
  cp.offer_ends_at,
  cp.pfand,
  cp.observed_at,
  sp.last_seen_at,
  cp.multi_buy_quantity,
  cp.multi_buy_price,
  cp.saving_vs_dk_percent,
  cp.listed_until
from current_prices cp
join product_matches pm on pm.shop_product_id = cp.shop_product_id
join shop_products sp on sp.id = cp.shop_product_id
where sp.last_seen_at > now() - interval '3 days'
   or sp.listed_until >= current_date;
