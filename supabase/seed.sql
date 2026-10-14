-- Fixture data for the local Supabase stack only. It never reaches the hosted
-- project.
--
-- `npm run local:reset` (scripts/local/reset.mts) loads it explicitly, with
-- `supabase db reset --local --sql-paths ./seed.sql`, after
-- `--sql-paths ./snapshot.sql` when supabase/snapshot.sql exists. [db.seed] in
-- config.toml stays disabled, so `supabase start` never applies this file and
-- `supabase db push --include-seed` never pushes it: there, its deals would be
-- listed publicly and its run would make the freshness line lie.
--
-- What it shows:
-- - D1, listed: a PS5 game with a discount and a shop link on sklep.example,
--   so its card links to the shop and to the post;
-- - D2, listed: a Switch game with no shop link, so its card falls back to the
--   post; the watchlist phrase "silksong" matches it and nothing else;
-- - D3, not listed: a digital copy;
-- - D4, not listed: a physical copy whose offer ended a day before the seed
--   ran;
-- - one ok pipeline run that finishes as the seed runs, so the freshness line
--   reads fresh for six hours afterwards.
-- Every post has processed_at set, so a local `npm run extract` never sends it
-- to the model.
--
-- It applies on top of a data-only dump of production:
-- - every post id starts with 5eed and every link and shop URL is on an
--   .example host, so no row can collide with a production one;
-- - it never names deals.id or pipeline_runs.id, identity columns whose
--   sequences the dump moves past its own rows with setval, nor the generated
--   deals.match_keys and deals.match_text;
-- - it names every table with its schema, because a dump leaves the session's
--   search_path empty.
-- It writes no auth.users row and no watchlist entry: a local account signs up
-- through the app.
--
-- tests/db/seed.test.ts applies this file to the migrations, alone and on top
-- of rows shaped like a dump's, and checks what anon and a signed-in user see.

-- The posts, one per deal. --------------------------------------------------
insert into public.collected_posts
  (id, source, platform_hint, title, link, published_at, first_seen_at, processed_at)
values
  ('5eed000000000001', 'seed', 'ps5', 'Gra Elden Ring PS5 Pudełkowa za 129,99 zł (-20%)',
   'https://okazje.example/seed/elden-ring-ps5',
   now() - interval '1 hour', now() - interval '55 minutes', now()),
  ('5eed000000000002', 'seed', 'switch', 'Hollow Knight: Silksong – edycja pudełkowa za 149 zł',
   'https://okazje.example/seed/hollow-knight-silksong-switch',
   now() - interval '2 hours', now() - interval '115 minutes', now()),
  ('5eed000000000003', 'seed', 'ps5', 'Astro Bot – kod cyfrowy na PS5 za 159 zł',
   'https://okazje.example/seed/astro-bot-ps5-digital',
   now() - interval '3 hours', now() - interval '175 minutes', now()),
  ('5eed000000000004', 'seed', 'switch', 'The Legend of Zelda: Tears of the Kingdom – wersja pudełkowa za 219 zł, tylko do wczoraj',
   'https://okazje.example/seed/zelda-tears-of-the-kingdom-switch',
   now() - interval '2 days', now() - interval '47 hours', now());

