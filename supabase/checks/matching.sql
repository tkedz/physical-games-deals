-- Truth table for the deal-matching rule of
-- supabase/migrations/20261012070050_match_deals_to_watchlist.sql: the fold,
-- the game key, the keys stored on deals, the matched_deals view and its
-- grants, and the folded phrase index.
--
-- Run it in the Supabase SQL editor as it is, once the migration is pushed,
-- and again after every later change to the rule. It works on fixtures of its
-- own: two users inserted into auth.users, so that no real watchlist touches
-- the results; a fixture post; and fixture deals, which service_role inserts,
-- as the extractor does. Should auth.users refuse the users, it takes its two
-- oldest users instead and marks their active entries removed, and a "note:"
-- line says so. It acts as each role through set local role and
-- request.jwt.claims, as PostgREST does, and records every check. It always
-- ends in an error raised on purpose: the error message is the report, and
-- the error rolls the whole transaction back, so no fixture survives and no
-- real entry stays removed. Expect "Rolled back on purpose. All checks
-- passed." followed by one line per check.
--
-- The sections: 1, the fold and the game key, case by case; 2, the keys
-- stored on the deals service_role inserts; 3, user A's view; 4, user B's
-- view; 5, anon and the grants; 6, phrase duplicates. The views are read over
-- the fixture deals only, so real deals never change a result. Each fixture
-- deal can be matched by one entry of A's at most — the Witcher deal that a
-- game and a phrase both match is the one exception, on purpose — so a
-- broken case cannot hide behind another entry's match.
do $check$
declare
  report text[] := array[]::text[];
  failures integer := 0;
  user_a uuid;
  user_b uuid;
  oldest uuid[];
  fixture_post text := 'matching-check-' || gen_random_uuid();
  fixture_link text := 'https://example.invalid/matching-check/' || gen_random_uuid();
  labels text[] := array[]::text[];
  ids bigint[] := array[]::bigint[];
  new_id bigint;
  removed_entry bigint;
  counted integer;
  c record;
  u record;
  got text;
  got_keys text[];
  seen text[];
  wanted text[];
  missing text;
  unexpected text;
  repeated text;
  held text[];
  refused_by text;
  error_state text;
  error_message text;
