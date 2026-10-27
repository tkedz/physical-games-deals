-- Revert: drop function public.deals_for_game(text); drop function private.game_key(text); drop schema private;
-- Backward-compatible with the previous deployment: yes — additive; nothing deployed calls it.

-- The game page's read path, Phase 2 of
-- context/changes/game-search-and-pages/plan.md. /games/<id> lists, for any
-- visitor, signed in or not, the listed deals that an unpinned watchlist
-- entry with the game's catalogue name would match. public.matched_deals
-- cannot serve it, because it keys on auth.uid(). Nor can a key computed over
-- RPC: anon holds EXECUTE on none of the matching functions, and S-04's
-- implementation review (F1) judged even authenticated's RPC to
-- game_match_key an attack surface. So:
-- - private.game_key runs public.game_match_key as its owner, in a schema the
--   Data API never exposes;
-- - public.deals_for_game, which runs as its caller, is the one new endpoint,
--   for anon and authenticated.
-- The grants on the four matching functions stay as 20261012070050 set them,
-- and the listed predicate keeps its three places (CLAUDE.md, Supabase): this
-- file restates it nowhere.
--
-- Dated before 2026-10-30, so Supabase's default privileges still grant the
-- function in public to anon, authenticated and service_role, and Postgres
-- grants both functions to PUBLIC. The revokes at the end are what make the
-- grants below hold, here and hosted.

-- private must never reach an API. PostgREST serves every function of an
-- exposed schema at /rpc, and pg_graphql reflects the schemas on the
-- request's search_path that the role may use, so private stays out of
-- [api] schemas and extra_search_path in supabase/config.toml and out of the
-- hosted project's Data API settings. Callers name it in full, as
-- deals_for_game does. anon and authenticated need USAGE to reach
-- private.game_key from inside deals_for_game.
create schema private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- security definer, so the key is computed with the owner's EXECUTE on
-- game_match_key and the caller needs EXECUTE on this function alone. Its
-- search_path is pinned empty, as a definer function needs, and its body
-- names every schema. game_match_key caps the cost itself: a name longer than
-- 1000 characters keys to '' (20261012130317_bound_game_match_key.sql).
create function private.game_key(name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select public.game_match_key(name)
$$;

-- The game condition of public.matched_deals for an entry with no platform:
-- the key is computed once, in the materialised CTE, and a deal is kept when
-- the key is not '' and is one of its match_keys. It runs as the caller, so
-- the select policy on public.deals confines the rows to listed deals; the
-- page query chains the listed predicate on top, as it does on public.deals.
-- The table owner is not bound by RLS and would see unlisted rows here too,
-- and service_role, which bypasses RLS, gets no EXECUTE.
create function public.deals_for_game(name text)
returns setof public.deals
language sql
stable
security invoker
set search_path = ''
as $$
  with game as materialized (
    select private.game_key(name) as key
  )
  select d.*
  from public.deals as d
  cross join game as g
  where g.key <> '' and g.key = any (d.match_keys)
$$;

-- Every role loses the EXECUTE that Postgres gives PUBLIC, and that Supabase's
-- default privileges give anon, authenticated and service_role, on a new
-- function in public. anon and authenticated get both back: the game page
-- reads as either, and the call to private.game_key inside deals_for_game is
-- checked against the caller. service_role gets neither: no server-side
-- reader exists.
revoke execute on function
  private.game_key(text),
  public.deals_for_game(text)
from public, anon, authenticated, service_role;
grant execute on function
  private.game_key(text),
  public.deals_for_game(text)
to anon, authenticated;

comment on schema private is
  'Functions no API may serve, such as the security definer key helper of public.deals_for_game. Never list it in [api] schemas or extra_search_path of supabase/config.toml, nor in the hosted project''s Data API settings: PostgREST would serve its functions at /rpc, and pg_graphql reflects the schemas on the search_path, so anon could call the helpers directly.';

comment on function private.game_key(text) is
  'public.game_match_key of a game name, computed as this function''s owner (security definer), so that public.deals_for_game can key a name for anon, which holds EXECUTE on none of the matching functions. It sits in schema private, which no API exposes; in public, anon could call it at /rpc, the surface S-04''s review F1 closed. Keep private out of config.toml [api] schemas and extra_search_path and out of the hosted API settings.';

comment on function public.deals_for_game(text) is
  'The deals an unpinned game watchlist entry with this game_name would match: those whose match_keys hold private.game_key(name), when that key is not empty — the game condition of public.matched_deals for an entry with no platform. It runs as the caller (security invoker), so the select policy on public.deals confines it to listed deals; it does not restate the listed predicate, which the page query adds. Game pages, /games/<id>, read it through the publishable key as anon or authenticated. Its key comes from private.game_key, whose schema stays out of config.toml [api] schemas and extra_search_path and out of the hosted API settings.';
