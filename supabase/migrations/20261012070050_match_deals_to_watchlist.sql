-- Revert: drop view public.matched_deals; drop index public.watchlist_entries_active_phrase_folded; alter table public.deals drop column match_text, drop column match_keys; drop function public.deal_match_text(text, text, text[]), public.deal_match_keys(text, text, text[]), public.game_match_key(text), public.fold_for_matching(text); then re-run the phrase comment from 20261007141021_create_watchlist_entries.sql. The phrases the settle step marked removed stay removed.
-- Backward-compatible with the previous deployment: yes — the new columns are generated, so the deployed extractor's inserts, which do not name them, still succeed; nothing deployed reads the view; and the folded index refuses only phrases that S-03's deployed code already answers as a duplicate.

-- The matching rule of S-04, defined once, here
-- (context/changes/deals-matched-to-watchlist/plan.md). Four functions hold
-- it. They are immutable, so that a generated column and an index may call
-- them, and they pin search_path, so their bodies name every schema.
--
-- Postgres checks EXECUTE on a function in a generated column or an index
-- expression against the role that writes the row: service_role for the
-- extractor's deals, authenticated for a user's watchlist entries. The grants
-- at the end follow from that.
--
-- create or replace function neither recomputes a stored key nor rebuilds an
-- expression index. A later migration that changes a function therefore also
-- runs `update public.deals set title = title`, and, for the fold, settles
-- the phrases that newly fold alike and reindexes
-- watchlist_entries_active_phrase_folded. supabase/checks/matching.sql is the
-- truth table to rerun after it.