begin
  report := array_append(report, format('note: PostgreSQL %s, database collation %s',
    current_setting('server_version'),
    (select datcollate from pg_database where datname = current_database())));

  -- Fixtures, as the editor's role ---------------------------------------------
  begin
    insert into auth.users (id) values (gen_random_uuid()) returning id into user_a;
    insert into auth.users (id) values (gen_random_uuid()) returning id into user_b;
    report := array_append(report, 'note: A and B are two fixture users inserted into auth.users');
  exception when others then
    error_state := sqlstate;
    error_message := sqlerrm;
    select array_agg(o.id order by o.created_at, o.id) into oldest
    from (select id, created_at from auth.users order by created_at, id limit 2) as o;
    if coalesce(array_length(oldest, 1), 0) < 2 then
      raise exception 'auth.users refused a fixture user (% %) and holds fewer than two users to fall back on.',
        error_state, error_message;
    end if;
    user_a := oldest[1];
    user_b := oldest[2];
    update public.watchlist_entries set removed_at = now()
    where user_id in (user_a, user_b) and removed_at is null;
    get diagnostics counted = row_count;
    report := array_append(report, format(
      'note: auth.users refused a fixture user (%s %s), so A and B are its two oldest users, and their %s active entries are marked removed until the rollback',
      error_state, error_message, counted));
  end;

  begin
    insert into public.collected_posts (id, source, platform_hint, title, link, first_seen_at)
    values (fixture_post, 'matching-check', 'fixture', 'Fixture post of supabase/checks/matching.sql',
      fixture_link, now());
    insert into public.post_extractions (link, post_id, model, prompt_version, item_count, output)
    values (fixture_link, fixture_post, 'fixture', 3, 20, '{"items": []}'::jsonb);
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL the fixture post and its extraction: %s %s', sqlstate, sqlerrm));
  end;

  -- 1. The fold and the game key -----------------------------------------------
  -- The plan's cases, and fold cases that together cover every letter of the
  -- translate table and all six apostrophes, so that comparing foldForMatching
  -- with these cases compares the whole table.
  for c in
    select * from (values
      (1, 'fold', 'Wiedźmin 3: Dziki Gon', 'wiedzmin 3 dziki gon'),
      (2, 'fold', 'ŁOWCY GIER', 'lowcy gier'),
      (3, 'fold', 'Dragon’s Dogma 2', 'dragons dogma 2'),
      (4, 'fold', 'Dragon''s Dogma', 'dragons dogma'),
      (5, 'fold', 'Pokémon Legends: Z-A', 'pokemon legends z a'),
      (6, 'fold', 'Final Fantasy X/X-2 HD Remaster', 'final fantasy x x 2 hd remaster'),
      (7, 'fold', 'Mario & Luigi', 'mario and luigi'),
      (8, 'fold', '  Watch_Dogs 2 ', 'watch dogs 2'),
      (9, 'fold', 'ゼルダの伝説', ''),
      (10, 'fold', '!!!', ''),
      (11, 'fold', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 'abcdefghijklmnopqrstuvwxyz 0123456789'),
      (12, 'fold', 'ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż', 'acelnoszz acelnoszz'),
      (13, 'fold', 'ÀÁÂÃÄÅ ÇČ ĎĐ ÈÉÊËĚ ÌÍÎÏ ŇÑ ÒÔÕÖØŐ Ř Š Ť ÙÚÛÜŮŰ ÝŸ Ž',
        'aaaaaa cc dd eeeee iiii nn oooooo r s t uuuuuu yy z'),
      (14, 'fold', 'àáâãäå çč ďđ èéêëě ìíîï ňñ òôõöøő ř š ť ùúûüůű ýÿ ž',
        'aaaaaa cc dd eeeee iiii nn oooooo r s t uuuuuu yy z'),
      (15, 'fold', 'a''b’c‘d`e´fʼg', 'abcdefg'),
      (16, 'key', 'The Witcher 3: Wild Hunt - Game of the Year Edition', 'witcher 3 wild hunt'),
      (17, 'key', 'The Witcher 3: Wild Hunt', 'witcher 3 wild hunt'),
      (18, 'key', 'Silent Hill 2 (2001)', 'silent hill 2'),
      (19, 'key', 'Xenoblade Chronicles 2 – Nintendo Switch 2 Edition', 'xenoblade chronicles 2'),
      (20, 'key', 'Little Nightmares Enhanced Complete Edition', 'little nightmares'),
      (21, 'key', 'Resident Evil 4 Gold Edition', 'resident evil 4'),
      (22, 'key', 'Battlefield 6 Phantom Edition XBOX Series X', 'battlefield 6'),
      (23, 'key', 'Gra PS5 Indiana Jones i Wielki Krąg - Okładka PL', 'indiana jones i wielki krag'),
      (24, 'key', 'Gra Final Fantasy X X-2 HD Remaster na PS4 Płyta Blu-ray', 'final fantasy x x 2 hd remaster'),
      (25, 'key', 'Wiedźmin 3: Dziki Gon - Edycja Gry Roku (GOTY) | Pudełkowa', 'wiedzmin 3 dziki gon'),
      (26, 'key', 'Front Mission 3 Remake', 'front mission 3 remake'),
      (27, 'key', 'Super Smash Bros. Ultimate', 'super smash bros ultimate'),
      (28, 'key', 'Pokémon Gold', 'pokemon gold'),
      (29, 'key', 'Deluxe Edition', '')
    ) as t(step, fn, input, expected)
    order by t.step
  loop
    begin
      got := case c.fn
        when 'fold' then public.fold_for_matching(c.input)
        else public.game_match_key(c.input)
      end;
      if got is not distinct from c.expected then
        report := array_append(report, format('ok   %s „%s” → %L', c.fn, c.input, got));
      else
        failures := failures + 1;
        report := array_append(report, format('FAIL %s „%s” → %L, expected %L', c.fn, c.input, got, c.expected));
      end if;
    exception when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL %s „%s”: %s %s', c.fn, c.input, sqlstate, sqlerrm));
    end;
  end loop;

  -- 2. Keys stored on the deals service_role inserts -----------------------------
  -- One deal per case of sections 3 and 4, labelled so that a failure names
  -- the case. The generated columns call the matching functions as
  -- service_role, which therefore needs EXECUTE on all four.
  set local role service_role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  begin
    for c in
      select * from (values
        (1, 'sh2-ps5', 'Silent Hill 2', 'Silent Hill 2', '{}'::text[], 'ps5', 'physical', 199.00),
        (2, 'sh2-xbox', 'Silent Hill 2', 'Silent Hill 2', '{}', 'xbox-series', 'physical', 189.00),
        (3, 'sh2-digital', 'Silent Hill 2', 'Silent Hill 2', '{}', 'ps5', 'digital', 99.00),
        (4, 'sh2-unpriced', 'Silent Hill 2', 'Silent Hill 2', '{}', 'ps5', 'physical', null),
        (5, 'witcher-english-title', 'The Witcher 3 - Edycja Gry Roku',
          'The Witcher 3: Wild Hunt - Game of the Year Edition', '{}', 'ps4', 'physical', 84.50),
        (6, 'nightreign', 'Elden Ring Nightreign', 'Elden Ring Nightreign', '{}', 'ps5', 'physical', 149.00),
        (7, 'fm3-remake', 'Front Mission 3 Remake', 'Front Mission 3 Remake', '{}', 'switch', 'physical', 169.00),
        (8, 'ff7-switch', 'FINAL FANTASY VII', 'Final Fantasy VII', '{}', 'switch', 'physical', 96.00),
        (9, 'bf6-alternative-title', 'Battlefield Phantom Edition na Xbox Series X',
          'Battlefield 2042 Phantom Edition', '{"Battlefield 6 Phantom Edition"}', 'xbox-series', 'physical', 124.48),
        (10, 'wiedzmin-polish-title', 'Wiedźmin 3: Dziki Gon - Edycja Gry Roku',
          'Wiedźmin 3: Dziki Gon - Edycja Gry Roku', '{}', 'ps4', 'physical', 79.00),
        (11, 'dogma-curly-apostrophe', 'Dragon’s Dogma 2', 'Dragon’s Dogma 2', '{}', 'ps5', 'physical', 129.00),
        (12, 'hogwarts-alternative-title', 'Hogwarts Legacy', 'Hogwarts Legacy', '{"Dziedzictwo Hogwartu"}',
          'ps5', 'physical', 99.00),
        (13, 'abc-def', 'Abc', 'Def', '{}', 'ps5', 'physical', 50.00),
        (14, 'metroid-switch', 'Metroid Prime 4: Beyond', 'Metroid Prime 4: Beyond', '{}', 'switch', 'physical', 219.00),
        (15, 'hollow-knight-no-platform', 'Hollow Knight', 'Hollow Knight', '{}', null, 'physical', 59.00),
        (16, 'hollow-knight-other', 'Hollow Knight', 'Hollow Knight', '{}', 'other', 'physical', 59.00),
        (17, 'astro-bot-no-platform', 'Astro Bot', 'Astro Bot', '{}', null, 'physical', 199.00),
        (18, 'witcher-game-and-phrase', 'Wiedźmin 3: Dziki Gon - Edycja Gry Roku',
          'The Witcher 3: Wild Hunt - Game of the Year Edition', '{"Wiedźmin 3: Dziki Gon - GOTY"}',
          'ps4', 'physical', 84.50),
        (19, 'pentiment', 'Pentiment', 'Pentiment', '{}', 'xbox-series', 'physical', 89.00),
        (20, 'go-go-go', 'Go Go Go!!!', 'Go Go Go!!!', '{}', 'switch', 'physical', 39.00)
      ) as t(item, label, title, english_title, alternative_titles, platform, edition, price)
      order by t.item
    loop
      insert into public.deals (link, item_index, source, published_at, kind, edition, platform,
        title, english_title, alternative_titles, price_amount, currency)
      values (fixture_link, c.item, 'matching-check', now(), 'game', c.edition, c.platform,
        c.title, c.english_title, c.alternative_titles, c.price,
        case when c.price is not null then 'PLN' end)
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

  begin
    select count(*) into counted from public.deals
    where id = any (ids) and match_keys is not null and match_text is not null and match_text <> '';
    if counted = 20 then
      report := array_append(report, 'ok   all 20 fixture deals carry match_keys and a non-empty match_text');
    else
      failures := failures + 1;
      report := array_append(report, format('FAIL %s of 20 fixture deals carry match_keys and a non-empty match_text', counted));
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL reading the fixture deals'' keys: %s %s', sqlstate, sqlerrm));
  end;

  for c in
    select * from (values
      (1, 'witcher-game-and-phrase', '{"wiedzmin 3 dziki gon","witcher 3 wild hunt"}'::text[],
        'wiedzmin 3 dziki gon edycja gry roku | the witcher 3 wild hunt game of the year edition | wiedzmin 3 dziki gon goty'),
      (2, 'witcher-english-title', '{"witcher 3","witcher 3 wild hunt"}',
        'the witcher 3 edycja gry roku | the witcher 3 wild hunt game of the year edition'),
      (3, 'bf6-alternative-title', '{battlefield,"battlefield 2042","battlefield 6"}',
        'battlefield phantom edition na xbox series x | battlefield 2042 phantom edition | battlefield 6 phantom edition'),
      (4, 'abc-def', '{abc,def}', 'abc | def'),
      (5, 'go-go-go', '{"go go go"}', 'go go go | go go go')
    ) as t(step, label, keys, folded)
    order by t.step
  loop
    begin
      got_keys := null;
      got := null;
      select d.match_keys, d.match_text into got_keys, got
      from public.deals as d where d.id = ids[array_position(labels, c.label)];
      if got_keys is not distinct from c.keys and got is not distinct from c.folded then
        report := array_append(report, format('ok   %s stores %s and %L', c.label, got_keys, got));
      else
        failures := failures + 1;
        report := array_append(report, format('FAIL %s stores %s and %L, expected %s and %L',
          c.label, got_keys, got, c.keys, c.folded));
      end if;
    exception when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL reading %s''s keys: %s %s', c.label, sqlstate, sqlerrm));
    end;
  end loop;

  -- The watchlists, as each user ------------------------------------------------
  -- Every insert evaluates the folded phrase index as authenticated, which
  -- therefore needs EXECUTE on fold_for_matching.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, platform) values
      ('game', 909, 'silent-hill-2', 'Silent Hill 2', 'ps5'),
      ('game', 3328, 'the-witcher-3-wild-hunt', 'The Witcher 3: Wild Hunt', null),
      ('game', 326243, 'elden-ring', 'Elden Ring', null),
      ('game', 50734, 'front-mission-3', 'Front Mission 3', null),
      ('game', 13536, 'final-fantasy-vii', 'Final Fantasy VII (1997)', null),
      ('game', 990001, 'battlefield-6', 'Battlefield 6', null),
      ('game', 990002, 'metroid-prime-4-beyond', 'Metroid Prime 4: Beyond', 'switch-2'),
      ('game', 9767, 'hollow-knight', 'Hollow Knight', null),
      ('game', 990003, 'astro-bot', 'Astro Bot', 'ps5');
    insert into public.watchlist_entries (kind, phrase, platform) values
      ('phrase', 'wiedzmin', null),
      ('phrase', 'Dragon''s Dogma', null),
      ('phrase', 'dziedzictwo', null),
      ('phrase', 'c d', null),
      ('phrase', '!!!', null);
    insert into public.watchlist_entries (kind, phrase, platform)
    values ('phrase', 'Pentiment', null)
    returning id into removed_entry;
    update public.watchlist_entries set removed_at = now()
    where id = removed_entry and removed_at is null;
    get diagnostics counted = row_count;
    if counted <> 1 then
      raise exception 'removing the phrase "Pentiment" updated % rows', counted;
    end if;
    report := array_append(report, 'ok   A adds 9 games and 5 phrases, and adds and removes the phrase "Pentiment"');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL A adds its entries: %s %s', sqlstate, sqlerrm));
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);

  begin
    insert into public.watchlist_entries (kind, game_id, game_slug, game_name, platform)
    values ('game', 909, 'silent-hill-2', 'Silent Hill 2', null);
    report := array_append(report, 'ok   B adds "Silent Hill 2" on any platform');
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL B adds "Silent Hill 2": %s %s', sqlstate, sqlerrm));
  end;

  -- 3 and 4. The view, as A and then as B ---------------------------------------
  -- Each case names the fixture deals it must show and those it must hide;
  -- the last line per user compares the whole set, so a deal no case expects,
  -- or one shown twice, fails too.
  for u in
    select * from (values
      (1, 'A', user_a, array['sh2-ps5', 'witcher-english-title', 'ff7-switch', 'bf6-alternative-title',
        'wiedzmin-polish-title', 'dogma-curly-apostrophe', 'hogwarts-alternative-title',
        'hollow-knight-no-platform', 'hollow-knight-other', 'witcher-game-and-phrase']),
      (2, 'B', user_b, array['sh2-ps5', 'sh2-xbox'])
    ) as t(step, who, uid, expected)
    order by t.step
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
    seen := null;
    begin
      select coalesce(array_agg(s.label order by s.label), '{}') into seen
      from (
        select labels[array_position(ids, m.id)] as label
        from public.matched_deals as m
        where m.id = any (ids)
      ) as s;
    exception when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL %s reads matched_deals: %s %s', u.who, sqlstate, sqlerrm));
    end;

    if seen is not null then
      for c in
        select * from (values
          (1, 'A', '"Silent Hill 2" pinned to ps5: the ps5 deal only, not the xbox-series one',
            array['sh2-ps5'], array['sh2-xbox']),
          (2, 'A', '"The Witcher 3: Wild Hunt" matches through english_title',
            array['witcher-english-title'], array[]::text[]),
          (3, 'A', '"Elden Ring" does not match "Elden Ring Nightreign"',
            array[]::text[], array['nightreign']),
          (4, 'A', '"Front Mission 3" does not match "Front Mission 3 Remake"',
            array[]::text[], array['fm3-remake']),
          (5, 'A', '"Final Fantasy VII (1997)" matches "FINAL FANTASY VII" on switch',
            array['ff7-switch'], array[]::text[]),
          (6, 'A', '"Battlefield 6" matches through an alternative title',
            array['bf6-alternative-title'], array[]::text[]),
          (7, 'A', 'the phrase "wiedzmin" matches "Wiedźmin 3: Dziki Gon - Edycja Gry Roku"',
            array['wiedzmin-polish-title'], array[]::text[]),
          (8, 'A', 'the phrase "Dragon''s Dogma" matches "Dragon’s Dogma 2"',
            array['dogma-curly-apostrophe'], array[]::text[]),
          (9, 'A', 'the phrase "dziedzictwo" matches through alternative_titles only',
            array['hogwarts-alternative-title'], array[]::text[]),
          (10, 'A', 'the phrase "c d" does not span the titles "Abc" and "Def"',
            array[]::text[], array['abc-def']),
          (11, 'A', '"Metroid Prime 4: Beyond" pinned to switch-2 does not match a switch deal',
            array[]::text[], array['metroid-switch']),
          (12, 'A', 'unpinned "Hollow Knight" matches deals with no platform and with other',
            array['hollow-knight-no-platform', 'hollow-knight-other'], array[]::text[]),
          (13, 'A', '"Astro Bot" pinned to ps5 does not match a deal with no platform',
            array[]::text[], array['astro-bot-no-platform']),
          (14, 'A', 'a game and a phrase that both match one deal show it',
            array['witcher-game-and-phrase'], array[]::text[]),
          (15, 'A', 'the removed phrase "Pentiment" matches nothing',
            array[]::text[], array['pentiment']),
          (16, 'A', 'the phrase "!!!" matches nothing',
            array[]::text[], array['go-go-go']),
          (17, 'A', 'a digital deal and an unpriced one never show',
            array[]::text[], array['sh2-digital', 'sh2-unpriced']),
          (18, 'B', '"Silent Hill 2" on any platform: both the ps5 and the xbox-series deal',
            array['sh2-ps5', 'sh2-xbox'], array['sh2-digital', 'sh2-unpriced']),
          (19, 'B', 'none of the deals only A''s entries match',
            array[]::text[], array['witcher-english-title', 'ff7-switch', 'bf6-alternative-title',
              'wiedzmin-polish-title', 'dogma-curly-apostrophe', 'hogwarts-alternative-title',
              'hollow-knight-no-platform', 'hollow-knight-other', 'witcher-game-and-phrase'])
        ) as t(step, who, name, shown, hidden)
        where t.who = u.who
        order by t.step
      loop
        select string_agg(x, ', ' order by x) into missing from unnest(c.shown) as x where x <> all (seen);
        select string_agg(x, ', ' order by x) into unexpected from unnest(c.hidden) as x where x = any (seen);
        if missing is null and unexpected is null then
          report := array_append(report, format('ok   %s: %s', u.who, c.name));
        else
          failures := failures + 1;
          report := array_append(report, format('FAIL %s: %s — missing: %s; shown anyway: %s',
            u.who, c.name, coalesce(missing, 'none'), coalesce(unexpected, 'none')));
        end if;
      end loop;

      select coalesce(array_agg(x order by x), '{}') into wanted from unnest(u.expected) as x;
      if seen = wanted then
        report := array_append(report, format('ok   %s sees exactly %s fixture deals, each once', u.who, cardinality(wanted)));
      else
        select string_agg(x, ', ' order by x) into missing from unnest(wanted) as x where x <> all (seen);
        select string_agg(x, ', ' order by x) into unexpected from unnest(seen) as x where x <> all (wanted);
        select string_agg(r.x, ', ' order by r.x) into repeated
        from (select x from unnest(seen) as x group by x having count(*) > 1) as r;
        failures := failures + 1;
        report := array_append(report, format('FAIL %s''s view — missing: %s; unexpected: %s; repeated: %s',
          u.who, coalesce(missing, 'none'), coalesce(unexpected, 'none'), coalesce(repeated, 'none')));
      end if;
    end if;

    if u.who = 'A' then
      begin
        select count(*) into counted from public.matched_deals
        where id = ids[array_position(labels, 'witcher-game-and-phrase')];
        if counted = 1 then
          report := array_append(report, 'ok   A: the deal a game and a phrase both match appears once');
        else
          failures := failures + 1;
          report := array_append(report, format('FAIL A: the deal a game and a phrase both match appears %s times', counted));
        end if;
      exception when others then
        failures := failures + 1;
        report := array_append(report, format('FAIL A counts the deal both entries match: %s %s', sqlstate, sqlerrm));
      end;
    end if;
  end loop;

  -- 5. anon, and the grants -------------------------------------------------------
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  begin
    perform count(*) from public.matched_deals;
    failures := failures + 1;
    report := array_append(report, 'FAIL anon selects matched_deals: accepted');
  exception
    when insufficient_privilege then
      report := array_append(report, 'ok   anon selects matched_deals: 42501');
    when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL anon selects matched_deals: %s %s', sqlstate, sqlerrm));
  end;

  for c in
    select * from (values
      (1, 'anon', array[]::text[]),
      (2, 'authenticated', array['fold_for_matching', 'game_match_key']),
      (3, 'service_role', array['deal_match_keys', 'deal_match_text', 'fold_for_matching', 'game_match_key'])
    ) as t(step, role_name, expected)
    order by t.step
  loop
    begin
      select coalesce(array_agg(f.name order by f.name), '{}') into held
      from (values
        ('deal_match_keys', 'public.deal_match_keys(text, text, text[])'),
        ('deal_match_text', 'public.deal_match_text(text, text, text[])'),
        ('fold_for_matching', 'public.fold_for_matching(text)'),
        ('game_match_key', 'public.game_match_key(text)')
      ) as f(name, signature)
      where has_function_privilege(c.role_name, f.signature, 'execute');
      if held = c.expected then
        report := array_append(report, format('ok   %s executes %s', c.role_name,
          coalesce(nullif(array_to_string(held, ', '), ''), 'none of the four functions')));
      else
        failures := failures + 1;
        report := array_append(report, format('FAIL %s executes %s, expected %s', c.role_name,
          coalesce(nullif(array_to_string(held, ', '), ''), 'none'),
          coalesce(nullif(array_to_string(c.expected, ', '), ''), 'none')));
      end if;
    exception when others then
      failures := failures + 1;
      report := array_append(report, format('FAIL reading %s''s EXECUTE privileges: %s %s', c.role_name, sqlstate, sqlerrm));
    end;
  end loop;

  begin
    if has_table_privilege('authenticated', 'public.matched_deals', 'select')
      and not has_table_privilege('authenticated', 'public.matched_deals',
        'insert, update, delete, truncate, references, trigger')
      and not has_table_privilege('anon', 'public.matched_deals',
        'select, insert, update, delete, truncate, references, trigger')
      and not has_table_privilege('service_role', 'public.matched_deals',
        'select, insert, update, delete, truncate, references, trigger')
    then
      report := array_append(report, 'ok   on matched_deals, authenticated holds select and nothing else, anon and service_role nothing');
    else
      failures := failures + 1;
      report := array_append(report, 'FAIL the privileges on matched_deals are not select for authenticated alone');
    end if;
  exception when others then
    failures := failures + 1;
    report := array_append(report, format('FAIL reading the privileges on matched_deals: %s %s', sqlstate, sqlerrm));
  end;

  -- 6. Phrase duplicates, as B -----------------------------------------------------
  -- After B's view was read, so these phrases change no view result, and on B's
  -- list, so A's phrases cannot collide with them.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);

  for c in
    select * from (values
      (1, 'Wiedźmin', null, null),
      (2, 'wiedzmin', null, 'watchlist_entries_active_phrase_folded'),
      (3, 'wiedzmin', 'ps5', null),
      (4, '!!!', null, null),
      (5, '???', null, null),
      (6, '!!!', null, 'watchlist_entries_active_phrase')
    ) as t(step, phrase, platform, refused_by)
    order by t.step
  loop
    begin
      insert into public.watchlist_entries (kind, phrase, platform) values ('phrase', c.phrase, c.platform);
      if c.refused_by is null then
        report := array_append(report, format('ok   B adds „%s” on %s: accepted', c.phrase, coalesce(c.platform, 'any platform')));
      else
        failures := failures + 1;
        report := array_append(report, format('FAIL B adds „%s” on %s: accepted, expected 23505 from %s',
          c.phrase, coalesce(c.platform, 'any platform'), c.refused_by));
      end if;
    exception
      when unique_violation then
        get stacked diagnostics refused_by = constraint_name;
        if refused_by = c.refused_by then
          report := array_append(report, format('ok   B adds „%s” on %s: 23505 from %s',
            c.phrase, coalesce(c.platform, 'any platform'), refused_by));
        else
          failures := failures + 1;
          report := array_append(report, format('FAIL B adds „%s” on %s: 23505 from %s, expected %s',
            c.phrase, coalesce(c.platform, 'any platform'), refused_by, coalesce(c.refused_by, 'acceptance')));
        end if;
      when others then
        failures := failures + 1;
        report := array_append(report, format('FAIL B adds „%s” on %s: %s %s',
          c.phrase, coalesce(c.platform, 'any platform'), sqlstate, sqlerrm));
    end;
  end loop;

  raise exception '%', format(E'Rolled back on purpose. %s\n%s',
    case when failures = 0 then 'All checks passed.' else failures || ' check(s) failed.' end,
    array_to_string(report, E'\n'));
end;
$check$;
