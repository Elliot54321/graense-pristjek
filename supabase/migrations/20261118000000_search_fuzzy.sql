-- Typo-tolerant search, 2026-11-18 (roadmap "Forgiving search").
--
-- The website matches query words itself (src/catalog/search.ts: any order, no punctuation,
-- accents and Danish spellings folded, simple endings). This adds the typo fallback it uses when
-- that finds fewer than 3 families on sale: pg_trgm word similarity on a normalised text of each
-- family's name and search words ("stagertee" -> "Jagertee", "heiniken" -> "Heineken").
-- Read-only: one stable function the public role may call.

create extension if not exists pg_trgm with schema extensions;

-- Lowercase, accents off, æ/ø/å and the two-letter spellings (ae/oe/aa/ue) folded to one letter,
-- apostrophes removed, other punctuation as spaces. Mirrors searchKey() in src/catalog/search.ts.
create or replace function public.search_norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          translate(lower(coalesce(t, '')), 'æøåäöüéèêëáàâíìîóòôúùûñç', 'aoaaoueeeeaaaiiiooouuunc'),
          '[''´`’]', '', 'g'),
        '[^a-z0-9%]+', ' ', 'g'),
      'aa', 'a'), 'ae', 'a'), 'oe', 'o'), 'ue', 'u'),
    '\s+', ' ', 'g'))
$$;

-- plpgsql so the generated column below sees an immutable function (array_to_string itself is
-- only stable).
create or replace function public.family_search_text(name text, words text[])
returns text
language plpgsql
immutable
parallel safe
as $$
begin
  return public.search_norm(name || ' ' || coalesce(array_to_string(words, ' '), ''));
end
$$;

alter table product_families
  add column search_text text generated always as (public.family_search_text(name, search_words)) stored;

create index product_families_search_text_trgm_idx
  on product_families using gin (search_text extensions.gin_trgm_ops);

-- Families whose name or search words are similar to the query, most similar first (at most 20).
-- word_similarity compares the query with the best-matching stretch of the text, so a short query
-- isn't penalised for a long name. 0.5: "heiniken" ~ "heineken" (0.67), "marabu" ~ "marabou" (0.71).
create or replace function public.search_families_fuzzy(q text)
returns table (id bigint, name text, category text, similarity real)
language sql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.5
as $$
  select f.id, f.name, f.category, word_similarity(public.search_norm(q), f.search_text) as similarity
  from product_families f
  where public.search_norm(q) <% f.search_text
  order by similarity desc, length(f.name)
  limit 20
$$;

grant execute on function public.search_norm(text) to anon, authenticated, service_role;
grant execute on function public.family_search_text(text, text[]) to anon, authenticated, service_role;
grant execute on function public.search_families_fuzzy(text) to anon, authenticated, service_role;
