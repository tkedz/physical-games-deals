-- Revert: grant all on table public.collected_posts to service_role;
-- Backward-compatible with the previous deployment: yes — the collector and the extractor keep select, insert and update, and nothing deployed deletes, truncates, references or triggers on the table.

-- 20260921133305_create_collected_posts.sql revoked only anon and
-- authenticated, so service_role reached this table through Supabase's default
-- grant alone. A database built from these migrations without that default,
-- as Supabase builds them from 2026-10-30 on, hosted or on a local stack,
-- would refuse every pipeline write with 42501. service_role is revoked and
-- granted back exactly what the pipeline uses, as on public.post_extractions
-- (20260930061806_create_post_extractions.sql):
-- - insert and select: insertPosts in scripts/collector/posts.mts, shared by
--   collect and collect:import, upserts with ignoreDuplicates, which PostgREST
--   renders as `on conflict do nothing`, and reads the inserted ids back;
-- - select: loadPending, countFailure and countPending in
--   scripts/extract/store.mts for extract, and loadPosts there for
--   extract:report;
-- - update of processed_at, extraction_attempts and extraction_error:
--   closeWithoutCall, saveExtraction and countFailure in
--   scripts/extract/store.mts.
-- Nothing deletes from the table. anon and authenticated stay revoked.
-- tests/db/collected-posts-grants.test.ts proves these operations, and the
-- refusals, with and without Supabase's default privileges.
revoke all on table public.collected_posts from service_role;
grant select, insert, update on table public.collected_posts to service_role;
