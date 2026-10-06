-- Revert: alter table public.deals drop column set_with;
-- Backward-compatible with the previous deployment: yes — the column has a default, so the deployed extractor's inserts, which do not name it, still succeed, and nothing deployed reads it.

-- Pushed before the extractor that writes set_with reaches main: its inserts
-- name the column, and fail on a table without it.
alter table public.deals add column set_with text[] not null default '{}';

-- No grant and no policy: the table-level grants in
-- 20260930061813_create_deals.sql — select for anon and authenticated; select,
-- insert and delete for service_role — cover a new column, and the
-- "listed deals are public" policy chooses rows, not columns.

comment on column public.deals.set_with is
  'The other games sold together with this one for price_amount, as the post names them: the price is for the whole set, not for this game alone. A set gives one row per game, each naming the others. Empty for a game sold on its own, and for every row extracted before prompt version 3, set or not.';
