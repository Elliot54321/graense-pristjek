-- Initial schema for the border shopping price comparison.
--
-- shops           the shops we collect prices from
-- shop_products   a product as one shop lists it (one row per shop + shop product id)
-- prices          price history: a new row only when a product's price or offer changes
-- products        the "real" product across shops (what a user asks for)
-- product_matches which shop product is which real product, and how sure we are
-- scrape_runs     one row per scraper run, for validation and alerts
--
-- Public (publishable key) can read everything except scrape_runs. Only the
-- secret key (scrapers, admin) can write.

-- Shops ----------------------------------------------------------------------

create table shops (
  id text primary key,                       -- 'poetzsch', 'bordershop' (matches scraper name)
  name text not null,
  website text not null,
  location text,                             -- e.g. 'Padborg', 'Puttgarden'
  created_at timestamptz not null default now()
);

insert into shops (id, name, website, location) values
  ('poetzsch', 'Poetzsch Padborg', 'https://www.poetzsch-padborg.dk', 'Padborg'),
  ('bordershop', 'BorderShop', 'https://www.bordershop.com', 'Puttgarden');

-- Shared check for normalized units (see src/scrapers/types.ts BaseUnit).
create domain base_unit as text check (value in ('l', 'kg', 'piece'));

-- Products as listed by each shop ---------------------------------------------

create table shop_products (
  id bigint generated always as identity primary key,
  shop_id text not null references shops (id),
  shop_product_id text not null,             -- the shop's own id
  url text not null,
  name text not null,
  brand text,
  ean text,
  categories text[] not null default '{}',
  pack_count integer,                        -- 24 for a case of 24 cans
  unit_size_amount numeric,                  -- 0.33 (one can)
  unit_size_unit base_unit,
  content_amount numeric,                    -- 7.92 (whole case)
  content_unit base_unit,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),  -- still listed as of this scrape
  unique (shop_id, shop_product_id)
);

create index shop_products_ean_idx on shop_products (ean) where ean is not null;

-- Price history -------------------------------------------------------------------

create table prices (
  id bigint generated always as identity primary key,
  shop_product_id bigint not null references shop_products (id) on delete cascade,
  price numeric(10, 2) not null,             -- shelf price for one sellable unit
  currency text not null default 'DKK',
  price_per_unit numeric(10, 2),             -- per l / kg / piece, as the shop reports it
  on_offer boolean not null default false,
  regular_price numeric(10, 2),              -- "Før" price when on offer
  offer_ends_at date,
  pfand numeric(10, 2),                      -- deposit per sellable unit, null if none shown
  observed_at timestamptz not null default now()
);

create index prices_latest_idx on prices (shop_product_id, observed_at desc);

-- The latest price for every shop product. security_invoker makes the view
-- respect the RLS policies of the tables underneath.
create view current_prices with (security_invoker = true) as
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
  p.observed_at
from shop_products sp
join prices p on p.shop_product_id = sp.id
order by sp.id, p.observed_at desc;

-- Real products and matching ------------------------------------------------------

create table products (
  id bigint generated always as identity primary key,
  name text not null,                        -- Danish display name
  brand text,
  ean text unique,
  content_amount numeric,
  content_unit base_unit,
  category text,
  created_at timestamptz not null default now()
);

create table product_matches (
  shop_product_id bigint primary key references shop_products (id) on delete cascade,
  product_id bigint not null references products (id) on delete cascade,
  method text not null check (method in ('ean', 'fuzzy', 'llm', 'manual')),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  reviewed boolean not null default false,   -- confirmed by a human in the admin view
  created_at timestamptz not null default now()
);

create index product_matches_product_idx on product_matches (product_id);

-- Scrape runs (private) -----------------------------------------------------------

create table scrape_runs (
  id bigint generated always as identity primary key,
  shop_id text not null references shops (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'warning', 'failed')),
  urls_found integer,
  products_scraped integer,
  products_failed integer,
  price_changes integer,
  notes text                                 -- validation warnings, error messages
);

-- Access ---------------------------------------------------------------------------
-- "Automatically expose new tables" is off, so grant explicitly. RLS is on for
-- every table; the secret key (service_role) bypasses it.

alter table shops enable row level security;
alter table shop_products enable row level security;
alter table prices enable row level security;
alter table products enable row level security;
alter table product_matches enable row level security;
alter table scrape_runs enable row level security;

grant select on shops, shop_products, prices, products, product_matches, current_prices
  to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy "public read" on shops for select to anon, authenticated using (true);
create policy "public read" on shop_products for select to anon, authenticated using (true);
create policy "public read" on prices for select to anon, authenticated using (true);
create policy "public read" on products for select to anon, authenticated using (true);
create policy "public read" on product_matches for select to anon, authenticated using (true);
-- scrape_runs: no policy, so only the secret key can read or write it.
