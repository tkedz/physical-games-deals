-- Revert: drop table public.deals;
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

-- kind, edition and platform mirror the unions in src/lib/deals/types.ts.
create table public.deals (
  id                 bigint        generated always as identity primary key,
  link               text          not null references public.post_extractions (link) on delete cascade,
  item_index         smallint      not null,
  source             text          not null,
  published_at       timestamptz   not null,
  kind               text          not null check (kind in ('game', 'not_game')),
  edition            text          not null check (edition in ('physical', 'digital', 'unclear')),
  platform           text          check (platform in ('ps5', 'ps4', 'xbox-series', 'xbox-one', 'switch', 'switch-2', 'pc', 'other')),
  title              text          not null,
  english_title      text          not null,
  alternative_titles text[]        not null default '{}',
  price_amount       numeric(10,2),
  currency           text,
  discount_percent   smallint      check (discount_percent between 1 and 99),
  expires_at         timestamptz,
  shop_url           text,
  shop_name          text,
  edition_evidence   text,
  extracted_at       timestamptz   not null default now(),
  unique (link, item_index),
  constraint deals_price_check check ((price_amount is null) = (currency is null))
);

-- The page reads; only the extractor writes. service_role is revoked and
-- granted back exactly what the extractor uses, for the reason given in the
-- post_extractions migration: it replaces a link's rows by deleting and then
-- inserting, so no update.
alter table public.deals enable row level security;
revoke all on table public.deals from anon, authenticated, service_role;
grant select on table public.deals to anon, authenticated;
grant select, insert, delete on table public.deals to service_role;

-- The repository's first public-read policy. It is justified because:
-- - the S-01 deals view is public: a visitor sees the deals, and every path is
--   public (context/foundation/roadmap.md, S-01; src/lib/auth/access.ts);
-- - Vercel holds only the publishable key, so the view's Server Components read
--   as anon or authenticated, exactly as a browser would
--   (context/foundation/infrastructure.md);
-- - every row derives from a public RSS post;
-- - the predicate is the listing rule itself, isListable in
--   scripts/extract/deals.mts, so a digital, unclear or unpriced row stays off
--   the page even when a query forgets its filter.
create policy "listed deals are public" on public.deals
  for select to anon, authenticated
  using (kind = 'game' and edition = 'physical' and price_amount is not null);

comment on table public.deals is
  'One row per item a model returned for a link, rejected ones included, so a review can see rejections next to acceptances. A row is listed — readable through the publishable key — only when it is a game, a physical copy and priced. A link''s rows are replaced as a whole when it is extracted again.';

comment on column public.deals.link is
  'The aggregator post the item comes from, and the source link every card shows.';

comment on column public.deals.item_index is
  'The item''s position in the reply, from 0.';

comment on column public.deals.source is
  'The feed of the representative collected_posts row. Its prefix names the aggregator.';

comment on column public.deals.published_at is
  'The post''s own publication time, or when it was first collected when the feed gave none.';

comment on column public.deals.english_title is
  'The original title as the model gave it. Not a catalogue id, and for a game the model does not know it can name another one; title and alternative_titles are what the post itself says.';

comment on column public.deals.price_amount is
  'The price the post states for this item now, in currency, an ISO 4217 code. Both are set or both are null.';

comment on column public.deals.discount_percent is
  'A percentage cut the post states outright. Never computed from two prices.';

comment on column public.deals.expires_at is
  'The exclusive end of the stated offer, resolved in Europe/Warsaw: the deal is hidden from this instant on. Null when the post states no end, and the deal stays.';

comment on column public.deals.shop_url is
  'A shop link the post itself carries: one of its own link targets, http or https, off the aggregator''s site. Null otherwise, and the card links to the post.';

comment on column public.deals.edition_evidence is
  'The model''s quote from the post supporting edition, cut to 300 characters.';
