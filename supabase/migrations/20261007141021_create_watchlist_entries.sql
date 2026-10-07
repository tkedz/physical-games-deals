-- Revert: drop table public.watchlist_entries;
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

-- platform mirrors the Platform union in src/lib/deals/types.ts without
-- 'other', so a pinned entry compares directly with a deal's platform. Null
-- means any platform.
create table public.watchlist_entries (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text        not null check (kind in ('game', 'phrase')),
  game_id       integer     check (game_id > 0),
  game_slug     text,
  game_name     text,
  game_released date,
  phrase        text,
  platform      text        check (platform in ('ps5', 'ps4', 'xbox-series', 'xbox-one', 'switch', 'switch-2', 'pc')),
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  constraint watchlist_entries_shape_check check (
    (kind = 'game'
      and game_id is not null and game_slug is not null and game_name is not null
      and phrase is null)
    or (kind = 'phrase'
      and phrase is not null and phrase = btrim(phrase) and char_length(phrase) between 3 and 100
      and game_id is null and game_slug is null and game_name is null and game_released is null)
  )
);

-- One active entry per game and platform, and per phrase and platform with
-- letter case ignored. Phrases are stored trimmed, so surrounding spaces are
-- ignored too. nulls not distinct makes "any platform" a single value. Removed
-- rows fall outside both indexes, so a removed entry can be added again.
create unique index watchlist_entries_active_game
  on public.watchlist_entries (user_id, game_id, platform) nulls not distinct
  where kind = 'game' and removed_at is null;

create unique index watchlist_entries_active_phrase
  on public.watchlist_entries (user_id, lower(phrase), platform) nulls not distinct
  where kind = 'phrase' and removed_at is null;

-- The policies select by user_id, removed rows included.
create index watchlist_entries_user_id on public.watchlist_entries (user_id);

-- Locked, then granted to authenticated exactly what the watchlist does: read
-- the rows, insert the seven columns a client sets, and set removed_at. With
-- no privilege on user_id, it always takes auth.uid(), so no client can name
-- an owner. Nothing for anon; nothing for service_role, since no server-side
-- writer exists; and no delete for anyone, because a removal keeps the record
-- (FR-004).
alter table public.watchlist_entries enable row level security;
revoke all on table public.watchlist_entries from anon, authenticated, service_role;
grant select on table public.watchlist_entries to authenticated;
grant insert (kind, game_id, game_slug, game_name, game_released, phrase, platform)
  on table public.watchlist_entries to authenticated;
grant update (removed_at) on table public.watchlist_entries to authenticated;

-- The repository's first policies on rows a user owns. They are justified
-- because:
-- - Vercel's Server Components and Server Actions hold only the publishable
--   key plus the user's session, so they act as authenticated
--   (context/foundation/infrastructure.md);
-- - RLS is the isolation boundary: one user's watchlist is never visible to
--   another, including through a forged request (context/foundation/prd.md,
--   Guardrails).
-- Each compares the owner with (select auth.uid()), evaluated once per
-- statement rather than once per row. Select must not filter removed_at: a
-- removal is an update whose WHERE reads the row and whose new row must stay
-- visible to select, so hiding removed rows here would fail every removal.
-- The view hides them instead. Update reaches only the owner's active rows and
-- must leave them removed, so a removal can be made but not undone.
create policy "owners read their entries" on public.watchlist_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "owners add their entries" on public.watchlist_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "owners remove their entries" on public.watchlist_entries
  for update to authenticated
  using ((select auth.uid()) = user_id and removed_at is null)
  with check ((select auth.uid()) = user_id and removed_at is not null);

comment on table public.watchlist_entries is
  'One row per entry a signed-in user puts on their own watchlist: a game from the catalogue, or a phrase. Only the owner reads the rows. A removal keeps the row, so the table also records what a user once tracked.';

comment on column public.watchlist_entries.user_id is
  'The owner: auth.uid() at insert. No client can set it — authenticated has no insert privilege on this column.';

comment on column public.watchlist_entries.game_id is
  'The RAWG id of a game entry. Null for a phrase.';

comment on column public.watchlist_entries.game_name is
  'The catalogue''s name at the time of adding, not refreshed. With game_slug and game_released, it lets the list render without calling the catalogue.';

comment on column public.watchlist_entries.phrase is
  'A phrase entry''s text, trimmed, 3 to 100 characters. It matches a deal when any of the deal''s titles contains it, ignoring letter case and Polish diacritics. Null for a game.';

comment on column public.watchlist_entries.platform is
  'The platform the entry is pinned to, in the deals vocabulary without ''other''. Null means any platform.';

comment on column public.watchlist_entries.removed_at is
  'When the user removed the entry: it is hidden from their view from this instant, and the row stays as the record that they once tracked it (FR-004). A removal is never undone; adding the entry again inserts a new row.';
