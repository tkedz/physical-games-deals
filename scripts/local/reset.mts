/**
 * Resets the local database: the migrations, then supabase/snapshot.sql when
 * it exists, then supabase/seed.sql.
 *
 *   npm run local:reset
 *
 * It wipes every local row, the local accounts in auth.users included, and
 * never touches the hosted project: every argument list resetArgs in
 * commands.mts builds carries `--local`, and none carries `--linked` or
 * `--db-url` (tests/unit/local/commands.test.ts). The snapshot is production
 * data the owner dumps by hand; the seed is the committed fixture data,
 * written to apply on top of it. The CLI's progress shows line by line,
 * screened, and its stdout is printed only on a failure, screened too. The exit
 * code is the CLI's.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { REPOSITORY_ROOT, runSupabase } from "./cli.mts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  abortReport,
  failureReport,
  resetArgs,
  resetReport,
  SNAPSHOT_FILE,
  withheldNote,
} from "./commands.mts";

async function main(): Promise<void> {
  const snapshotExists = existsSync(join(REPOSITORY_ROOT, SNAPSHOT_FILE));
  const args = resetArgs(snapshotExists);
  const run = await runSupabase(args);
  if (run.exitCode === 0) {
    for (const line of [
      ...resetReport(snapshotExists),
      ...withheldNote(run.withheld),
    ]) {
      console.log(line);
    }
  } else {
    for (const line of failureReport(args, run)) console.error(line);
  }
  process.exitCode = run.exitCode;
}

main().catch((error: unknown) => {
  console.error(abortReport("local:reset", error));
  process.exitCode = 1;
});
