-- Product photo per shop listing, 2026-11-10.
--
-- The scrapers read the photo address from each product page they already fetch
-- (the og:image tag), so /admin can show what a product looks like when checking a
-- match. Only the address is stored, not the image; newsletter products have none.

alter table shop_products add column image_url text;
