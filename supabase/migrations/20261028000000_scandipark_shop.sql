-- Scandinavian Park ("ScandiPark"), Handewitt - border shop at the A7/E45 exit, 2026-10-28.
-- Prices come from its German webshop in EUR (converted to DKK at 7.46); Danes
-- buy deposit-free in the store with an export declaration.
-- (Applied directly with the secret key on 2026-10-28; safe to run again.)
insert into shops (id, name, website, location) values
  ('scandipark', 'Scandinavian Park', 'https://www.scandinavian-park.com', 'Handewitt (A7/E45)')
on conflict (id) do nothing;
