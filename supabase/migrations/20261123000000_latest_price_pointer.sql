-- Fast current_prices, 2026-11-23 (roadmap "Fast sorted results").
--
-- current_prices was a DISTINCT ON (sp.id) over shop_products x prices: every read, and every
-- 1000-row page of matched_prices on top of it, re-ranked the whole price history of all
-- ~20,600 shop products (~1,8 s per page). Instead each shop product now points at its latest
-- price row (shop_products.latest_price_id), kept current by triggers on prices, and
-- current_prices is a plain join on that pointer: same columns in the same order, same
-- security_invoker, same grants. matched_prices and the best-price views read current_prices
-- and keep working unchanged (create or replace keeps them, since the columns don't change).
--
-- "Latest" = newest observed_at, then the highest id - what DISTINCT ON picked, with the tie
-- (two rows with the same observed_at) now decided instead of arbitrary.
--
-- Writers: the scrapers and newsletter imports only ever insert price rows (src/scrapers/save.ts),
-- after reading current_prices per shop. The insert trigger runs inside the insert statement,
-- so the next read already sees the new latest price. A row inserted with an older observed_at
-- (backfills) doesn't move the pointer, exactly as before.
--
-- Unlike the old view, current_prices no longer sorts its rows: every reader orders explicitly
-- (.order("shop_product_id") before paging).
--
-- Check after running (expect rows_old = rows_new and 0 mismatches):
--   with old as (
--     select distinct on (sp.id) sp.id as shop_product_id, p.id as price_id
--     from shop_products sp join prices p on p.shop_product_id = sp.id
--     order by sp.id, p.observed_at desc, p.id desc
--   )
--   select
--     (select count(*) from old) as rows_old,
--     (select count(*) from current_prices) as rows_new,
--     (select count(*) from old join shop_products sp on sp.id = old.shop_product_id
--       where sp.latest_price_id is distinct from old.price_id) as mismatches,
--     (select count(*) from old join current_prices cp using (shop_product_id)
--       join prices p on p.id = old.price_id
--       where (cp.price, cp.observed_at, cp.coupon) is distinct from (p.price, p.observed_at, p.coupon)) as value_mismatches;

alter table shop_products
  add column latest_price_id bigint references prices (id) on delete set null;

-- Backfill: the latest price of every shop product.
update shop_products sp
set latest_price_id = l.id
from (
  select distinct on (shop_product_id) shop_product_id, id
  from prices
  order by shop_product_id, observed_at desc, id desc
) l
where l.shop_product_id = sp.id;

-- Deleting a price row (only by hand, or by cascade with its shop product) checks this column.
create index shop_products_latest_price_idx on shop_products (latest_price_id);

-- New price row: move the pointer when it's at least as recent as the current latest.
create or replace function public.prices_set_latest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update shop_products sp
  set latest_price_id = new.id
  where sp.id = new.shop_product_id
    and (
      sp.latest_price_id is null
      or (select (cur.observed_at, cur.id) <= (new.observed_at, new.id) from prices cur where cur.id = sp.latest_price_id)
    );
  return null;
end
$$;

create trigger prices_set_latest
  after insert on prices
  for each row execute function public.prices_set_latest();

-- Deleted price row that was the latest: point at the next latest (or none). The foreign key
-- has already set the pointer to null by then, so both cases are handled.
create or replace function public.prices_unset_latest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update shop_products sp
  set latest_price_id = (
    select p.id from prices p
    where p.shop_product_id = old.shop_product_id
    order by p.observed_at desc, p.id desc
    limit 1
  )
  where sp.id = old.shop_product_id
    and (sp.latest_price_id is null or sp.latest_price_id = old.id);
  return null;
end
$$;

create trigger prices_unset_latest
  after delete on prices
  for each row execute function public.prices_unset_latest();

-- Same columns, order and security_invoker as 20261105000000; grants are kept by create or replace.
create or replace view current_prices with (security_invoker = true) as
select
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
join prices p on p.id = sp.latest_price_id;
