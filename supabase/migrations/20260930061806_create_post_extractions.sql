-- Revert: drop table public.post_extractions; after reverting 20260930061813_create_deals.sql, because public.deals references it.
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

create table public.post_extractions (
  link              text        primary key,
  post_id           text        not null references public.collected_posts (id),
  model             text        not null,
  prompt_version    smallint    not null,
  item_count        smallint    not null,
  output            jsonb       not null,
  prompt_tokens     integer,
  completion_tokens integer,
  reasoning_tokens  integer,
  cost_usd          numeric,
  generation_id     text,
  extracted_at      timestamptz not null default now()
);

-- Locked: row-level security on, no policy, and no privileges for anon or
-- authenticated. service_role is revoked too and granted back only what the
-- extractor uses — it upserts one row per link and deletes nothing — because
-- Supabase grants every new public table to all three roles automatically
-- until 2026-10-30 and to none from then on. The revoke-then-grant pair gives
-- the same privileges on both sides of that date.
alter table public.post_extractions enable row level security;
revoke all on table public.post_extractions from anon, authenticated, service_role;
grant select, insert, update on table public.post_extractions to service_role;

comment on table public.post_extractions is
  'One row per extracted link: what was run on it and what came back. A link whose reply held no items gets a row too, so a review or a later prompt change can see it. No policy — nothing reads this from a browser; the page reads public.deals.';

comment on column public.post_extractions.link is
  'The link every collected_posts row of one aggregator post shares, however many feeds it was seen in. Extracted once, and the row is replaced when the link is extracted again.';

comment on column public.post_extractions.post_id is
  'The representative collected_posts row: the one whose text the model read.';

comment on column public.post_extractions.model is
  'The model that answered, as OpenRouter reports it — with a fallback list, not necessarily the first one asked.';

comment on column public.post_extractions.prompt_version is
  'PROMPT_VERSION in scripts/extract/prompt.mts at extraction time. It changes with the instructions or with the output schema.';

comment on column public.post_extractions.item_count is
  'Items in the reply, which is also the number of public.deals rows for this link.';

comment on column public.post_extractions.output is
  'The reply as validated against scripts/extract/schema.mts, before any cleaning. public.deals holds the cleaned rows.';

comment on column public.post_extractions.cost_usd is
  'What OpenRouter billed for the call, in US dollars. Null when the response did not say.';
