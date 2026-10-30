-- BorderShop Rostock (Gedser-Rostock ferry), 2026-10-30. Same webshop and catalogue as
-- BorderShop Puttgarden, but offers differ per store, so it is scraped as its own shop.
-- The two stores now carry the place in their name so they can be told apart in lists.
-- (Applied directly with the secret key on 2026-10-30; safe to run again.)
insert into shops (id, name, website, location) values
  ('bordershop-rostock', 'BorderShop Rostock', 'https://www.bordershop.com', 'Færgen Gedser–Rostock')
on conflict (id) do nothing;

update shops set name = 'BorderShop Puttgarden', location = 'Færgen Rødby–Puttgarden' where id = 'bordershop';