-- What a model returned for each post, in the shape of
-- scripts/extract/schema.mts: one item per post. --------------------------
insert into public.post_extractions (link, post_id, model, prompt_version, item_count, output)
values
  ('https://okazje.example/seed/elden-ring-ps5', '5eed000000000001', 'seed', 3, 1,
   jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
     'title', 'Gra Elden Ring PS5 Pudełkowa', 'englishTitle', 'Elden Ring',
     'alternativeTitles', jsonb_build_array(), 'kind', 'game',
     'editionEvidence', 'Pudełkowa', 'edition', 'physical', 'platform', 'ps5',
     'setWith', jsonb_build_array(), 'price', jsonb_build_object('amount', 129.99, 'currency', 'PLN'),
     'discountPercent', 20, 'expiresOn', null, 'expiresAt', null,
     'shopName', 'Sklep Przykładowy', 'shopUrl', 'https://sklep.example/elden-ring-ps5')))),
  ('https://okazje.example/seed/hollow-knight-silksong-switch', '5eed000000000002', 'seed', 3, 1,
   jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
     'title', 'Hollow Knight: Silksong – edycja pudełkowa', 'englishTitle', 'Hollow Knight: Silksong',
     'alternativeTitles', jsonb_build_array(), 'kind', 'game',
     'editionEvidence', 'edycja pudełkowa', 'edition', 'physical', 'platform', 'switch',
     'setWith', jsonb_build_array(), 'price', jsonb_build_object('amount', 149.00, 'currency', 'PLN'),
     'discountPercent', null, 'expiresOn', null, 'expiresAt', null,
     'shopName', null, 'shopUrl', null)))),
  ('https://okazje.example/seed/astro-bot-ps5-digital', '5eed000000000003', 'seed', 3, 1,
   jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
     'title', 'Astro Bot – kod cyfrowy', 'englishTitle', 'Astro Bot',
     'alternativeTitles', jsonb_build_array(), 'kind', 'game',
     'editionEvidence', 'kod cyfrowy', 'edition', 'digital', 'platform', 'ps5',
     'setWith', jsonb_build_array(), 'price', jsonb_build_object('amount', 159.00, 'currency', 'PLN'),
     'discountPercent', null, 'expiresOn', null, 'expiresAt', null,
     'shopName', null, 'shopUrl', null)))),
  ('https://okazje.example/seed/zelda-tears-of-the-kingdom-switch', '5eed000000000004', 'seed', 3, 1,
   jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
     'title', 'The Legend of Zelda: Tears of the Kingdom – wersja pudełkowa',
     'englishTitle', 'The Legend of Zelda: Tears of the Kingdom',
     'alternativeTitles', jsonb_build_array(), 'kind', 'game',
     'editionEvidence', 'wersja pudełkowa', 'edition', 'physical', 'platform', 'switch',
     'setWith', jsonb_build_array(), 'price', jsonb_build_object('amount', 219.00, 'currency', 'PLN'),
     'discountPercent', null, 'expiresOn', null, 'expiresAt', now() - interval '1 day',
     'shopName', null, 'shopUrl', null))));

-- The deals, as the extractor stores them. ----------------------------------
insert into public.deals
  (link, item_index, source, published_at, kind, edition, platform, title, english_title,
   price_amount, currency, discount_percent, expires_at, shop_url, shop_name, edition_evidence)
values
  -- D1, listed, with a shop link.
  ('https://okazje.example/seed/elden-ring-ps5', 0, 'seed', now() - interval '1 hour',
   'game', 'physical', 'ps5', 'Gra Elden Ring PS5 Pudełkowa', 'Elden Ring',
   129.99, 'PLN', 20, null, 'https://sklep.example/elden-ring-ps5', 'Sklep Przykładowy', 'Pudełkowa'),
  -- D2, listed, with no shop link.
  ('https://okazje.example/seed/hollow-knight-silksong-switch', 0, 'seed', now() - interval '2 hours',
   'game', 'physical', 'switch', 'Hollow Knight: Silksong – edycja pudełkowa', 'Hollow Knight: Silksong',
   149.00, 'PLN', null, null, null, null, 'edycja pudełkowa'),
  -- D3, not listed: a digital copy.
  ('https://okazje.example/seed/astro-bot-ps5-digital', 0, 'seed', now() - interval '3 hours',
   'game', 'digital', 'ps5', 'Astro Bot – kod cyfrowy', 'Astro Bot',
   159.00, 'PLN', null, null, null, null, 'kod cyfrowy'),
  -- D4, not listed: the offer ended a day ago.
  ('https://okazje.example/seed/zelda-tears-of-the-kingdom-switch', 0, 'seed', now() - interval '2 days',
   'game', 'physical', 'switch', 'The Legend of Zelda: Tears of the Kingdom – wersja pudełkowa',
   'The Legend of Zelda: Tears of the Kingdom',
   219.00, 'PLN', null, now() - interval '1 day', null, null, 'wersja pudełkowa');

-- One ok run, finished as the seed runs. -------------------------------------
insert into public.pipeline_runs
  (started_at, finished_at, collect_succeeded, outcome, links_attempted, links_extracted,
   links_failed, deals_listed, links_pending, cost_usd)
values
  (now() - interval '1 minute', now(), true, 'ok', 4, 4, 0, 2, 0, 0);
