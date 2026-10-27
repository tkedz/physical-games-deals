/**
 * supabase/checks/matching.sql, the matching rule's truth table, run unchanged
 * against a database built from supabase/migrations/ by a non-superuser owner
 * under Supabase's default privileges.
 *
 * The file holds every expected value itself: the fold and key cases, the keys
 * service_role stores, A's and B's views (PRD US-01 AC1 among them: "Silent
 * Hill 2" pinned to PS5 shows only the PS5 deal, unpinned it also shows the
 * Xbox one), anon refused, the EXECUTE matrix, the phrase duplicates, and the
 * game page's deals_for_game, which shows anon what matched_deals shows for an
 * unpinned game entry. This test only reads its report, so a new case belongs
 * in the file, where the hosted SQL-editor run gains it too.
 */
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheckFile } from "./harness/check-file";
import {
  buildDatabase,
  REPOSITORY_ROOT,
  type Database,
} from "./harness/database";

const MATCHING = join(REPOSITORY_ROOT, "supabase", "checks", "matching.sql");

let db: Database;

beforeAll(async () => {
  db = await buildDatabase();
});

afterAll(async () => {
  await db?.close();
});

describe("supabase/checks/matching.sql", () => {
  it("passes every check against the migrations", async () => {
    const result = await runCheckFile(db, MATCHING);
    expect(
      result.passed,
      [`matching.sql: ${result.summary}`, ...result.failures].join("\n"),
    ).toBe(true);
  });
});
