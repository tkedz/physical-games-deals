/**
 * Lints and format-checks the one file an agent just edited.
 *
 *   node .claude/hooks/lint-edited-file.mjs
 *
 * Claude Code starts it from .claude/settings.json after every Edit or Write
 * (PostToolUse) and passes the hook input as JSON on stdin. It runs ESLint with
 * --max-warnings 0 on a file the lint config covers, and Prettier's --check on
 * any file (--ignore-unknown and .prettierignore skip the rest), both from the
 * edited file's own checkout. It reports and never rewrites: a --fix or a
 * --write would change the file under the agent's next Edit. It also records
 * the checkout for the end-of-turn sweep.
 *
 * Exit 0 means the file is clean or there was nothing to check: no path, a
 * file that does not exist or belongs to another repository. Exit 2 means a
 * finding, or a check that could not run; stderr then carries the output,
 * which Claude reads. A checkout without node_modules (a fresh worktree) is
 * not checked, and Claude is told so instead.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  LINTED,
  checkoutOf,
  editedPath,
  readInput,
  registerCheckout,
  runTool,
  sessionDir,
  tail,
  tellClaude,
} from "./shared.mjs";

/** How many lines from the end of each tool's output a report carries. */
const TAIL_LINES = 60;

async function main() {
  const input = await readInput();
  const file = editedPath(input);
  if (file === null) return 0;
  const checkout = checkoutOf(file, sessionDir(input));
  if (checkout === null) return 0;
  const { root, rel } = checkout;
  registerCheckout(input.session_id, root);

  if (!existsSync(join(root, "node_modules"))) {
    tellClaude(
      `${rel} was not linted: ${root} has no node_modules. Run \`npm ci\` there to have its edits checked.`,
    );
    return 0;
  }

  const checks = [
    LINTED.test(rel) && {
      name: `ESLint (--max-warnings 0)`,
      run: runTool(root, "eslint", [
        "--max-warnings",
        "0",
        "--no-warn-ignored",
        rel,
      ]),
    },
    {
      name: `Prettier (fix with \`npx prettier --write ${rel}\`)`,
      run: runTool(root, "prettier", ["--check", "--ignore-unknown", rel]),
    },
  ].filter(Boolean);

  const report = [];
  for (const check of checks) {
    const result = await check.run;
    if (result.passed) continue;
    report.push(`${check.name} ${result.outcome} on ${rel}:`);
    if (result.output?.trim()) report.push(tail(result.output, TAIL_LINES));
    report.push("");
  }
  if (report.length === 0) return 0;
  process.stderr.write(`${report.join("\n").trimEnd()}\n`);
  return 2;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`lint-edited-file could not run: ${error.message}\n`);
  process.exitCode = 2;
}
