/**
 * supabase/seed.sql, the local stack's fixture data, applied as the owner to a
 * database built from supabase/migrations/, as `npm run local:reset` applies
 * it after the migrations (scripts/local/reset.mts).
 *
 * It pins what the seed shows, as Phase 2 of
 * context/changes/local-supabase-stack/plan.md states it: anon lists exactly
 * D1 and D2, newest first, with the fields their cards render; the newest ok
 * run has just finished, so the freshness line reads fresh; and a signed-in
 * user's phrase "silksong" matches D2 alone in public.matched_deals. D3, a
 * digital copy, and D4, an offer that ended a day ago, are written too, and
 * the listed predicate hides them.
 *
 * The seed must also apply on top of a production snapshot, as
 * `supabase db dump --linked --data-only` writes one: rows with explicit
 * identity values, each identity sequence moved past them with setval, and the
 * session's search_path left empty. The second database loads rows shaped that
 * way before the seed.
 *
 * Each case acts as its role through set local role and request.jwt.claims,
 * as supabase/checks/listed-expiry.sql does, in a transaction that rolls back.
 * Each database lives only as long as its describe block.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildDatabase,
  REPOSITORY_ROOT,
  type Database,
} from "./harness/database";

const SEED = readFileSync(
  join(REPOSITORY_ROOT, "supabase", "seed.sql"),
  "utf8",
);

const D1 = "https://okazje.example/seed/elden-ring-ps5";
const D2 = "https://okazje.example/seed/hollow-knight-silksong-switch";
const D3 = "https://okazje.example/seed/astro-bot-ps5-digital";
const D4 = "https://okazje.example/seed/zelda-tears-of-the-kingdom-switch";

/** The snapshot's one listed deal; its other deal is not a game. */
const SNAPSHOT_LINK = "https://example.invalid/snapshot/post-1";

/** A signed-in user, inserted into auth.users by the case that needs one. */
const USER = "5eed0000-0000-4000-8000-000000000001";

/**
 * The listed deals as anon reads them, in the page's order: newest first by
 * the post's time, then by id. The price is read as text, as PostgREST writes
 * numeric(10,2).
 */
const LISTED = `select link, platform, title, price_amount::text as price_amount,
    currency, discount_percent, expires_at, shop_url
  from public.deals order by published_at desc, id desc`;

/** Whether the newest ok run finished within the last minute. */
const NEWEST_RUN_IS_FRESH = `select finished_at > now() - interval '1 minute'
    and finished_at <= now() as fresh
  from public.pipeline_runs where outcome = 'ok'
  order by finished_at desc, id desc limit 1`;

/** Runs work as anon in a transaction, then rolls it back. */
function asAnon<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.pg.transaction(async (tx) => {
    await tx.exec("set local role anon");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "anon" }),
    ]);
    const result = await work(tx);
    await tx.rollback();
    return result;
  });
}

/**
 * The rows of a data-only dump of production, as statements: the session
 * setting a dump starts with, one post with its extraction, two deals and one
 * run with explicit identity values, and the setval calls a dump ends with.
 * The times are relative to now, so the seed's rows are the newer ones
 * whatever the clock says.
 */
const SNAPSHOT = `
select pg_catalog.set_config('search_path', '', false);

insert into public.collected_posts
  (id, source, platform_hint, title, link, published_at, categories, content,
   first_seen_at, processed_at, extraction_attempts, extraction_error)
values ('0123456789abcdef', 'pepper-ps5', 'ps5', 'A snapshot post', '${SNAPSHOT_LINK}',
  now() - interval '1 day', '{}', null, now() - interval '1 day', now() - interval '1 day', 0, null);

insert into public.post_extractions
  (link, post_id, model, prompt_version, item_count, output, extracted_at)
values ('${SNAPSHOT_LINK}', '0123456789abcdef', 'snapshot-model', 3, 2, '{"items": []}',
  now() - interval '1 day');

insert into public.deals
  (id, link, item_index, source, published_at, kind, edition, platform, title,
   english_title, price_amount, currency)
overriding system value
values
  (1, '${SNAPSHOT_LINK}', 0, 'pepper-ps5', now() - interval '1 day', 'game', 'physical',
   'ps5', 'Snapshot Game PS5', 'Snapshot Game', 99.00, 'PLN'),
  (2, '${SNAPSHOT_LINK}', 1, 'pepper-ps5', now() - interval '1 day', 'not_game', 'unclear',
   null, 'Snapshot Controller', 'Snapshot Controller', 199.00, 'PLN');

insert into public.pipeline_runs
  (id, started_at, finished_at, collect_succeeded, outcome, links_attempted,
   links_extracted, links_failed, deals_listed, links_pending, cost_usd)
overriding system value
values (1, now() - interval '5 hours', now() - interval '5 hours', true, 'ok', 1, 1, 0, 1, 0, 0.0012);

select pg_catalog.setval('public.deals_id_seq', 2, true);
select pg_catalog.setval('public.pipeline_runs_id_seq', 1, true);
`;

