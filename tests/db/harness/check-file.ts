/**
 * Runs a check file in a database from buildDatabase and reads its report.
 *
 * The convention is supabase/checks/matching.sql's: one DO block that records
 * every check and always ends in an exception raised on purpose, which rolls
 * every fixture back and whose message is the report — "Rolled back on
 * purpose. All checks passed." or "… N check(s) failed.", then one line per
 * check ("ok …", "FAIL …" or "note: …"). The file runs unchanged, as the
 * hosted SQL editor runs it, so it keeps working there.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describeError, OWNER, type Database } from "./database";

const REPORT = "Rolled back on purpose.";
const ALL_PASSED = "All checks passed.";

export type CheckFileResult = {
  /** The summary is "All checks passed.", no line is a FAIL, and some line is an ok. */
  passed: boolean;
  /** The first line of the report without "Rolled back on purpose. ". */
  summary: string;
  /** Every line that starts with "FAIL". */
  failures: string[];
  /** Every line after the summary: ok, FAIL and note lines. */
  lines: string[];
};

export async function runCheckFile(
  db: Database,
  path: string,
): Promise<CheckFileResult> {
  const name = basename(path);
  const sql = readFileSync(path, "utf8");

  const { rows } = await db.pg.query<{ role: string }>(
    "select current_user as role",
  );
  if (rows[0]?.role !== OWNER) {
    throw new Error(`${name}: runs as ${OWNER}, not as ${rows[0]?.role}`);
  }

  try {
    await db.pg.exec(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith(REPORT)) {
      throw new Error(`${name}: ${describeError(error)}`, { cause: error });
    }
    const [first, ...lines] = message.split("\n");
    const summary = first.slice(REPORT.length).trim();
    const failures = lines.filter((line) => line.startsWith("FAIL"));
    return {
      passed:
        summary === ALL_PASSED &&
        failures.length === 0 &&
        lines.some((line) => line.startsWith("ok")),
      summary,
      failures,
      lines,
    };
  }
  throw new Error(
    `${name}: finished without its report; a check file ends in the exception that carries it`,
  );
}
