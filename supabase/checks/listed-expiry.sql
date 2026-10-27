-- Truth table for the expiry term of
-- supabase/migrations/20261013145356_hide_expired_deals.sql: a deal is hidden
-- from its expires_at on, for every reader of public.deals, of
-- public.matched_deals and of public.deals_for_game
-- (20261027085911_deals_for_game.sql), and the view still runs as its caller.
--
-- Run it in the Supabase SQL editor as it is, once the migration is pushed,
-- and again after every later change to the select policy on public.deals, to
-- public.matched_deals or to public.deals_for_game. It works on fixtures of its own: one user inserted
-- into auth.users, so that no real watchlist touches the results; a fixture
-- post; and fixture deals, which service_role inserts, as the extractor does.
-- Should auth.users refuse the user, it takes its oldest user instead and
-- marks that user's active entries removed, and a "note:" line says so. It
-- acts as each role through set local role and request.jwt.claims, as
-- PostgREST does, and records every check. It always ends in an error raised
-- on purpose: the error message is the report, and the error rolls the whole
-- transaction back, so no fixture survives and no real entry stays removed.
-- Expect "Rolled back on purpose. All checks passed." followed by one line per
-- check.
--
-- The expected values come from PRD AC3 (a deal whose post states an end stops
-- showing after it; one without an end stays), the comment on
-- public.deals.expires_at (the exclusive end, resolved in Europe/Warsaw; null
-- when the post states no end, and the deal stays) and the listed predicate of
-- create_deals.sql (a game, a physical copy, a price). now() is the start of
-- this transaction, so a deal inserted with expires_at = now() sits exactly on
-- the boundary when it is read: the column holds the exclusive end, so it is
-- hidden. The reads are over the fixture deals only, so real deals never
-- change a result.
do $check$
declare
  report text[] := array[]::text[];
  failures integer := 0;
  fixture_user uuid;
  fixture_post text := 'listed-expiry-check-' || gen_random_uuid();
  fixture_link text := 'https://example.invalid/listed-expiry-check/' || gen_random_uuid();
  labels text[] := array[]::text[];
  ids bigint[] := array[]::bigint[];
  new_id bigint;
  counted integer;
  c record;
  seen text[];
  wanted text[] := array['ends-tomorrow', 'undated'];
  options text[];
  error_state text;
  error_message text;
