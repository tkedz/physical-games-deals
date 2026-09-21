-- Revert: drop table public.collected_posts;
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

create table public.collected_posts (
  id            text        primary key,
  source        text        not null,
  platform_hint text        not null,
  title         text,
  link          text,
  published_at  timestamptz,
  categories    text[]      not null default '{}',
  content       text,
  first_seen_at timestamptz not null
);

-- Locked by default: row-level security on, no policy, and no privileges for the
-- Data API roles. The collector writes with the secret key, which bypasses both.
-- service_role is deliberately left alone — that is the write path.
alter table public.collected_posts enable row level security;
revoke all on table public.collected_posts from anon, authenticated;

comment on table public.collected_posts is
  'Raw RSS posts as the collector produced them: feed fields copied 1:1, nothing parsed or normalised. One row per (feed, entry). No policy — nothing reads this from a browser.';

comment on column public.collected_posts.id is
  'Leading 16 hex characters of sha1(''<source>|<key>''), where <key> is the entry guid, falling back to link then title. The feed id is part of the hash, so the id already encodes the feed.';

comment on column public.collected_posts.source is
  'Feed identifier from the collector''s feeds.json. Immutable: it feeds the id hash, so renaming a feed re-duplicates every entry from it.';

comment on column public.collected_posts.platform_hint is
  'Arbitrary platform label carried over from the feed definition. A hint only — the collector never acts on it.';

comment on column public.collected_posts.link is
  'Deliberately not unique. Deduplication is per feed, so the same deal legitimately appears under several source values. Any cross-feed merge is downstream work.';

comment on column public.collected_posts.categories is
  'Feed categories copied verbatim, 0-30 entries. Always empty for the cenograj feeds.';

comment on column public.collected_posts.content is
  'Entry body as HTML, hard-capped at 4000 characters by the collector. Not sanitised.';

comment on column public.collected_posts.first_seen_at is
  'When the collector first saw the entry — not when it was published. See published_at for that.';
