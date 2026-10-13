/**
 * Runs the Vitest project an agent's edit can break, right after the edit.
 *
 *   node .claude/hooks/post-edit-tests.mjs unit
 *   node .claude/hooks/post-edit-tests.mjs db
 *
 * Claude Code starts both handlers from .claude/settings.json after every Edit
 * or Write (PostToolUse) and passes the hook input as JSON on stdin. Each
 * handler reads `tool_input.file_path` and runs its project only when the path
 * falls under one of the prefixes in SUITE_PATHS; input that is not JSON or
 * names no path, a path outside the project and any other path exit 0 without
 * starting Vitest. The
 * unit handler runs synchronously. The db handler runs in the background
 * (`asyncRewake`), because PGlite makes the db project take about 16 s, and a
 * db edit made during a db run asks for one rerun instead of starting a second
 * PGlite build next to it.
 *
 * Exit 0 means the project passed or there was nothing to run. Exit 2 means it
 * failed or could not run; stderr then carries the end of Vitest's output,
 * which Claude reads. Exit 1 means the hook itself is misconfigured, which
 * Claude Code shows the user as a hook error. The hook is local only and is
 * not a gate: CI runs `npm test` on its own.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Path prefixes, relative to the project root, that each project covers. */
const SUITE_PATHS = {
  unit: [
    "scripts/extract/",
    "src/lib/deals/",
    "src/lib/watchlist/",
    "tests/unit/",
  ],
  db: [
    "supabase/migrations/",
    "supabase/checks/",
    "src/lib/watchlist/",
    "tests/db/",
  ],
};

/**
 * The files that shape what the extractor sends to the model. An edit to one
 * of them gets the eval reminder from the unit handler, whatever the tests say.
 */
const EVAL_INPUTS = [
  "scripts/extract/prompt.mts",
  "scripts/extract/schema.mts",
  "scripts/extract/config.mts",
  "scripts/extract/openrouter.mts",
];

/** How many lines from the end of Vitest's output a failure report carries. */
const TAIL_LINES = 80;

/**
 * How long a db lock without an owner pid in it still counts as held. The
 * owner writes its pid just after mkdirSync, so a younger lock is still being
 * created, and an older one was left by a process that died in between.
 */
const OWNERLESS_LOCK_MS = 10_000;

async function main() {
  const suite = process.argv[2];
  if (!Object.hasOwn(SUITE_PATHS, suite)) {
    return fail(
      1,
      `post-edit-tests: expected "unit" or "db" as the argument, got ${JSON.stringify(suite)}.`,
    );
  }

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // Input that is not JSON names no file, so there is nothing to check.
    return 0;
  }

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath === "") return 0;

  const cwd =
    typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : undefined;
  const root = process.env.CLAUDE_PROJECT_DIR || cwd;
  if (!root) {
    return fail(
      1,
      "post-edit-tests: neither CLAUDE_PROJECT_DIR nor the hook input's cwd names the project root.",
    );
  }

  const edited = projectPath(root, resolve(cwd ?? root, filePath));
  if (edited === null) return 0;
  // Windows paths name the same file whatever their case.
  const key = process.platform === "win32" ? edited.toLowerCase() : edited;
  if (!SUITE_PATHS[suite].some((prefix) => key.startsWith(prefix))) return 0;

  const reminder =
    suite === "unit" && EVAL_INPUTS.includes(key)
      ? `${edited} changes what the extractor sends to the model, so this change needs \`npm run extract:eval\` and a new scripts/extract/eval/result.json committed with it.`
      : null;

  let run;
  try {
    run =
      suite === "db"
        ? await runDbSingleFlight(root)
        : await runSuite(root, suite);
  } catch (error) {
    run = { passed: false, outcome: `could not run: ${error.message}` };
  }

  // Another db run holds the lock, and its rerun covers this edit.
  if (run === null) return 0;

  if (run.passed) {
    if (reminder) {
      process.stdout.write(
        `${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: reminder,
          },
        })}\n`,
      );
    }
    return 0;
  }

  const report = [
    `Post-edit check after the edit to ${edited}: \`npm test -- --project ${suite}\` ${run.outcome}.`,
  ];
  if (run.output?.trim()) {
    report.push("The end of its output:", "", tail(run.output));
  }
  if (reminder) report.push("", reminder);
  return fail(2, report.join("\n"));
}

