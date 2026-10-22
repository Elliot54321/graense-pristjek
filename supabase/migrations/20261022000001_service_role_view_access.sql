-- Let the secret key (service_role) read the views added on 2026-10-18.
--
-- The initial schema granted service_role access to every table that existed
-- then; the views created later (matched_prices, product_best_prices,
-- family_best_prices) were only granted to the public roles, so server code
-- and scripts using the secret key got "permission denied".

grant select on matched_prices, product_best_prices, family_best_prices to service_role;

-- Tables and views created later get service_role access automatically.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
