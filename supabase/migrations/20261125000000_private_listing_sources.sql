-- Private newsletter source data per listing, 2026-11-25 (roadmap "Newsletter crop images
-- private").
--
-- Where a newsletter offer came from - the issue, the page, the printed text, and the cropped
-- image eTilbudsavis/Tjek serves for it - is for /admin only: a person checks an imported offer
-- against the page. It must never be public: Tjek's terms (roadmap 2026-11-19) forbid using their
-- content outside their platforms without approval, and the text is partly from eTilbudsavis.
--
-- Why a separate table and not columns on shop_products: shop_products is readable by the public
-- roles (table-wide "grant select" + "public read" policy). Postgres can't hide one column while
-- that table-wide grant exists; it would mean revoking it and granting every other column by name,
-- and every future column would then need its own grant or the website breaks. A table of its own
-- with RLS on, no policy and no grants for anon/authenticated is private by construction - the
-- website (publishable key) can never read it, only server code with the secret key (/admin,
-- imports).
--
-- Step 1 of 2 (this file): create the table and copy source_issue / source_page / source_text over
-- from shop_products (where 20261110000001 put them). The old columns stay until the code that
-- reads and writes this table is deployed; 20261125000001 then drops them.
--
-- Written by the newsletter imports (Data chat), read by /admin (Admin chat). The website must
-- never select or expose it.

create table shop_product_sources (
  shop_product_id bigint primary key references shop_products (id) on delete cascade,
  source_issue text,      -- e.g. 'fleggaard-2026-november-1' (same as shop_products had)
  source_page integer,    -- page in that issue
  source_text text,       -- what was printed: pack, price label, small print
  -- The crop Tjek serves for this offer (an address on their CDN); never shown publicly.
  source_image_url text,
  updated_at timestamptz not null default now()
);

-- The nightly import looks up which issues it has already seen by issue name.
create index shop_product_sources_issue_idx on shop_product_sources (source_issue);

alter table shop_product_sources enable row level security;
-- No policy on purpose: with RLS on, the public roles see no rows even if a grant slipped in.
revoke all on shop_product_sources from anon, authenticated;
grant select, insert, update, delete on shop_product_sources to service_role;

-- Copy what shop_products holds today (rerunnable: updates rows already copied).
insert into shop_product_sources (shop_product_id, source_issue, source_page, source_text)
select id, source_issue, source_page, source_text
from shop_products
where source_issue is not null or source_page is not null or source_text is not null
on conflict (shop_product_id) do update
  set source_issue = excluded.source_issue,
      source_page = excluded.source_page,
      source_text = excluded.source_text,
      updated_at = now();

-- Check after running (expect: rls_on true, public_grants 0, copied = to_copy):
--   select relrowsecurity as rls_on,
--     (select count(*) from information_schema.role_table_grants
--       where table_name = 'shop_product_sources' and grantee in ('anon', 'authenticated')) as public_grants,
--     (select count(*) from shop_products
--       where source_issue is not null or source_page is not null or source_text is not null) as to_copy,
--     (select count(*) from shop_product_sources) as copied
--   from pg_class where relname = 'shop_product_sources';