/** Writes `message` to stderr and returns `code`, the exit code to set. */
function fail(code, message) {
  process.stderr.write(`${message}\n`);
  return code;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * `file` relative to `root`, with forward slashes, or null when it lies outside
 * the project. On Windows path.relative compares the two case-insensitively,
 * so a `c:\…` path and a `C:\…` root agree, and it returns a path on another
 * drive unchanged, as an absolute path.
 */
function projectPath(root, file) {
  const path = relative(root, file);
  if (path === "" || isAbsolute(path) || path.split(sep)[0] === "..") {
    return null;
  }
  return path.split(sep).join("/");
}

/** The last TAIL_LINES lines of `output`. */
function tail(output) {
  return output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join("\n");
}

/**
 * Runs one Vitest project through scripts/test.mts, the entry `npm test` uses,
 * so the drive-letter fix there applies and no `npm.cmd` shim is involved.
 * Resolves with whether it passed, how it ended, and its stdout and stderr in
 * the order they arrived.
 */
function runSuite(root, suite) {
  return new Promise((settle) => {
    const chunks = [];
    const child = spawn(
      process.execPath,
      ["scripts/test.mts", "run", "--project", suite],
      {
        cwd: root,
        // Plain text, so the tail Claude reads carries no escape codes.
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) =>
      settle({ passed: false, outcome: `could not start: ${error.message}` }),
    );
    child.on("close", (code, signal) =>
      settle({
        passed: code === 0,
        outcome: signal
          ? `was killed by ${signal}`
          : `failed with exit code ${code}`,
        output: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
}

/**
 * Runs the db project unless another invocation is running it already, so a
 * burst of edits never builds PGlite twice in parallel. Resolves with the final
 * run, or with null when the run of the invocation holding the lock covers
 * this edit and reports for it.
 *
 * The lock is a directory under os.tmpdir(), named from the canonical project
 * root, with its owner's pid inside; mkdirSync either creates it or fails, so
 * one invocation holds it at a time. An invocation that finds it held writes a
 * rerun marker beside it and exits. The holder clears the marker before each
 * run, runs again while a new one has appeared, and reports only the last run.
 */
async function runDbSingleFlight(root) {
  const id = createHash("sha256")
    .update(realpathSync.native(root))
    .digest("hex")
    .slice(0, 16);
  const lock = join(tmpdir(), `post-edit-tests-db-${id}`);
  const rerun = `${lock}.rerun`;

  let run = null;
  for (;;) {
    if (!acquireLock(lock)) {
      // This invocation has run already and found a marker after releasing
      // the lock, but someone else holds it now: that holder clears the marker
      // and runs after it, or finds it once its run ends.
      if (run !== null) return null;
      writeFileSync(rerun, "");
      // The holder may have released the lock after mkdirSync failed here and
      // before the marker landed, and would then never see it.
      if (heldByLiveOwner(lock)) return null;
      continue;
    }
    try {
      do {
        rmSync(rerun, { force: true });
        run = await runSuite(root, "db");
      } while (existsSync(rerun));
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
    // A marker can land between the last check and the release.
    if (!existsSync(rerun)) return run;
  }
}

/**
 * Takes the lock, or returns false when a running process holds it. A lock
 * whose owner has exited is removed and created anew; of two invocations that
 * take over the same leftover at once, the second mkdirSync admits one.
 */
function acquireLock(lock) {
  if (createLock(lock)) return true;
  if (heldByLiveOwner(lock)) return false;
  rmSync(lock, { recursive: true, force: true });
  return createLock(lock);
}

function createLock(lock) {
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  writeFileSync(join(lock, "pid"), String(process.pid));
  return true;
}

/** Whether the lock belongs to a process that is still running. */
function heldByLiveOwner(lock) {
  let pid = NaN;
  try {
    pid = Number(readFileSync(join(lock, "pid"), "utf8"));
  } catch {
    // No pid file yet, or no lock any more: the age check below decides.
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    try {
      return Date.now() - statSync(lock).mtimeMs < OWNERLESS_LOCK_MS;
    } catch {
      return false;
    }
  }
  try {
    // Signal 0 only checks that the process exists; it works on Windows too.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, under another user. ESRCH: it has exited.
    return error.code === "EPERM";
  }
}

process.exitCode = await main();
