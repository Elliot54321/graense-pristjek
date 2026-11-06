-- Scandinavian Park's prices come from its Danish click & collect shop (2026-10-30),
-- so links to double-check a price should go there, not to the German webshop.
-- (Applied directly with the secret key on 2026-11-06; safe to run again.)
update shops set website = 'https://clickandcollect.scandipark.dk' where id = 'scandipark';
