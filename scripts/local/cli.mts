/**
 * Runs the Supabase CLI for the local stack wrappers, start.mts and reset.mts,
 * with its output held back. Its stderr — progress, notices and errors —
 * reaches the terminal line by line once screenLine in commands.mts has passed
 * the line. Its stdout, which carries every key on a start, is returned to the
 * caller and never printed here.
 *
 * The CLI is started as `node <the supabase package's bin script>`, not through
 * npx or node_modules/.bin, which on Windows are .cmd and .ps1 shims that need
 * a shell. That script starts the platform binary with inherited stdio, so the
 * binary writes straight into the pipes opened here. stdin is closed: no
 * command these wrappers run asks a question, and one that did would read an
 * end of input rather than wait on a prompt nobody sees.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name.
import { screenLine, takeLines, type CliRun } from "./commands.mts";

/** The repository root: the CLI finds supabase/config.toml from there. */
export const REPOSITORY_ROOT = fileURLToPath(
  new URL("../../", import.meta.url),
);

/** The supabase package's bin script, as its package.json names it. */
function cliEntry(): string {
  const manifest = createRequire(import.meta.url).resolve(
    "supabase/package.json",
  );
  const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const entry = typeof bin === "string" ? bin : bin?.supabase;
  if (!entry) {
    throw new Error(
      "node_modules/supabase/package.json names no supabase bin script",
    );
  }
  return join(dirname(manifest), entry);
}

/**
 * Runs `supabase <args>` from the repository root and resolves once it has
 * exited. stderr is printed as it arrives, screened; stdout is collected.
 */
export function runSupabase(args: readonly string[]): Promise<CliRun> {
  const entry = cliEntry();
  return new Promise((settle) => {
    let stdout = "";
    let pending = "";
    let withheld = 0;

    const show = (lines: string[]) => {
      for (const line of lines) {
        const shown = screenLine(line);
        if (shown === null) withheld += 1;
        else process.stderr.write(`${shown}\n`);
      }
    };

    const child = spawn(process.execPath, [entry, ...args], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const taken = takeLines(pending, chunk);
      pending = taken.rest;
      show(taken.lines);
    });
    child.on("error", (error) => {
      show([`Could not start the Supabase CLI: ${error.message}`]);
      settle({ exitCode: 1, stdout, withheld });
    });
    child.on("close", (code) => {
      if (pending !== "") show([pending]);
      pending = "";
      settle({ exitCode: code ?? 1, stdout, withheld });
    });
  });
}
