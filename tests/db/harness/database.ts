/**
 * A disposable Postgres built from supabase/migrations/, for the db project.
 *
 * PGlite, pinned in package.json, behind the Supabase stub in tests/db/stub/.
 * The prelude runs as PGlite's superuser; then the session becomes migrator, a
 * non-superuser owner standing in for hosted postgres, so a missing grant fails
 * here as it fails hosted instead of being waved through. Each migration runs
 * under Supabase's default privileges of its own date: granted before
 * 20261030000000, revoked from the first version at or after it.
 *
 * Every call builds a fresh in-memory database, which takes 1–2 s and about
 * 400 MB, so a test file builds one in beforeAll and closes it in afterAll.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Results } from "@electric-sql/pglite";
import { amcheck } from "@electric-sql/pglite/contrib/amcheck";

/** fileURLToPath rather than .pathname, which yields "/C:/…" on Windows. */
export const REPOSITORY_ROOT = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const MIGRATIONS = join(REPOSITORY_ROOT, "supabase", "migrations");
const STUB = join(REPOSITORY_ROOT, "tests", "db", "stub");

/** The role migrations, seeds and check files run as. The prelude creates it. */
export const OWNER = "migrator";

/** The first version Supabase no longer grants new public objects to the API roles. */
export const DEFAULT_PRIVILEGES_END = "20261030000000";

/**
 * Undoes exactly the grants of default-privileges.sql. The build checks that
 * nothing is left in pg_default_acl afterwards, so a grant added to that file
 * without its revoke here fails the build instead of leaking past the date.
 */
const REVOKE_DEFAULT_PRIVILEGES = `
alter default privileges for role ${OWNER} in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role ${OWNER} in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role ${OWNER} in schema public
  revoke all on functions from anon, authenticated, service_role;
`;

/** A migration as supabase/migrations/ names it: `<14-digit version>_<name>.sql`. */
export type Migration = { name: string; sql: string };

export type Database = {
  /** The connection. Its session runs as OWNER. */
  pg: PGlite;
  /**
   * Runs one statement as PGlite's superuser, for what only a superuser may
   * call (amcheck), and returns the session to OWNER afterwards, also when the
   * statement fails. Call it outside a transaction.
   */
  asSuperuser<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<Results<T>>;
  close(): Promise<void>;
};

export type BuildOptions = {
  /**
   * Runs as OWNER immediately before the migration with this version, against
   * the schema as it stands at that point. The build throws if no migration
   * has the version, so a renamed file cannot silently skip the seed.
   */
  seed?: { beforeVersion: string; run: (db: Database) => Promise<void> };
  /**
   * Applied after the repository's chain, in order, under the same date rule.
   * Each must sort after the one before it.
   */
  extraMigrations?: readonly Migration[];
};

/** "<SQLSTATE> <message>" of a database error, as a failure report names it. */
export function describeError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return `${typeof code === "string" ? code : "(no SQLSTATE)"} ${message}`;
}

function versionOf(name: string): string {
  const match = /^(\d{14})_[^/\\]+\.sql$/.exec(name);
  if (!match) {
    throw new Error(
      `${name}: a migration is named <14-digit version>_<name>.sql`,
    );
  }
  return match[1];
}

function repositoryMigrations(): Migration[] {
  // The default sort compares code units, so it does not depend on a locale;
  // with a 14-digit version in front, filename order is date order.
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS, name), "utf8"),
    }));
}

/** Builds a fresh database and applies the migration chain to it. */
export async function buildDatabase(
  options: BuildOptions = {},
): Promise<Database> {
  const chain = [...repositoryMigrations(), ...(options.extraMigrations ?? [])];
  const versions = chain.map((migration) => versionOf(migration.name));
  versions.forEach((version, index) => {
    if (index > 0 && version <= versions[index - 1]) {
      throw new Error(
        `${chain[index].name} must sort after ${chain[index - 1].name}`,
      );
    }
  });
  const { seed } = options;
  if (seed && !versions.includes(seed.beforeVersion)) {
    throw new Error(
      `The seed checkpoint ${seed.beforeVersion} names no migration in supabase/migrations/ or among the extra ones`,
    );
  }

  const pg = await PGlite.create({ extensions: { amcheck } });
  // PGlite's single-user backend gives RESET SESSION AUTHORIZATION nothing to
  // return to, so the way back is by name: the user the session started as.
  const started = await pg.query<{ name: string; superuser: boolean }>(
    "select session_user as name, rolsuper as superuser from pg_roles where rolname = session_user",
  );
  const superuserName = started.rows[0]?.name;
  if (!superuserName || !started.rows[0].superuser) {
    await pg.close();
    throw new Error("PGlite did not start as a superuser");
  }
  const asSuperuserAgain = `set session authorization "${superuserName.replaceAll('"', '""')}"`;

  async function superuser<R>(work: () => Promise<R>): Promise<R> {
    await pg.exec(asSuperuserAgain);
    try {
      return await work();
    } finally {
      await pg.exec(`set session authorization ${OWNER}`);
    }
  }

  const db: Database = {
    pg,
    asSuperuser: (sql, params) => superuser(() => pg.query(sql, params)),
    close: () => pg.close(),
  };

  try {
    await pg.exec(readFileSync(join(STUB, "supabase-prelude.sql"), "utf8"));
    // In a schema of its own, as Supabase installs extensions, so that
    // nothing of it lands in public, where the migrations and checks look.
    await pg.exec(
      "create schema extensions; create extension amcheck with schema extensions;",
    );
    await pg.exec(`set session authorization ${OWNER}`);

    const grantDefaultPrivileges = readFileSync(
      join(STUB, "default-privileges.sql"),
      "utf8",
    );
    let granted = false;
    for (const [index, migration] of chain.entries()) {
      const version = versions[index];
      const wanted = version < DEFAULT_PRIVILEGES_END;
      if (wanted !== granted) {
        await superuser(() =>
          pg.exec(wanted ? grantDefaultPrivileges : REVOKE_DEFAULT_PRIVILEGES),
        );
        granted = wanted;
        if (!granted) {
          const left = await pg.query<{ kind: string }>(
            "select defaclobjtype::text as kind from pg_default_acl where defaclrole = $1::regrole",
            [OWNER],
          );
          if (left.rows.length > 0) {
            throw new Error(
              `Default privileges left for ${OWNER} after the revoke before ${migration.name} (kinds: ${left.rows.map((row) => row.kind).join(", ")}); REVOKE_DEFAULT_PRIVILEGES must undo default-privileges.sql`,
            );
          }
        }
      }
      if (seed?.beforeVersion === version) {
        await seed.run(db);
      }
      try {
        await pg.exec(migration.sql);
      } catch (error) {
        throw new Error(`${migration.name} failed: ${describeError(error)}`, {
          cause: error,
        });
      }
    }
    return db;
  } catch (error) {
    await pg.close();
    throw error;
  }
}
