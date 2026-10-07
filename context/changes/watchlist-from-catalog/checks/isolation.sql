-- Isolation check for public.watchlist_entries — plan.md, Phase 1, step 1.5.
--
-- Run in the Supabase SQL editor as it is. It acts as the two oldest users in
-- auth.users (A, then B) through set local role and request.jwt.claims, as
-- PostgREST does, and records every check. It always ends in an error raised
-- on purpose: the error message is the report, and the error rolls the whole
-- transaction back, so no row survives. Expect "Rolled back on purpose. All
-- checks passed." followed by one line per check.
--
-- Phase 4 (step 4.6) reuses the reads by user B and anon on production.
do $check$
declare
  oldest uuid[];
  user_a uuid;
  user_b uuid;
  report text[] := array[]::text[];
  failures integer := 0;
  affected integer;
  entry_id bigint;
begin
  select array_agg(id order by created_at) into oldest
  from (select id, created_at from auth.users order by created_at limit 2) as u;
  if coalesce(array_length(oldest, 1), 0) < 2 then
    raise exception 'This check needs at least two users in auth.users.';
  end if;
  user_a := oldest[1];
  user_b := oldest[2];

  report := array_append(report, format(
    'note: authenticated holds usage on the identity sequence: %s',
    has_sequence_privilege('authenticated', 'public.watchlist_entries_id_seq', 'usage')));

  -- As user A ----------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', 'ps5');
    report := array_append(report, 'ok   A adds a game on PS5');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds a game on PS5: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', 'ps5');
    failures := failures + 1;
    report := array_append(report, 'FAIL A adds the same game on PS5 again: accepted');
  exception
    when unique_violation then
      report := array_append(report, 'ok   A adds the same game on PS5 again: 23505');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL A adds the same game on PS5 again: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', 'ps4');
    report := array_append(report, 'ok   A adds the same game on PS4');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds the same game on PS4: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', null);
    report := array_append(report, 'ok   A adds the same game on any platform');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds the same game on any platform: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', null);
    failures := failures + 1;
    report := array_append(report, 'FAIL A adds the same game on any platform again: accepted');
  exception
    when unique_violation then
      report := array_append(report, 'ok   A adds the same game on any platform again: 23505');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL A adds the same game on any platform again: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, phrase, platform)
    values ('phrase', 'Fire Emblem', null);
    report := array_append(report, 'ok   A adds the phrase "Fire Emblem"');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds the phrase "Fire Emblem": %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, phrase, platform)
    values ('phrase', 'fire emblem', null);
    failures := failures + 1;
    report := array_append(report, 'FAIL A adds the phrase "fire emblem": accepted');
  exception
    when unique_violation then
      report := array_append(report, 'ok   A adds the phrase "fire emblem": 23505');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL A adds the phrase "fire emblem": %s %s', sqlstate, sqlerrm));
  end;

  select count(*) into affected from public.watchlist_entries where user_id = user_a;
  report := array_append(report, format('note: A reads %s of its own rows', affected));

  -- As user B ----------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);

  begin
    select count(*) into affected from public.watchlist_entries where user_id = user_a;
    if affected = 0 then
      report := array_append(report, 'ok   B reads 0 of A''s rows');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL B reads %s of A''s rows', affected));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL B reads A''s rows: %s %s', sqlstate, sqlerrm));
  end;

  begin
    update public.watchlist_entries set removed_at = now()
    where user_id = user_a and removed_at is null;
    get diagnostics affected = row_count;
    if affected = 0 then
      report := array_append(report, 'ok   B updates 0 of A''s rows');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL B updates %s of A''s rows', affected));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL B updates A''s rows: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (user_id, kind, phrase, platform)
    values (user_a, 'phrase', 'Hades', null);
    failures := failures + 1;
    report := array_append(report, 'FAIL B inserts with A''s user_id: accepted');
  exception
    when insufficient_privilege then
      report := array_append(report, 'ok   B inserts with A''s user_id: 42501');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL B inserts with A''s user_id: %s %s', sqlstate, sqlerrm));
  end;

  -- As anon and service_role -------------------------------------------------
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

  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    perform count(*) from public.watchlist_entries;
    failures := failures + 1;
    report := array_append(report, 'FAIL service_role selects: accepted');
  exception
    when insufficient_privilege then
      report := array_append(report, 'ok   service_role selects: 42501');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL service_role selects: %s %s', sqlstate, sqlerrm));
  end;

  -- As user A again: removal -------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  select id into entry_id from public.watchlist_entries
  where kind = 'game' and game_id = 909 and platform = 'ps5' and removed_at is null;

  begin
    update public.watchlist_entries set removed_at = now()
    where id = entry_id and removed_at is null;
    get diagnostics affected = row_count;
    if affected = 1 then
      report := array_append(report, 'ok   A removes the PS5 entry');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL A removes the PS5 entry: %s rows', affected));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A removes the PS5 entry: %s %s', sqlstate, sqlerrm));
  end;

  begin
    select count(*) into affected from public.watchlist_entries where id = entry_id;
    if affected = 1 then
      report := array_append(report, 'ok   A still reads the removed row');
    else
      failures := failures + 1;
      report := array_append(report, 'FAIL A no longer reads the removed row');
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A reads the removed row: %s %s', sqlstate, sqlerrm));
  end;

  begin
    update public.watchlist_entries set removed_at = null where id = entry_id;
    get diagnostics affected = row_count;
    if affected = 0 then
      report := array_append(report, 'ok   A clears removed_at: 0 rows');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL A clears removed_at: %s rows', affected));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A clears removed_at: %s %s', sqlstate, sqlerrm));
  end;

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, game_released, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', '2024-10-08', 'ps5');
    report := array_append(report, 'ok   A adds the removed game on PS5 again');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds the removed game on PS5 again: %s %s', sqlstate, sqlerrm));
  end;

  raise exception '%', format(E'Rolled back on purpose. %s\n%s',
    case when failures = 0 then 'All checks passed.' else failures || ' check(s) failed.' end,
    array_to_string(report, E'\n'));
end;
$check$;
