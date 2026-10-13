/**
 * The harness's own guarantees, which every database test leans on. The stub
 * is honest only while the migrations run as an owner that is not a superuser,
 * under Supabase's default privileges of their own date, so a missing grant
 * fails here as it fails hosted. A seed must meet the schema of its checkpoint,
 * and a check file that breaks before its report must fail loudly rather than
 * read as a pass.
 *
 * The expected privileges come from the date rule CLAUDE.md states (Database
 * migrations): new public tables are granted to anon, authenticated and
 * service_role until 2026-10-30, and to none of them after it.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheckFile } from "./harness/check-file";
import { buildDatabase, OWNER, type Database } from "./harness/database";

const API_ROLES = ["anon", "authenticated", "service_role"];

/** The first matching migration, where rollout Phase 4 seeds its rows. */
const CHECKPOINT = "20261012070050";

type SeenAtCheckpoint = {
  role: string;
  watchlist: string | null;
  matched: string | null;
};

let db: Database;
let seen: SeenAtCheckpoint;
let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "check-file-"));
  db = await buildDatabase({
    seed: {
      beforeVersion: CHECKPOINT,
      run: async (at) => {
        const { rows } = await at.pg.query<SeenAtCheckpoint>(
          `select current_user as role,
             to_regclass('public.watchlist_entries')::text as watchlist,
             to_regclass('public.matched_deals')::text as matched`,
        );
        seen = rows[0];
      },
    },
    extraMigrations: [
      {
        name: "20261029000000_synthetic_before_the_change.sql",
        sql: "create table public.synthetic_before (id integer);",
      },
      {
        name: "20261031000000_synthetic_after_the_change.sql",
        sql: "create table public.synthetic_after (id integer);",
      },
    ],
  });
});

afterAll(async () => {
  await db?.close();
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

/** Which of the API roles hold any privilege on the table. */
async function holders(table: string): Promise<string[]> {
  const { rows } = await db.pg.query<{ role: string }>(
    `select r.role from unnest($1::text[]) as r(role)
     where has_table_privilege(r.role, $2,
       'select, insert, update, delete, truncate, references, trigger')
     order by r.role`,
    [API_ROLES, table],
  );
  return rows.map((row) => row.role);
}

async function currentUser(): Promise<string> {
  const { rows } = await db.pg.query<{ role: string }>(
    "select current_user as role",
  );
  return rows[0].role;
}

/** Writes a check file into the scratch directory and returns its path. */
async function checkFile(name: string, sql: string): Promise<string> {
  const path = join(scratch, name);
  await writeFile(path, sql, "utf8");
  return path;
}

describe("the owner the migrations run as", () => {
  it("is migrator, and not a superuser", async () => {
    const { rows } = await db.pg.query<{
      role: string;
      session: string;
      superuser: string;
      rolsuper: boolean;
    }>(
      `select current_user as role, session_user as session,
         current_setting('is_superuser') as superuser,
         (select rolsuper from pg_roles where rolname = current_user) as rolsuper`,
    );
    expect(rows[0]).toEqual({
      role: OWNER,
      session: OWNER,
      superuser: "off",
      rolsuper: false,
    });
  });

  it("returns from a superuser statement, also when it fails", async () => {
    const { rows } = await db.asSuperuser<{ superuser: string }>(
      "select current_setting('is_superuser') as superuser",
    );
    expect(rows[0].superuser).toBe("on");
    expect(await currentUser()).toBe(OWNER);

    await expect(db.asSuperuser("select 1 / 0")).rejects.toThrow();
    expect(await currentUser()).toBe(OWNER);
  });

  it("leaves amcheck to the superuser", async () => {
    const check =
      "select extensions.bt_index_check('public.deals_pkey'::regclass, true)";
    await expect(db.asSuperuser(check)).resolves.toBeDefined();
    await expect(db.pg.query(check)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Supabase's default privileges, by migration date", () => {
  it("grant a table created before 2026-10-30 to the three API roles", async () => {
    expect(await holders("public.synthetic_before")).toEqual(API_ROLES);
  });

  it("grant a table created after 2026-10-30 to none of them", async () => {
    expect(await holders("public.synthetic_after")).toEqual([]);
  });
});

describe("the seed checkpoint", () => {
  it("runs as the owner against the schema just before its migration", () => {
    expect(seen).toEqual({
      role: OWNER,
      watchlist: "watchlist_entries",
      matched: null,
    });
  });

  it("refuses a version that names no migration", async () => {
    await expect(
      buildDatabase({
        seed: { beforeVersion: "20990101000000", run: async () => {} },
      }),
    ).rejects.toThrow(/20990101000000 names no migration/);
  });
});

describe("a migration that fails", () => {
  it("is named, with its SQLSTATE", async () => {
    // Hosted postgres may not create in the auth schema, and neither may
    // migrator, so this fails with 42501 as it would at db:push.
    await expect(
      buildDatabase({
        extraMigrations: [
          {
            name: "20261101000000_synthetic_creates_in_auth.sql",
            sql: "create table auth.synthetic (id integer);",
          },
        ],
      }),
    ).rejects.toThrow(
      /20261101000000_synthetic_creates_in_auth\.sql failed: 42501 /,
    );
  });
});

describe("runCheckFile", () => {
  it("reads a report with a failure as not passed", async () => {
    const path = await checkFile(
      "failing-check.sql",
      `do $check$
       begin
         raise exception '%', E'Rolled back on purpose. 1 check(s) failed.\\nok   one\\nFAIL two';
       end;
       $check$;`,
    );
    expect(await runCheckFile(db, path)).toEqual({
      passed: false,
      summary: "1 check(s) failed.",
      failures: ["FAIL two"],
      lines: ["ok   one", "FAIL two"],
    });
  });

  it("rethrows an error raised before the report, naming the file", async () => {
    const path = await checkFile(
      "broken-check.sql",
      `do $check$
       begin
         perform 1 / 0;
         raise exception 'Rolled back on purpose. All checks passed.';
       end;
       $check$;`,
    );
    await expect(runCheckFile(db, path)).rejects.toThrow(
      /^broken-check\.sql: 22012 /,
    );
  });

  it("refuses a file that finishes without its report", async () => {
    const path = await checkFile("silent-check.sql", "select 1;");
    await expect(runCheckFile(db, path)).rejects.toThrow(
      /^silent-check\.sql: finished without its report/,
    );
  });
});
