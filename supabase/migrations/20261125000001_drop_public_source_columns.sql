-- !!! RUN ONLY AFTER the code that reads and writes shop_product_sources is deployed !!!
-- (the newsletter imports, the scrapers' save and /admin - Data and Admin chats). Run earlier and
-- every import and /admin page that still uses these columns fails.
--
-- Step 2 of 2 for "Newsletter crop images private" (2026-11-25): drop the newsletter source columns
-- from the public shop_products table. 20261125000000 copied them to the private
-- shop_product_sources; they're readable by anyone with the publishable key while they're here,
-- and the text is partly from eTilbudsavis (Tjek's terms, roadmap 2026-11-19). No view or index
-- uses them.
--
-- Before running, copy anything written to the old columns since step 1 (harmless to rerun):
--   insert into shop_product_sources (shop_product_id, source_issue, source_page, source_text)
--   select id, source_issue, source_page, source_text from shop_products
--   where source_issue is not null or source_page is not null or source_text is not null
--   on conflict (shop_product_id) do update set
--     source_issue = coalesce(shop_product_sources.source_issue, excluded.source_issue),
--     source_page = coalesce(shop_product_sources.source_page, excluded.source_page),
--     source_text = coalesce(shop_product_sources.source_text, excluded.source_text);

alter table shop_products drop column source_issue;
alter table shop_products drop column source_page;
alter table shop_products drop column source_text;