-- One translate does the whole table: each segment of the first string maps
-- to the segment of the second at the same position. A-Z is lowered here
-- rather than by lower(), whose result for non-ASCII letters depends on the
-- database's locale. The apostrophes close the first string with no
-- counterpart in the second, so translate deletes them.
-- foldForMatching in src/lib/watchlist/rules.ts mirrors this function and
-- must stay identical to it.
create function public.fold_for_matching(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.translate(
          value,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || 'ĄĆĘŁŃÓŚŹŻ' || 'ąćęłńóśźż'
            || 'ÀÁÂÃÄÅàáâãäå' || 'ÇČçč' || 'ĎĐďđ' || 'ÈÉÊËĚèéêëě' || 'ÌÍÎÏìíîï'
            || 'ŇÑňñ' || 'ÒÔÕÖØŐòôõöøő' || 'Řř' || 'Šš' || 'Ťť' || 'ÙÚÛÜŮŰùúûüůű'
            || 'ÝŸýÿ' || 'Žž' || '''’‘`´ʼ',
          'abcdefghijklmnopqrstuvwxyz' || 'acelnoszz' || 'acelnoszz'
            || 'aaaaaaaaaaaa' || 'cccc' || 'dddd' || 'eeeeeeeeee' || 'iiiiiiii'
            || 'nnnn' || 'oooooooooooo' || 'rr' || 'ss' || 'tt' || 'uuuuuuuuuuuu'
            || 'yyyy' || 'zz'),
        '&', ' and '),
      '[^a-z0-9]+', ' ', 'g'))
$$;

-- The year goes first, from the raw text, because folding drops the
-- parentheses that tell a catalogue's "(2001)" apart from a number that
-- belongs to the name, as in "Battlefield 2042". The leading words go next:
-- one "the", or "gra" with an optional platform, as pepper titles begin. The
-- trailing qualifiers go last, on the folded text prefixed with a space, so
-- that a title made only of qualifiers reduces to '' and never matches. The
-- leftmost start that reaches the end wins, so "nintendo switch 2 edition"
-- goes whole. Remake, Remastered, Remaster and HD are not qualifiers: they
-- name separate releases. Bare Ultimate, Gold, Limited and Special are not
-- either, because they often end a real name ("Super Smash Bros. Ultimate",
-- "Pokémon Gold"); they go only with "edition" after them. The platform words
-- are written once, in p.platform, and used by both patterns.
create function public.game_match_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      ' ' || pg_catalog.regexp_replace(
        public.fold_for_matching(pg_catalog.regexp_replace(value, '\s*\(\d{4}\)\s*$', '')),
        '^(?:the|gra(?: ' || p.platform || ')?) ',
        ''),
      '(?: (?:(?:na |for )?' || p.platform
        || '|(?:game of the year|nintendo switch 2|switch 2|[a-z0-9]+)? edition'
        || '|edycja(?: gry roku| [a-z0-9]+)?'
        || '|game of the year|goty|deluxe|enhanced|complete|definitive|directors cut|launch|day one|premium|standard'
        || '|pudelkowa|pudelkowe|pudelko|okladka pl|plyta blu ray|plyta|blu ray|steelbook|pl))+$',
      ''))
  from (
    select '(?:ps5|ps4|playstation 5|playstation 4|xbox series x s|xbox series x|xbox series s'
      || '|xbox series|xbox one|nintendo switch 2|nintendo switch|switch 2|switch|pc)' as platform
  ) as p
$$;

-- Sorted in "C" order, so the stored array is the same whatever the
-- database's locale.
create function public.deal_match_keys(title text, english_title text, alternative_titles text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(k.key order by k.key collate pg_catalog."C"), '{}')
  from (
    select distinct public.game_match_key(t.value) as key
    from pg_catalog.unnest(array[title, english_title] || alternative_titles) as t(value)
  ) as k
  where k.key <> ''
$$;

-- A folded title holds only [a-z0-9] and single inner spaces, so a phrase
-- cannot match across the " | " between two of them.
create function public.deal_match_text(title text, english_title text, alternative_titles text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(pg_catalog.string_agg(f.folded, ' | ' order by f.ordinal), '')
  from (
    select t.ordinal, public.fold_for_matching(t.value) as folded
    from pg_catalog.unnest(array[title, english_title] || alternative_titles)
      with ordinality as t(value, ordinal)
  ) as f
  where f.folded <> ''
$$;

-- Generated, so the extractor's inserts fill them with no change to its code,
-- and the rows already stored get them as the table is rewritten here. No
-- grant: the table-level select for anon and authenticated in
-- 20260930061813_create_deals.sql covers new columns, and the "listed deals
-- are public" policy chooses rows, not columns.
alter table public.deals
  add column match_keys text[]
    generated always as (public.deal_match_keys(title, english_title, alternative_titles)) stored,
  add column match_text text
    generated always as (public.deal_match_text(title, english_title, alternative_titles)) stored;

-- Settle the phrases that fold alike before the folded index is built, or it
-- would fail on a list that already holds such a pair. In each group of
-- active phrase entries with one user, one non-empty folded text and one
-- platform, the oldest stays — by created_at, then id — and the rest are
-- marked removed. They stay as records (FR-004). PARTITION BY puts null
-- platforms in one group, as nulls not distinct does in the index.
update public.watchlist_entries as e
set removed_at = now()
from (
  select id,
    row_number() over (
      partition by user_id, public.fold_for_matching(phrase), platform
      order by created_at, id
    ) as rank_in_group
  from public.watchlist_entries
  where kind = 'phrase' and removed_at is null and public.fold_for_matching(phrase) <> ''
) as ranked
where e.id = ranked.id and ranked.rank_in_group > 1;

-- One active phrase per user, folded text and platform: two phrases that fold
-- alike match the same deals, so they are one entry. A phrase whose folded
-- text is empty matches nothing and falls outside this index;
-- watchlist_entries_active_phrase, on lower(phrase), stays and still keeps
-- identical phrases of that kind to one entry.
create unique index watchlist_entries_active_phrase_folded
  on public.watchlist_entries (user_id, public.fold_for_matching(phrase), platform) nulls not distinct
  where kind = 'phrase' and removed_at is null and public.fold_for_matching(phrase) <> '';

-- The caller's active entries are keyed once per query, in the materialised
-- CTE. A listed deal is kept when some entry matches it under the platform
-- rule — a pinned entry admits only its own platform, an unpinned one any,
-- a deal without a platform or with 'other' included — and EXISTS keeps each
-- deal once, however many entries match it. The listed predicate repeats the
-- policy on public.deals, as src/lib/deals/queries.ts does.
create view public.matched_deals with (security_invoker = true) as
with my_entries as materialized (
  select e.platform,
         case when e.kind = 'game' then public.game_match_key(e.game_name) end as game_key,
         case when e.kind = 'phrase' then public.fold_for_matching(e.phrase) end as phrase_key
  from public.watchlist_entries e
  where e.user_id = (select auth.uid()) and e.removed_at is null
)
select d.id, d.link, d.source, d.published_at, d.kind, d.edition, d.platform, d.title, d.set_with,
       d.price_amount, d.currency, d.discount_percent, d.expires_at, d.shop_url, d.shop_name
from public.deals d
where d.kind = 'game' and d.edition = 'physical' and d.price_amount is not null
  and exists (
    select 1 from my_entries e
    where (e.platform is null or e.platform = d.platform)
      and (e.game_key <> '' and e.game_key = any (d.match_keys)
        or e.phrase_key <> '' and pg_catalog.strpos(d.match_text, e.phrase_key) > 0)
  );

-- Every role loses the EXECUTE that Postgres gives PUBLIC, and that Supabase's
-- default privileges give anon, authenticated and service_role, on a new
-- function. Each then gets back what it writes or reads:
-- - service_role, all four: the extractor's inserts compute both generated
--   columns, which call the other two;
-- - authenticated, the fold and the game key: a watchlist insert evaluates
--   the folded index, and the view keys the caller's entries;
-- - anon, nothing.
revoke execute on function
  public.fold_for_matching(text),
  public.game_match_key(text),
  public.deal_match_keys(text, text, text[]),
  public.deal_match_text(text, text, text[])
from public, anon, authenticated, service_role;
grant execute on function
  public.fold_for_matching(text),
  public.game_match_key(text)
to authenticated;
grant execute on function
  public.fold_for_matching(text),
  public.game_match_key(text),
  public.deal_match_keys(text, text, text[]),
  public.deal_match_text(text, text, text[])
to service_role;

-- The view may be read through the publishable key, by authenticated only.
-- That is justified because:
-- - Vercel's Server Components hold only the publishable key plus the user's
--   session, so /my-deals reads as authenticated
--   (context/foundation/infrastructure.md);
-- - the view runs as the caller, so the RLS policies on
--   public.watchlist_entries confine the entries to the caller's own, and the
--   one on public.deals confines the deals to listed rows;
-- - every row is a listed deal, which anon and authenticated already read
--   through public.deals.
-- anon gets nothing: the view means nothing without a user, and /my-deals
-- reads it only once it knows one. service_role gets nothing either: no
-- server-side reader exists.
revoke all on table public.matched_deals from anon, authenticated, service_role;
grant select on table public.matched_deals to authenticated;

comment on function public.fold_for_matching(text) is
  'Text as matching compares it: A-Z lowered and the Latin diacritics of one fixed table folded to their base letter, ł included, through translate rather than lower(), so that the result does not depend on the locale; apostrophes removed; "&" read as " and "; every other run of characters outside [a-z0-9] turned into one space; the ends trimmed. foldForMatching in src/lib/watchlist/rules.ts mirrors it.';

comment on function public.game_match_key(text) is
  'A game name as the game rule compares it: a trailing "(YYYY)" dropped, the rest folded by fold_for_matching, one leading "the" or "gra [platform]" dropped, and then trailing edition, platform and packaging words. Remake, Remastered, Remaster and HD stay, because they name separate releases. An empty key matches nothing.';

comment on function public.deal_match_keys(text, text, text[]) is
  'The distinct, non-empty game_match_key of a deal''s title, english_title and alternative_titles, sorted in "C" order. It generates public.deals.match_keys.';

comment on function public.deal_match_text(text, text, text[]) is
  'A deal''s title, english_title and alternative_titles, in that order, each folded by fold_for_matching and joined with " | ". A title that folds to nothing is left out, and the result is never null. A folded phrase holds no "|", so it cannot match across two titles. It generates public.deals.match_text.';

comment on column public.deals.match_keys is
  'The game keys of the deal''s titles, from public.deal_match_keys. A game entry matches the deal when the game_match_key of its game_name is one of them. Generated on insert, and on an update that sets one of the three title columns — never when a matching function changes, so a migration that changes the rule runs update public.deals set title = title.';

comment on column public.deals.match_text is
  'The deal''s titles folded and joined with " | ", from public.deal_match_text. A phrase entry matches the deal when its folded phrase occurs in it. Generated, and recomputed as match_keys is.';

comment on view public.matched_deals is
  'The listed deals that match at least one of the caller''s active watchlist entries, each once: a game when its key is one of the deal''s match_keys, a phrase when its folded text occurs in the deal''s match_text, and a pinned entry only on its own platform. It runs as the caller (security_invoker), so RLS confines the entries to the caller''s own. It carries kind and edition so that the page can state the listed predicate itself, as it does on public.deals. /my-deals reads it.';

comment on column public.watchlist_entries.phrase is
  'A phrase entry''s text, trimmed, 3 to 100 characters. It matches a deal when any of the deal''s titles contains it once both are folded by public.fold_for_matching: letter case, Latin diacritics and punctuation set aside. Two active phrases on one platform whose folded texts are equal and not empty are one entry, and watchlist_entries_active_phrase_folded refuses the second. Null for a game.';
