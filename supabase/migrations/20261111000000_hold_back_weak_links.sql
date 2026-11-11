-- Hold back weak unreviewed LLM links, 2026-11-11.
--
-- A wrong link gives a wrong "cheapest" answer, which is worse than showing a
-- product a little less. Links the LLM saved with medium confidence (0.75) stay out
-- of matched_prices - and so out of search, basket and the best-price views - until
-- someone confirms them in /admin. High-confidence (0.9) links, EAN links, own
-- products and reviewed matches are unaffected. Same columns as before.

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
where (sp.last_seen_at > now() - interval '3 days'
   or sp.listed_until >= current_date)
  and (pm.reviewed or pm.method <> 'llm' or pm.confidence >= 0.8);
