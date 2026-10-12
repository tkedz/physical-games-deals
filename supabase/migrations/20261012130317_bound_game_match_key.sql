-- Revert: create or replace public.game_match_key and its comment as 20261012070050_match_deals_to_watchlist.sql defines them, then update public.deals set title = title.
-- Backward-compatible with the previous deployment: yes — the function keeps its name, signature, volatility and grants, nothing deployed calls it directly, and its key changes only for a name longer than 1000 characters, a year followed by whitespace outside ASCII, or a number, HD, Remake, Remastered or Remaster in front of "Edition" or after "Edycja".

-- S-04's implementation review, F1
-- (context/changes/deals-matched-to-watchlist/reviews/impl-review.md).
-- game_match_key took time quadratic in the length of its input, and any
-- signed-in account could hand it a long one: through RPC, since
-- authenticated may execute it, and through a game_name written straight to
-- the Data API, which has no length check and which matched_deals keys on
-- every read.
--
-- A name longer than 1000 characters now keys to '', which matches nothing.
-- No real title comes near that, and the cap keeps every key to
-- milliseconds. The year pattern loses its leading \s*, which let every
-- space start a match, and spells its classes in ASCII: \s and \d follow the
-- database's ctype, and nothing else in the rule does.
--
-- The same review's F2: the one free word in front of "edition" or after
-- "edycja" could be any word, so "Just Dance 2024 Edition" and "Just Dance
-- 2025 Edition" shared the key "just dance", and "... HD Edition" lost the HD
-- that this function's comment says stays. A step before the trailing
-- pattern now drops only "edition" after a number, which belongs to the
-- name, or after hd, remake, remastered or remaster, which name a separate
-- release, and only "edycja" before one; that word stays. The trailing
-- pattern itself is 20261012070050's, unchanged: a lookahead inside it gave
-- the same keys but cost about 35 times as much on a long input.
--
-- create or replace keeps the grants of 20261012070050 and does not
-- recompute the stored keys, so the update at the end does that.
create or replace function public.game_match_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when pg_catalog.char_length(value) > 1000 then ''
    else pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          ' ' || pg_catalog.regexp_replace(
            public.fold_for_matching(pg_catalog.regexp_replace(value, '\([0-9]{4}\)[ \t\n\r\f\v]*$', '')),
            '^(?:the|gra(?: ' || p.platform || ')?) ',
            ''),
          ' (?:([0-9]+|hd|remake|remastered|remaster) edition|edycja ([0-9]+|hd|remake|remastered|remaster))\M',
          ' \1\2',
          'g'),
        '(?: (?:(?:na |for )?' || p.platform
          || '|(?:game of the year|nintendo switch 2|switch 2|[a-z0-9]+)? edition'
          || '|edycja(?: gry roku| [a-z0-9]+)?'
          || '|game of the year|goty|deluxe|enhanced|complete|definitive|directors cut|launch|day one|premium|standard'
          || '|pudelkowa|pudelkowe|pudelko|okladka pl|plyta blu ray|plyta|blu ray|steelbook|pl))+$',
        ''))
  end
  from (
    select '(?:ps5|ps4|playstation 5|playstation 4|xbox series x s|xbox series x|xbox series s'
      || '|xbox series|xbox one|nintendo switch 2|nintendo switch|switch 2|switch|pc)' as platform
  ) as p
$$;

comment on function public.game_match_key(text) is
  'A game name as the game rule compares it: a trailing "(YYYY)" dropped, the rest folded by fold_for_matching, one leading "the" or "gra [platform]" dropped, and then trailing edition, platform and packaging words. Remake, Remastered, Remaster and HD stay, because they name separate releases, and so does a number in front of "Edition" or after "Edycja", which belongs to the name, as in "Just Dance 2025 Edition". An empty key matches nothing, and a name longer than 1000 characters gets one, which caps the cost of a key.';

update public.deals set title = title;
