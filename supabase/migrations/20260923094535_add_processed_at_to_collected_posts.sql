-- Revert: alter table public.collected_posts drop column processed_at;
-- Backward-compatible with the previous deployment: yes — the column is nullable with no default, and nothing deployed reads the table.

alter table public.collected_posts add column processed_at timestamptz;

comment on column public.collected_posts.processed_at is
  'When deal extraction last ran over this post. Null means not yet processed, so an extractor that could not run when the cron collected can work through the backlog afterwards. The backlog query pairs this with the age of first_seen_at — an entry that stays null well past a week is stale rather than owed another attempt. Neither the collector nor the import script ever writes this column: both name only the nine columns the collector produces.';
