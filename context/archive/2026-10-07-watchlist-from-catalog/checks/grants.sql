-- Grants on public.watchlist_entries — plan.md, Phase 1, step 1.4.
--
-- Read-only. Run in the Supabase SQL editor after npm run db:push.
-- Expected:
--   table    authenticated  SELECT
--   column   authenticated  INSERT  game_id, game_name, game_released, game_slug, kind, phrase, platform
--   column   authenticated  SELECT  every column (implied by the table-level SELECT)
--   column   authenticated  UPDATE  removed_at
--   no table or column row for anon or service_role.
-- The sequence rows only say whether the step 1.5 insert can show that the
-- identity column needs no sequence grant: it can only where authenticated
-- holds no usage.
select 'table' as level, grantee, privilege_type, null as detail
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'watchlist_entries'
  and grantee in ('anon', 'authenticated', 'service_role')
union all
select 'column', grantee, privilege_type, string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'watchlist_entries'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, privilege_type
union all
select 'sequence', role_name, 'USAGE',
  has_sequence_privilege(role_name, 'public.watchlist_entries_id_seq', 'usage')::text
from unnest(array['anon', 'authenticated', 'service_role']) as role_name
order by 1, 2, 3;
