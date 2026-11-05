-- Calle and coupon prices, 2026-11-05.
--
-- Calle (same group as Fleggaard, no scraping allowed) publishes its own newsletter.
-- Some of its offers are "KUPONTILBUD": the price needs the newsletter's coupon
-- (bring it or show it on the phone, max 1 coupon per household per day). The site
-- must say so wherever it shows such a price, so it's stored per price.

insert into shops (id, name, website, location) values
  ('calle', 'Calle', 'https://www.calle.dk', 'Kruså / Harrislee')
on conflict (id) do nothing;

alter table prices add column coupon boolean not null default false;

-- Same views as 20261024000000_newsletter_prices.sql, with coupon added at the end.
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
  sp.listed_until,
  p.coupon
from shop_products sp
join prices p on p.shop_product_id = sp.id
order by sp.id, p.observed_at desc;

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
  cp.listed_until,
  cp.coupon
from current_prices cp
join product_matches pm on pm.shop_product_id = cp.shop_product_id
join shop_products sp on sp.id = cp.shop_product_id
where sp.last_seen_at > now() - interval '3 days'
   or sp.listed_until >= current_date;
