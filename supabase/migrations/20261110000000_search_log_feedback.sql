-- Search log and feedback, 2026-11-10.
--
-- search_log: every search on the site, with how many families it found - to see
-- what shoppers look for and which searches find nothing. No IP or other personal data.
-- feedback: "Fejl i prisen?" reports from the site, read on /admin.
--
-- Both are private: no grants to the public roles, so only the secret key (server
-- code) can read or write them. RLS is on, like everywhere else.

create table search_log (
  id bigint generated always as identity primary key,
  query text not null check (char_length(query) between 1 and 100),
  results integer not null,
  created_at timestamptz not null default now()
);
create index search_log_created_idx on search_log (created_at);
alter table search_log enable row level security;

create table feedback (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 2000),
  shop_id text,                                -- which price it's about, when reported from one
  product text check (char_length(product) <= 300),
  price numeric(10, 2),
  page text check (char_length(page) <= 300),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index feedback_open_idx on feedback (handled, created_at);
alter table feedback enable row level security;
