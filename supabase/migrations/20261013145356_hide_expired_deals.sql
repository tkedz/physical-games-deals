-- Revert: alter policy "listed deals are public" on public.deals using (kind = 'game' and edition = 'physical' and price_amount is not null); then create or replace view public.matched_deals with (security_invoker = true) with the body from 20261012070050_match_deals_to_watchlist.sql, and re-run the comment on table public.deals from 20260930061813_create_deals.sql and the comment on view public.matched_deals from 20261012070050_match_deals_to_watchlist.sql.
-- Backward-compatible with the previous deployment: yes — the deployed page query already hides expired deals with its own filter, so / and /my-deals show the same rows, and a rollback deployment reads the same.

-- Rollout Phase 2 of context/foundation/test-plan.md, Phase 4 of
-- context/changes/testing-extraction-and-listing-guard/plan.md (decision of
-- 2026-10-13). A deal is hidden from its expires_at on, the exclusive end of
-- the stated offer, and one without an end stays (PRD AC3). Until now only the
-- page query said so, so any other reader of the publishable key listed
-- expired deals. The term joins the listed predicate in both places that state
-- it in the database; src/lib/deals/queries.ts keeps its own copy.
--
-- now() is the start of the reading transaction, so a deal whose end falls
-- within a request is hidden from the next request on.
alter policy "listed deals are public" on public.deals
  using (kind = 'game' and edition = 'physical' and price_amount is not null
    and (expires_at is null or expires_at > now()));

-- The body of 20261012070050_match_deals_to_watchlist.sql, columns and order
-- unchanged, with the expiry term added to the listed predicate. The with
-- clause is restated on purpose: create or replace view resets the view's
-- options when it is left out, and without security_invoker the view would run
-- as its owner, past the RLS on public.watchlist_entries. Grants survive a
-- replace. supabase/checks/listed-expiry.sql asserts both the term and the
-- option.
create or replace view public.matched_deals with (security_invoker = true) as
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
  and (d.expires_at is null or d.expires_at > now())
  and exists (
    select 1 from my_entries e
    where (e.platform is null or e.platform = d.platform)
      and (e.game_key <> '' and e.game_key = any (d.match_keys)
        or e.phrase_key <> '' and pg_catalog.strpos(d.match_text, e.phrase_key) > 0)
  );

comment on table public.deals is
  'One row per item a model returned for a link, rejected ones included, so a review can see rejections next to acceptances. A row is listed — readable through the publishable key — only when it is a game, a physical copy, priced, and not expired: its expires_at is null or still ahead. A link''s rows are replaced as a whole when it is extracted again.';

comment on view public.matched_deals is
  'The listed deals — a game, a physical copy, priced and not expired — that match at least one of the caller''s active watchlist entries, each once: a game when its key is one of the deal''s match_keys, a phrase when its folded text occurs in the deal''s match_text, and a pinned entry only on its own platform. It runs as the caller (security_invoker), so RLS confines the entries to the caller''s own. It carries kind and edition so that the page can state the listed predicate itself, as it does on public.deals. /my-deals reads it.';
