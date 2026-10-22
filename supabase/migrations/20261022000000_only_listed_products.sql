-- Leave out products the shops no longer sell (2026-10-22).
--
-- When a shop removes a product it simply stops appearing in the nightly
-- scrape; its last price stays in `prices`. The best-price views must not
-- recommend it, so matched_prices (which product_best_prices and
-- family_best_prices build on) now only includes shop products seen in the
-- last 3 days. Three days rather than one, so a single failed night doesn't
-- empty the site. Nothing is deleted: a product that comes back reappears
-- after the next scrape.
--
-- current_prices is unchanged on purpose - the scrapers use it to decide
-- whether a price changed.

create or replace view matched_prices with (security_invoker = true) as
select
  pm.product_id,
  cp.*,
  sp.last_seen_at
from current_prices cp
join product_matches pm on pm.shop_product_id = cp.shop_product_id
join shop_products sp on sp.id = cp.shop_product_id
where sp.last_seen_at > now() - interval '3 days';