begin
  -- Fixtures, as the editor's role ---------------------------------------------
  begin
    insert into auth.users (id) values (gen_random_uuid()) returning id into fixture_user;
    report := array_append(report, 'note: the user is a fixture inserted into auth.users');
  exception when others then
    error_state := sqlstate;
    error_message := sqlerrm;
    select id into fixture_user from auth.users order by created_at, id limit 1;
    if fixture_user is null then
      raise exception 'auth.users refused a fixture user (% %) and holds no user to fall back on.',
        error_state, error_message;
    end if;
    update public.watchlist_entries set removed_at = now()
    where user_id = fixture_user and removed_at is null;
    get diagnostics counted = row_count;
    report := array_append(report, format(
      'note: auth.users refused a fixture user (%s %s), so the user is its oldest one, and their %s active entries are marked removed until the rollback',
      error_state, error_message, counted));
  end;

  begin
    insert into public.collected_posts (id, source, platform_hint, title, link, first_seen_at)
    values (fixture_post, 'listed-expiry-check', 'fixture', 'Fixture post of supabase/checks/listed-expiry.sql',
      fixture_link, now());
    insert into public.post_extractions (link, post_id, model, prompt_version, item_count, output)
    values (fixture_link, fixture_post, 'fixture', 3, 5, '{"items": []}'::jsonb);
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the fixture post and its extraction: %s %s', sqlstate, sqlerrm));
  end;

  -- The deals, as service_role -------------------------------------------------
  -- Every title holds the user's phrase, so the view's match never decides
  -- which of them shows: only the listed predicate does. Every deal also
  -- carries the one english_title "Listed Expiry Check", so the game page's
  -- function, called with that name, reaches all of them too.
  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    for c in
      select * from (values
        (1, 'ended-a-minute-ago', 'physical', now() - interval '1 minute'),
        (2, 'ends-tomorrow', 'physical', now() + interval '1 day'),
        (3, 'undated', 'physical', null::timestamptz),
        (4, 'ends-now', 'physical', now()),
        (5, 'digital-ends-tomorrow', 'digital', now() + interval '1 day')
      ) as t(item, label, edition, expires_at)
      order by t.item
    loop
      insert into public.deals (link, item_index, source, published_at, kind, edition, platform,
        title, english_title, price_amount, currency, expires_at)
      values (fixture_link, c.item, 'listed-expiry-check', now(), 'game', c.edition, 'ps5',
        'Listed Expiry Check ' || c.label, 'Listed Expiry Check', 99.00, 'PLN', c.expires_at)
      returning id into new_id;
      labels := array_append(labels, c.label);
      ids := array_append(ids, new_id);
    end loop;
    report := array_append(report, format('ok   service_role inserts %s fixture deals', cardinality(ids)));
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL service_role inserts the fixture deals: %s %s', sqlstate, sqlerrm));
    -- The block's rows are rolled back; the variables are not.
    labels := array[]::text[];
    ids := array[]::bigint[];
  end;

  -- The user's entry, as the user ----------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', fixture_user, 'role', 'authenticated')::text, true);

  begin
    insert into public.watchlist_entries (kind, phrase, platform) values ('phrase', 'listed expiry check', null);
    report := array_append(report, 'ok   the user adds the phrase "listed expiry check", which every fixture title holds');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the user adds the phrase: %s %s', sqlstate, sqlerrm));
  end;

  -- The readers ------------------------------------------------------------------
  -- Each reads the fixture deals and must see exactly the running, listed ones:
  -- the deal ending tomorrow and the undated one. The view runs as its caller,
  -- so for authenticated the policy alone already hides an expired deal there.
  -- The table owner — the editor's role — is not bound by RLS, so its read of
  -- the view, with the user's claims, sees the view's own predicate.
  -- public.deals_for_game runs as its caller too and does not restate the
  -- listed predicate, so for anon and authenticated the policy is all that
  -- hides an expired deal there.
  for c in
    select * from (values
      (1, 'anon', 'public.deals'),
      (2, 'authenticated', 'public.deals'),
      (3, 'authenticated', 'public.matched_deals'),
      (4, 'the table owner, past RLS,', 'public.matched_deals'),
      (5, 'anon', 'public.deals_for_game(''Listed Expiry Check'')'),
      (6, 'authenticated', 'public.deals_for_game(''Listed Expiry Check'')')
    ) as t(step, role_name, relation)
    order by t.step
  loop
    if c.role_name = 'anon' then
      set local role anon;
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    elsif c.role_name <> 'authenticated' then
      reset role;
      perform set_config('request.jwt.claims',
        json_build_object('sub', fixture_user, 'role', 'authenticated')::text, true);
    else
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', fixture_user, 'role', 'authenticated')::text, true);
    end if;

    begin
      execute format(
        'select coalesce(array_agg(s.label order by s.label), ''{}'') from (
           select ($2::text[])[array_position($1, r.id)] as label from %s as r where r.id = any ($1)
         ) as s', c.relation)
        into seen using ids, labels;
      if seen = wanted then
        report := array_append(report, format('ok   %s reading %s sees %s, and not %s',
          c.role_name, c.relation, array_to_string(seen, ', '),
          'ended-a-minute-ago, ends-now, digital-ends-tomorrow'));
      else
        failures := failures + 1;
        report := array_append(report, format('FAIL %s reading %s sees %s, expected %s',
          c.role_name, c.relation,
          coalesce(nullif(array_to_string(seen, ', '), ''), 'nothing'), array_to_string(wanted, ', ')));
      end if;
    exception when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL %s reading %s: %s %s', c.role_name, c.relation, sqlstate, sqlerrm));
    end;
  end loop;

  -- The view still runs as its caller ------------------------------------------
  -- create or replace view resets the view's options unless the statement
  -- restates them, and without security_invoker the view runs as its owner,
  -- past the RLS on public.watchlist_entries.
  reset role;
  begin
    select c2.reloptions into options from pg_catalog.pg_class as c2
    where c2.oid = 'public.matched_deals'::regclass;
    if 'security_invoker=true' = any (coalesce(options, array[]::text[])) then
      report := array_append(report, 'ok   public.matched_deals keeps security_invoker=true');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL public.matched_deals has options %s, expected security_invoker=true',
        coalesce(array_to_string(options, ', '), 'none')));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL reading the options of public.matched_deals: %s %s', sqlstate, sqlerrm));
  end;

  raise exception '%', format(E'Rolled back on purpose. %s\n%s',
    case when failures = 0 then 'All checks passed.' else failures || ' check(s) failed.' end,
    array_to_string(report, E'\n'));
end;
$check$;
