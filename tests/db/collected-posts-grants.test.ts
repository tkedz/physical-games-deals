/**
 * What service_role may do on public.collected_posts, under both privilege
 * models a database built from supabase/migrations/ can meet: Supabase's
 * default privileges of each migration's own date, as the hosted project was
 * built, and none at all, as a stack whose CLI no longer grants new public
 * objects builds it (defaultPrivilegesEnd at NO_DEFAULT_PRIVILEGES). Without
 * 20261014111929_grant_collected_posts_to_service_role.sql the second refuses
 * every pipeline write with 42501.
 *
 * service_role may do what the pipeline does: insert and read the ids back,
 * and insert on conflict do nothing (insertPosts in
 * scripts/collector/posts.mts, for collect and collect:import), select, and
 * update processed_at, extraction_attempts and extraction_error
 * (scripts/extract/store.mts). It may neither delete nor truncate, and anon
 * and authenticated may not read the table.
 *
 * Each case acts as its role through set local role and request.jwt.claims,
 * as supabase/checks/listed-expiry.sql does, in a transaction that rolls back,
 * so no case sees another's rows. The owner's fixture post is the one row they
 * share. Each database lives only as long as its describe block.
 */
import type { Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildDatabase,
  NO_DEFAULT_PRIVILEGES,
  type BuildOptions,
  type Database,
} from "./harness/database";

type Role = "service_role" | "anon" | "authenticated";

/** The claims PostgREST sets for each role; a signed-in user carries a sub. */
const CLAIMS: Record<Role, Record<string, string>> = {
  service_role: { role: "service_role" },
  anon: { role: "anon" },
  authenticated: {
    sub: "9a175000-0000-4000-8000-000000000001",
    role: "authenticated",
  },
};

/** The owner's post, inserted once per database, which the cases share. */
const FIXTURE_POST = "collected-posts-grants";
const FIXTURE_LINK = "https://example.invalid/collected-posts-grants";

/** A post no case leaves behind, since each one rolls back. */
const NEW_POST = "collected-posts-grants-new";

/**
 * The nine columns the collector writes, as insertPosts names them, one row
 * per id in $1.
 */
const INSERT_POSTS = `insert into public.collected_posts
    (id, source, platform_hint, title, link, published_at, categories, content, first_seen_at)
  select id, 'collected-posts-grants', 'fixture', 'A post of tests/db/collected-posts-grants.test.ts',
    'https://example.invalid/' || id, null, '{}', null, now()
  from unnest($1::text[]) as t(id)`;

const MODELS: { model: string; options: BuildOptions }[] = [
  {
    model: "under Supabase's default privileges of each migration's date",
    options: {},
  },
  {
    model: "with no Supabase default privileges",
    options: { defaultPrivilegesEnd: NO_DEFAULT_PRIVILEGES },
  },
];

describe.each(MODELS)("public.collected_posts, $model", ({ options }) => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase(options);
    await db.pg.query(
      `insert into public.collected_posts (id, source, platform_hint, title, link, first_seen_at)
       values ($1, 'collected-posts-grants', 'fixture', 'Fixture post of tests/db/collected-posts-grants.test.ts', $2, '2026-10-01T09:00:00Z')`,
      [FIXTURE_POST, FIXTURE_LINK],
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  /** Runs work as the role in a transaction, then rolls it back. */
  function as<T>(
    role: Role,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return db.pg.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(CLAIMS[role]),
      ]);
      const result = await work(tx);
      await tx.rollback();
      return result;
    });
  }

  it("lets service_role insert a post and read its id back", async () => {
    const { rows } = await as("service_role", (tx) =>
      tx.query<{ id: string }>(`${INSERT_POSTS} returning id`, [[NEW_POST]]),
    );
    expect(rows).toEqual([{ id: NEW_POST }]);
  });

  it("lets service_role insert on conflict do nothing, skipping a post already there", async () => {
    const { rows } = await as("service_role", (tx) =>
      tx.query<{ id: string }>(
        `${INSERT_POSTS} on conflict (id) do nothing returning id`,
        [[FIXTURE_POST, NEW_POST]],
      ),
    );
    expect(rows).toEqual([{ id: NEW_POST }]);
  });

  it("lets service_role select the pending posts", async () => {
    const { rows } = await as("service_role", (tx) =>
      tx.query<{ id: string; link: string }>(
        `select id, link from public.collected_posts
         where processed_at is null and extraction_attempts < 3 and id = $1`,
        [FIXTURE_POST],
      ),
    );
    expect(rows).toEqual([{ id: FIXTURE_POST, link: FIXTURE_LINK }]);
  });

  it("lets service_role update processed_at, extraction_attempts and extraction_error", async () => {
    const updated = await as("service_role", async (tx) => {
      // countFailure: the count read plus one, guarded by the count read.
      const counted = await tx.query(
        `update public.collected_posts
         set extraction_attempts = 1, extraction_error = 'fixture failure'
         where id = $1 and extraction_attempts = 0`,
        [FIXTURE_POST],
      );
      // saveExtraction: every row with the link is closed.
      const closed = await tx.query(
        "update public.collected_posts set processed_at = now() where link = $1",
        [FIXTURE_LINK],
      );
      const { rows } = await tx.query<{
        attempts: number;
        error: string | null;
        processed: boolean;
      }>(
        `select extraction_attempts as attempts, extraction_error as error,
           processed_at is not null as processed
         from public.collected_posts where id = $1`,
        [FIXTURE_POST],
      );
      return {
        counted: counted.affectedRows,
        closed: closed.affectedRows,
        row: rows[0],
      };
    });
    expect(updated).toEqual({
      counted: 1,
      closed: 1,
      row: { attempts: 1, error: "fixture failure", processed: true },
    });
  });

  it("refuses service_role a delete", async () => {
    await expect(
      as("service_role", (tx) =>
        tx.query("delete from public.collected_posts where id = $1", [
          FIXTURE_POST,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses service_role a truncate", async () => {
    await expect(
      as("service_role", (tx) => tx.query("truncate public.collected_posts")),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it.each(["anon", "authenticated"] as const)(
    "refuses %s a select",
    async (role) => {
      await expect(
        as(role, (tx) => tx.query("select id from public.collected_posts")),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );
});
