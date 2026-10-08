-- Production isolation check for public.watchlist_entries — plan.md, Phase 4, step 4.6.
--
-- Run in the Supabase SQL editor as it is. It only reads, acting as the demo
-- account, as the temporary account and as anon through set local role and
-- request.jwt.claims, as PostgREST does. It always ends in an error raised on
-- purpose: the error message is the report, and the error rolls the
-- transaction back. Expect "Rolled back on purpose. All checks passed."
-- followed by one line per check.
--
-- The demo account must read its own rows first, or the zero the temporary
-- account reads would prove nothing.
do $check$
declare
  demo_user uuid;
  temp_user uuid;
  report text[] := array[]::text[];
  failures integer := 0;
  counted integer;
begin
  select id into demo_user from auth.users where email = 'kolekcjoner@przyklad22.pl';
  select id into temp_user from auth.users where email = 'izolacja-s03-prod@przyklad22.pl';
  if demo_user is null or temp_user is null then
    raise exception 'This check needs both accounts in auth.users: kolekcjoner@przyklad22.pl and izolacja-s03-prod@przyklad22.pl.';
  end if;

  -- As the demo account -------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', demo_user, 'role', 'authenticated')::text, true);

  begin
    select count(*) into counted from public.watchlist_entries
    where user_id = demo_user and removed_at is null;
    if counted >= 4 then
      report := array_append(report, format('ok   the demo account reads its %s active rows', counted));
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL the demo account reads %s active rows, expected at least 4', counted));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the demo account reads its rows: %s %s', sqlstate, sqlerrm));
  end;

  -- As the temporary account --------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', temp_user, 'role', 'authenticated')::text, true);

  begin
    select count(*) into counted from public.watchlist_entries where user_id = demo_user;
    if counted = 0 then
      report := array_append(report, 'ok   the temporary account reads 0 of the demo account''s rows');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL the temporary account reads %s of the demo account''s rows', counted));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the temporary account reads the demo account''s rows: %s %s', sqlstate, sqlerrm));
  end;

  begin
    select count(*) into counted from public.watchlist_entries where user_id <> temp_user;
    if counted = 0 then
      report := array_append(report, 'ok   the temporary account reads no row of any other user');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL the temporary account reads %s rows of other users', counted));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the temporary account reads other users'' rows: %s %s', sqlstate, sqlerrm));
  end;

  -- As anon -------------------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  begin
    perform count(*) from public.watchlist_entries;
    failures := failures + 1;
    report := array_append(report, 'FAIL anon selects: accepted');
  exception
    when insufficient_privilege then
      report := array_append(report, 'ok   anon selects: 42501');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL anon selects: %s %s', sqlstate, sqlerrm));
  end;

  raise exception '%', format(E'Rolled back on purpose. %s\n%s',
    case when failures = 0 then 'All checks passed.' else failures || ' check(s) failed.' end,
    array_to_string(report, E'\n'));
end;
$check$;
