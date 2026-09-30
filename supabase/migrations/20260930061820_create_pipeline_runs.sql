-- Revert: drop table public.pipeline_runs;
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

create table public.pipeline_runs (
  id                bigint      generated always as identity primary key,
  started_at        timestamptz not null,
  finished_at       timestamptz not null,
  collect_succeeded boolean     not null,
  outcome           text        not null check (outcome in ('ok', 'failed')),
  failure_reason    text,
  links_attempted   integer     not null,
  links_extracted   integer     not null,
  links_failed      integer     not null,
  deals_listed      integer     not null,
  links_pending     integer     not null,
  cost_usd          numeric     not null
);

-- The page reads; only the extractor writes. service_role is revoked and
-- granted back exactly what the extractor uses, for the reason given in the
-- post_extractions migration: one insert per run, never changed afterwards.
alter table public.pipeline_runs enable row level security;
revoke all on table public.pipeline_runs from anon, authenticated, service_role;
grant select on table public.pipeline_runs to anon, authenticated;
grant select, insert on table public.pipeline_runs to service_role;

-- Public because the deals view states when the data was last refreshed, and
-- reads that through the publishable key as it reads the deals. Only ok runs:
-- the line tells "no new deals" from "processing stopped", so a failed run
-- must not refresh it, and a failed run's failure_reason can describe an
-- outage. Every column of an ok run is public, and none is secret: times,
-- counts and cost.
create policy "successful runs are public" on public.pipeline_runs
  for select to anon, authenticated
  using (outcome = 'ok');

comment on table public.pipeline_runs is
  'One row per run of the collect workflow, written by the extractor when its step ends. The deals view''s "last refreshed" line reads the latest ok row.';

comment on column public.pipeline_runs.outcome is
  '''ok'' only when collection succeeded and no outage stopped the extraction, as decideRunOutcome in scripts/extract/deals.mts decides. Per-post failures and backlog left for the next run do not fail a run.';

comment on column public.pipeline_runs.links_pending is
  'Links still owed an attempt when the run finished: rows with processed_at null and extraction_attempts < 3.';

comment on column public.pipeline_runs.cost_usd is
  'What the run''s calls cost in US dollars, summed from the replies that reported it.';
