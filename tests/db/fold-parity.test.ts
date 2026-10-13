/**
 * foldForMatching (src/lib/watchlist/rules.ts) against public.fold_for_matching,
 * over one corpus (fixtures/fold-corpus.ts). The phrase pre-check predicts the
 * folded unique index with the TypeScript twin, so where the twins disagree,
 * "Obserwuj frazę" is disabled for a phrase the database would accept, or
 * enabled for one it refuses (CLAUDE.md, Deal matching: the two must stay
 * identical).
 *
 * This asserts agreement only. Two folds that share a defect agree, as both
 * twins did over review F5's NFD input, so what an input should fold to is
 * asserted in tests/unit/watchlist/fold.test.ts and
 * supabase/checks/matching.sql, never here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldForMatching } from "@/lib/watchlist/rules";
import { FOLD_CORPUS } from "./fixtures/fold-corpus";
import { buildDatabase, type Database } from "./harness/database";

/**
 * The generated probes alone come to 8,668, so a corpus below this floor has
 * lost a block of them, and an empty one cannot pass.
 */
const CORPUS_FLOOR = 8_000;

/** How many disagreements a failure lists. */
const LISTED = 20;

let db: Database;

beforeAll(async () => {
  db = await buildDatabase();
});

afterAll(async () => {
  await db?.close();
});

/** An input as its code points, so that invisible and combining ones show. */
function spelled(value: string): string {
  return Array.from(
    value,
    (character) =>
      `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
  ).join(" ");
}

describe("fold parity: foldForMatching and public.fold_for_matching agree", () => {
  it("returns the same text for every input of the corpus (agreement only, not correctness)", async () => {
    expect(FOLD_CORPUS.length).toBeGreaterThan(CORPUS_FLOOR);

    const { rows } = await db.pg.query<{ folded: string }>(
      `select public.fold_for_matching(t.value) as folded
       from unnest($1::text[]) with ordinality as t(value, position)
       order by t.position`,
      [FOLD_CORPUS],
    );
    expect(rows.length).toBe(FOLD_CORPUS.length);

    const disagreements = FOLD_CORPUS.flatMap((value, index) => {
      const sql = rows[index].folded;
      const ts = foldForMatching(value);
      return ts === sql ? [] : [{ value, ts, sql }];
    });

    const report = [
      `${disagreements.length} of ${FOLD_CORPUS.length} inputs fold differently (agreement only: which twin is right is asserted elsewhere)`,
      ...disagreements
        .slice(0, LISTED)
        .map(
          ({ value, ts, sql }) =>
            `  ${spelled(value)}: TS ${JSON.stringify(ts)}, SQL ${JSON.stringify(sql)}`,
        ),
    ].join("\n");
    expect(disagreements.length, report).toBe(0);
  });
});
