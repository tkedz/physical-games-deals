/**
 * supabase/checks/listed-expiry.sql, the expiry term of the listed predicate,
 * run unchanged against a database built from supabase/migrations/ by a
 * non-superuser owner under Supabase's default privileges.
 *
 * The file holds every expected value itself: PRD AC3 (a deal is hidden after
 * its stated end, one without an end stays) for anon and authenticated on
 * public.deals and for a signed-in user on public.matched_deals, the exact
 * boundary instant, a digital deal that a future end does not list, and the
 * view's security_invoker option. This test only reads its report, so a new
 * case belongs in the file, where the hosted SQL-editor run gains it too.
 */
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheckFile } from "./harness/check-file";
import {
  buildDatabase,
  REPOSITORY_ROOT,
  type Database,
} from "./harness/database";

const LISTED_EXPIRY = join(
  REPOSITORY_ROOT,
  "supabase",
  "checks",
  "listed-expiry.sql",
);

let db: Database;

beforeAll(async () => {
  db = await buildDatabase();
});

afterAll(async () => {
  await db?.close();
});

describe("supabase/checks/listed-expiry.sql", () => {
  it("passes every check against the migrations", async () => {
    const result = await runCheckFile(db, LISTED_EXPIRY);
    expect(
      result.passed,
      [`listed-expiry.sql: ${result.summary}`, ...result.failures].join("\n"),
    ).toBe(true);
  });
});
