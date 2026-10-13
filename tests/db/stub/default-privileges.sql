-- Supabase's default privileges on what the owner creates in public: every new
-- table, sequence and function granted to the three Data API roles. The
-- migrations' `revoke ... from anon, authenticated, service_role` statements
-- are written against them, so the stub reproduces them rather than letting
-- those revokes run against nothing.
--
-- Hosted, Supabase writes them for postgres; here they are written for
-- migrator, which stands in for it (supabase-prelude.sql). Supabase stops
-- applying them to new public objects on 2026-10-30. The harness
-- (tests/db/harness/database.ts) therefore runs this file, as the superuser,
-- before a migration dated before 20261030000000, and revokes these grants
-- before the first migration dated at or after it. Functions still get
-- EXECUTE for PUBLIC from Postgres itself, either way.
--
-- Checked against the hosted project on 2026-10-13 with this read-only query:
--
--   select defaclrole::regrole, defaclobjtype, defaclacl
--   from pg_default_acl
--   where defaclnamespace = 'public'::regnamespace;
--
-- For postgres it returned arwdDxtm on tables, rwU on sequences and X on
-- functions, each to anon, authenticated and service_role. That is `all` on
-- each kind, which is what this file grants. The hosted rows also list
-- postgres itself, which as the owner holds those privileges anyway, and
-- carry the same rows for supabase_admin, which no migration runs as. Neither
-- is reproduced here. Rerun the query if Supabase changes its defaults.
alter default privileges for role migrator in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role migrator in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role migrator in schema public
  grant all on functions to anon, authenticated, service_role;