describe("supabase/seed.sql on the migrations", () => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase();
    await db.pg.exec(SEED);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("lists exactly D1 and D2 to anon, newest first", async () => {
    const { rows } = await asAnon(db, (tx) => tx.query(LISTED));
    expect(rows).toEqual([
      {
        link: D1,
        platform: "ps5",
        title: "Gra Elden Ring PS5 Pudełkowa",
        price_amount: "129.99",
        currency: "PLN",
        discount_percent: 20,
        expires_at: null,
        shop_url: "https://sklep.example/elden-ring-ps5",
      },
      {
        link: D2,
        platform: "switch",
        title: "Hollow Knight: Silksong – edycja pudełkowa",
        price_amount: "149.00",
        currency: "PLN",
        discount_percent: null,
        expires_at: null,
        shop_url: null,
      },
    ]);
  });

  it("writes D3 and D4 too, a digital copy and an ended offer", async () => {
    const { rows } = await db.pg.query<{
      link: string;
      edition: string;
      ended: boolean | null;
    }>(
      `select link, edition, expires_at <= now() as ended
       from public.deals where source = 'seed' order by link`,
    );
    expect(rows).toEqual([
      { link: D3, edition: "digital", ended: null },
      { link: D1, edition: "physical", ended: null },
      { link: D2, edition: "physical", ended: null },
      { link: D4, edition: "physical", ended: true },
    ]);
  });

  it("gives anon an ok run that finished within the last minute", async () => {
    const { rows } = await asAnon(db, (tx) =>
      tx.query<{ fresh: boolean }>(NEWEST_RUN_IS_FRESH),
    );
    expect(rows).toEqual([{ fresh: true }]);
  });

  it('matches the phrase "silksong" to D2 alone', async () => {
    const links = await db.pg.transaction(async (tx) => {
      await tx.query("insert into auth.users (id) values ($1)", [USER]);
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USER, role: "authenticated" }),
      ]);
      await tx.query(
        "insert into public.watchlist_entries (kind, phrase) values ('phrase', 'silksong')",
      );
      const { rows } = await tx.query<{ link: string }>(
        "select link from public.matched_deals order by link",
      );
      await tx.rollback();
      return rows.map((row) => row.link);
    });
    expect(links).toEqual([D2]);
  });
});

describe("supabase/seed.sql on top of a data-only snapshot", () => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase();
    await db.pg.exec(SNAPSHOT);
    await db.pg.exec(SEED);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("adds D1 and D2 to the snapshot's listed deal", async () => {
    const { rows } = await asAnon(db, (tx) =>
      tx.query<{ link: string }>("select link from public.deals order by link"),
    );
    expect(rows.map((row) => row.link)).toEqual([D1, D2, SNAPSHOT_LINK].sort());
  });

  it("numbers its deals and its run past the snapshot's", async () => {
    const { rows } = await db.pg.query<{
      deals: number;
      first_deal: string;
      run: string;
    }>(
      `select (select count(*)::int from public.deals where source = 'seed') as deals,
         (select min(id)::text from public.deals where source = 'seed') as first_deal,
         (select max(id)::text from public.pipeline_runs) as run`,
    );
    expect(rows).toEqual([{ deals: 4, first_deal: "3", run: "2" }]);
  });

  it("makes its run the newest ok one", async () => {
    const { rows } = await asAnon(db, (tx) =>
      tx.query<{ fresh: boolean }>(NEWEST_RUN_IS_FRESH),
    );
    expect(rows).toEqual([{ fresh: true }]);
  });
});
