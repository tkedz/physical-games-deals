/**
 * Starts the local Supabase stack, or confirms it is already running, without
 * printing a key.
 *
 *   npm run local:start
 *
 * npm also runs it as predev, before every `npm run dev`. It runs
 * `supabase start` with the services the app never uses left out (START_ARGS
 * in commands.mts). The CLI's progress shows line by line, screened. On
 * success it prints the API and Studio URLs and nothing else of the CLI's
 * stdout, which holds the publishable and secret keys, the legacy JWTs, the
 * JWT secret and the database URL. On a failure it prints the CLI's stdout
 * screened as well, and the exit code is the CLI's either way.
 */
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { runSupabase } from "./cli.mts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  abortReport,
  failureReport,
  findStackUrls,
  START_ARGS,
  startedReport,
  withheldNote,
} from "./commands.mts";

async function main(): Promise<void> {
  const run = await runSupabase(START_ARGS);
  if (run.exitCode === 0) {
    for (const line of [
      ...startedReport(findStackUrls(run.stdout)),
      ...withheldNote(run.withheld),
    ]) {
      console.log(line);
    }
  } else {
    for (const line of failureReport(START_ARGS, run)) console.error(line);
  }
  process.exitCode = run.exitCode;
}

main().catch((error: unknown) => {
  console.error(abortReport("local:start", error));
  process.exitCode = 1;
});
