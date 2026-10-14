/**
 * Starts `next dev` against the hosted Supabase project.
 *
 *   npm run dev:hosted
 *   npm run dev:hosted -- -p 3100
 *
 * npm starts this script as `node --env-file=.env.hosted.local …`, so the
 * hosted values, SUPABASE_TARGET=hosted among them, are already in this
 * process's environment, and a missing file stops it before anything runs.
 * Next cannot run in this process under that flag: `next dev` forks its
 * server and hands this process's node flags to the fork through NODE_OPTIONS
 * (getParsedNodeOptions in node_modules/next/dist/server/lib/utils.js), where
 * Node refuses --env-file. So Next starts here as a fresh node process with no
 * flags, which inherits the environment, and its exit code is passed through.
 * The guard in next.config.ts then checks the hosted pair.
 *
 * npm runs it from the repository root, so node_modules/ is found there. The
 * arguments after the script name reach `next dev` unchanged.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const next = spawn(
  process.execPath,
  [
    join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
    "dev",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

// Ctrl+C reaches Next as well, from the terminal, and Next shuts its server
// down. This process waits for that instead of exiting first.
process.on("SIGINT", () => {});

next.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
