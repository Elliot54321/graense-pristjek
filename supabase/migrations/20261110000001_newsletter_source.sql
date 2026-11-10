-- Where a newsletter product came from, 2026-11-10.
--
-- Newsletter products have no product page to check against, so /admin shows the
-- issue and page they were read from, the text printed with the offer, and an image
-- of the page (kept in the private storage bucket "newsletters", reachable only
-- through /admin with short-lived signed links). Scraped products leave these empty.

alter table shop_products add column source_issue text;   -- e.g. 'fleggaard-2026-november-1'
alter table shop_products add column source_page integer; -- page in that issue
alter table shop_products add column source_text text;    -- what was printed: pack, price label, small print
