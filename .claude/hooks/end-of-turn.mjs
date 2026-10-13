/**
 * Sweeps what a turn changed before the agent finishes.
 *
 *   node .claude/hooks/end-of-turn.mjs
 *
 * Claude Code starts it from .claude/settings.json when the agent stops (Stop)
 * and passes the hook input as JSON on stdin. For the session's checkout and
 * every checkout the session's edits registered (a worktree included), it
 * takes the changed and untracked files and runs, side by side:
 *   - ESLint with --max-warnings 0 on the changed files it covers;
 *   - Prettier's --check on the changed files;
 *   - the whole test suite (`npm test`'s entry; about 7 s);
 *   - the whole-project typecheck, after `next typegen` when the route types
 *     it imports have not been generated yet.
 * This also catches files rewritten through a shell command, which no
 * per-edit hook sees. A checkout whose changes are all Markdown is skipped.
 *
 * Exit 2 sends every finding to Claude as the reason to keep working. When
 * Claude is already continuing because of this hook (`stop_hook_active`), it
 * exits 0, so the agent gets one chance to fix and is then let finish. A
 * checkout without node_modules is not checked, and the user is told so.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LINTED,
  checkoutAt,
  clearRegistry,
  git,
  registeredCheckouts,
  runTool,
  samePath,
  sessionDir,
  readInput,
  tail,
  tellUser,
} from "./shared.mjs";

/** How many lines from the end of each tool's output a report carries. */
const TAIL_LINES = 60;

async function main() {
  const input = await readInput();
  if (input.stop_hook_active === true) return 0;

  const dir = sessionDir(input);
  const roots = [];
  for (const root of [checkoutAt(dir), ...registeredCheckouts(input.session_id)]) {
    if (root !== null && !roots.some((known) => samePath(known, root))) {
      roots.push(root);
    }
  }
  if (roots.length === 0) {
    tellUser(`end-of-turn: ${dir} is not in a git checkout, nothing checked.`);
    return 0;
  }

  const report = [];
  const skipped = [];
  for (const root of roots) {
    const changed = changedFiles(root);
    if (changed.every((file) => /\.md$/i.test(file))) continue;
    if (!existsSync(join(root, "node_modules"))) {
      skipped.push(`${root} has no node_modules (run \`npm ci\` there)`);
      continue;
    }
    for (const finding of await sweep(root, changed)) report.push(finding);
  }

  if (report.length > 0) {
    if (skipped.length > 0) report.push(`Not checked: ${skipped.join("; ")}.`);
    process.stderr.write(
      `Fix these before you finish:\n\n${report.join("\n\n")}\n`,
    );
    return 2;
  }
  clearRegistry(input.session_id);
  if (skipped.length > 0) {
    tellUser(`end-of-turn passed, but did not check: ${skipped.join("; ")}.`);
  }
  return 0;
}

/** Runs every check on one checkout; resolves with a report per failure. */
async function sweep(root, changed) {
  const linted = changed.filter((file) => LINTED.test(file));
  const checks = [
    linted.length > 0 && {
      name: "ESLint (--max-warnings 0) on the changed files",
      run: runTool(root, "eslint", [
        "--max-warnings",
        "0",
        "--no-warn-ignored",
        ...linted,
      ]),
    },
    {
      name: "Prettier on the changed files (fix with `npx prettier --write <file>`)",
      run: runTool(root, "prettier", ["--check", "--ignore-unknown", ...changed]),
    },
    {
      name: "The test suite (`npm test`)",
      run: runTool(root, "test", ["run"]),
    },
    existsSync(join(root, "tsconfig.json")) && {
      name: "The typecheck (`tsc --noEmit`)",
      run: typecheck(root),
    },
  ].filter(Boolean);

  const findings = [];
  for (const check of checks) {
    const result = await check.run;
    if (result.passed) continue;
    const lines = [`${check.name} ${result.outcome} in ${root}:`];
    if (result.output?.trim()) lines.push(tail(result.output, TAIL_LINES));
    findings.push(lines.join("\n"));
  }
  return findings;
}

/**
 * The whole-project typecheck. next-env.d.ts imports the route types under
 * .next/types/, which only `next dev`, `next build` or `next typegen` write, so
 * a fresh checkout generates them first.
 */
async function typecheck(root) {
  if (
    existsSync(join(root, "next-env.d.ts")) &&
    !existsSync(join(root, ".next", "types", "routes.d.ts"))
  ) {
    const typegen = await runTool(root, "next", ["typegen"]);
    if (!typegen.passed) {
      return { ...typegen, outcome: `could not generate route types: \`next typegen\` ${typegen.outcome}` };
    }
  }
  return runTool(root, "tsc", ["--noEmit", "--pretty", "false"]);
}

/**
 * The checkout's changed and untracked files that still exist, relative to it
 * with forward slashes. NUL-separated, so git quotes no name.
 */
function changedFiles(root) {
  const listed = [
    git(root, "diff", "--name-only", "-z", "HEAD") ??
      // No commit yet: every tracked file counts as changed.
      git(root, "ls-files", "-z") ??
      "",
    git(root, "ls-files", "--others", "--exclude-standard", "-z") ?? "",
  ].join("\0");
  const files = new Set(listed.split("\0").filter(Boolean));
  return [...files].filter((file) => {
    const path = join(root, file);
    // A nested repository is listed as a directory; it is not a file to lint.
    return existsSync(path) && statSync(path).isFile();
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`end-of-turn could not run: ${error.message}\n`);
  process.exitCode = 2;
}
