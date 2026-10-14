-- Revert: re-run the comment on column public.deals.shop_url from 20260930061813_create_deals.sql.
-- Backward-compatible with the previous deployment: yes — a comment only; no table, row, grant or policy changes.

-- The link rule in verifyShopUrl (scripts/extract/deals.mts) since Phase 3 of
-- context/changes/testing-extraction-and-listing-guard/plan.md: no URL with a
-- username or password, and no host on any collected aggregator's site, not
-- only the post's own. Rows stored before it stay as they are.
comment on column public.deals.shop_url is
  'A shop link the post itself carries: one of its own link targets, http or https, with no username or password, and on neither the post''s own site nor any collected aggregator''s (pepper.pl, lowcygier.pl, cenograj.pl). Null otherwise, and the card links to the post. Rows extracted before 2026-10-14 may still carry another aggregator''s link.';
