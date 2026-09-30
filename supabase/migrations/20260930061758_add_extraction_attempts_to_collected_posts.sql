-- Revert: alter table public.collected_posts drop column extraction_attempts, drop column extraction_error; then re-run the processed_at comment from 20260923094535_add_processed_at_to_collected_posts.sql.
-- Backward-compatible with the previous deployment: yes — one column has a default and the other is nullable, and the collector and the import script name only their nine columns.

alter table public.collected_posts
  add column extraction_attempts smallint not null default 0
    check (extraction_attempts >= 0),
  add column extraction_error text;

comment on column public.collected_posts.processed_at is
  'When deal extraction processed this post: its link was extracted and its deals written, or it had no link to extract. Null means not processed. A post is pending when processed_at is null and extraction_attempts < 3, whatever its age — the attempt counter replaced the earlier seven-day age rule, which could not tell a post never attempted from one that keeps failing. Neither the collector nor the import script ever writes this column or the two attempt columns: both name only the nine columns the collector produces.';

comment on column public.collected_posts.extraction_attempts is
  'Counted failed extraction attempts, incremented on every row sharing the post''s link. Only a failure of the post''s own call counts — an invalid or truncated reply, a refused request — and only in a run that extracted something else; an outage (credits, key, rate limit, provider down) never does. At 3, MAX_ATTEMPTS in scripts/extract/config.mts, the post is given up: it stays unprocessed and is not attempted again. Setting it back to 0, with processed_at null, retries it.';

comment on column public.collected_posts.extraction_error is
  'Why the last counted attempt failed, as the extractor classified it. Null until an attempt has counted.';
