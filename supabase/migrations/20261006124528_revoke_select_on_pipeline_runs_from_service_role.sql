-- Revert: grant select on table public.pipeline_runs to service_role;
-- Backward-compatible with the previous deployment: yes — the deployed extractor only inserts into pipeline_runs and reads nothing back.

-- service_role keeps exactly what the extractor uses on this table:
-- recordRun in scripts/extract/store.mts inserts one row per run, with
-- Prefer: return=minimal, and never reads it back, so select goes. The page
-- reads ok runs as anon and authenticated, whose grant and policy stay as
-- they are (20260930061820_create_pipeline_runs.sql).
revoke select on table public.pipeline_runs from service_role;
