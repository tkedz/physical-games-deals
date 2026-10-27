-- What a hosted Supabase project gives the migrations in supabase/migrations/,
-- and nothing more, for the disposable PGlite database of tests/db/. The
-- harness (tests/db/harness/database.ts) runs this file as PGlite's superuser
-- before the first migration, then switches the session to migrator.
--
-- It imitates the roles and schema usage of Supabase's database image
-- (supabase/postgres), and the parts of Supabase Auth the migrations and the
-- checks touch: auth.users as a foreign-key target, and auth.uid(),
-- auth.role() and auth.jwt() as Supabase Auth defines them. It was carried
-- over from the PGlite probe of
-- context/archive/2026-10-13-testing-matching-rule-protection/research.md (Bootstrap: a
-- disposable Postgres). Everything else Supabase installs (storage, realtime,
-- vault, graphql, event triggers, the authenticator's login) is left out on
-- purpose: a migration that needs it should fail here first.
--
-- Supabase's default privileges are in default-privileges.sql, because they
-- depend on each migration's date.

-- 1. The Data API roles ------------------------------------------------------
-- No login, no inheritance, and only service_role bypasses row-level
-- security. PostgREST logs in as authenticator and switches into the other
-- three with SET ROLE, which the checks imitate with `set local role`.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator nologin noinherit;
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;

-- 2. The owner -----------------------------------------------------------------
-- Hosted, the migrations and the SQL editor run as postgres, which is not a
-- superuser there; PGlite's own postgres is one, and would wave through every
-- missing grant. migrator stands in for hosted postgres: not a superuser, a
-- member of the three API roles, so that `set local role` works as it does in
-- the SQL editor, and allowed to create in public.
create role migrator nologin nosuperuser;
grant anon, authenticated, service_role to migrator;
grant usage, create on schema public to migrator;

-- Hosted postgres may also create schemas, as
-- 20261027085911_deals_for_game.sql creates private, so migrator gets CREATE
-- on this database. Its name comes from current_database(), which a GRANT
-- cannot take, hence the dynamic SQL.
do $$ begin execute format('grant create on database %I to migrator', current_database()); end $$;

-- 3. The auth schema ---------------------------------------------------------
-- Only the columns anything here reads. Hosted, supabase_auth_admin owns the
-- table; here the superuser does, and migrator gets what the migrations and
-- the checks use. Without references, the foreign key from
-- public.watchlist_entries fails with 42501, as it would hosted.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role, migrator;

create table auth.users (
  id         uuid        primary key,
  email      varchar(255),
  created_at timestamptz default now()
);

grant select, insert, references on table auth.users to migrator;

-- Supabase Auth's definitions: the legacy per-claim setting first, which older
-- PostgREST versions set, then the claims object that current PostgREST sets.
-- PUBLIC keeps EXECUTE, as hosted.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
