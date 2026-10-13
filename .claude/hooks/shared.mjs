/**
 * What the agent hooks in this directory share: reading the hook input,
 * finding the checkout an edited file belongs to, remembering every checkout a
 * session touched, and running a tool from that checkout.
 *
 * A checkout is taken from the edited file, never from CLAUDE_PROJECT_DIR. That
 * variable names the directory the session started in and does not follow
 * EnterWorktree, and an agent working in a worktree under .claude/worktrees/
 * edits files neither it nor the hook's cwd names. Files of another repository
 * (~/.claude, other projects) are left alone.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Tools the hooks run, relative to the checkout they check. */
export const TOOLS = {
  eslint: "node_modules/eslint/bin/eslint.js",
  prettier: "node_modules/prettier/bin/prettier.cjs",
  tsc: "node_modules/typescript/bin/tsc",
  next: "node_modules/next/dist/bin/next",
  // The entry `npm test` uses: it fixes the drive-letter case before it loads
  // Vitest, and it needs no npm.cmd shim.
  test: "scripts/test.mts",
};

/** The files ESLint's flat config covers (eslint.config.mjs, via next). */
export const LINTED = /\.[cm]?[jt]sx?$/i;

/**
 * The hook input on stdin, or an empty object when it is not a JSON object:
 * input without a file names nothing to check.
 */
export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return input && typeof input === "object" ? input : {};
  } catch {
    return {};
  }
}

/** The session's working directory from the input, or this process's. */
export function sessionDir(input) {
  return typeof input.cwd === "string" && input.cwd !== ""
    ? input.cwd
    : process.cwd();
}

/** The absolute path of the file the tool call edited, or null. */
export function editedPath(input) {
  const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof path !== "string" || path === "") return null;
  return resolve(sessionDir(input), path);
}

/**
 * The checkout `file` belongs to, as `{ root, rel }` with `rel` in forward
 * slashes, or null when there is nothing to check: the file does not exist, or
 * it belongs to no repository or to another one than the session's.
 */
export function checkoutOf(file, dir) {
  if (!existsSync(file)) return null;
  const top = git(dirname(file), "rev-parse", "--show-toplevel");
  if (top === null) return null;
  const sessionRepo =
    commonDir(dir) ?? commonDir(process.env.CLAUDE_PROJECT_DIR);
  if (!samePath(commonDir(top), sessionRepo)) return null;
  // git prints the long, canonical spelling; the input may carry another (a
  // lowercase drive letter, an 8.3 short name), so both sides are resolved.
  const root = realpathSync.native(top);
  const rel = relative(root, realpathSync.native(file));
  if (rel === "" || rel.startsWith("..")) return null;
  return { root, rel: rel.split(sep).join("/") };
}

/** The top of the checkout `dir` lies in, or null outside a repository. */
export function checkoutAt(dir) {
  const top = git(dir, "rev-parse", "--show-toplevel");
  return top === null ? null : realpathSync.native(top);
}

/** Records `root` for the end-of-turn sweep of this session. */
export function registerCheckout(sessionId, root) {
  const file = registryFile(sessionId);
  if (file === null) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${root}\n`);
}

/** Every checkout this session's edits registered that still exists. */
export function registeredCheckouts(sessionId) {
  const file = registryFile(sessionId);
  if (file === null || !existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((root) => root !== "" && existsSync(root));
}

/** Forgets the registered checkouts once a sweep has found them clean. */
export function clearRegistry(sessionId) {
  const file = registryFile(sessionId);
  if (file !== null && existsSync(file)) writeFileSync(file, "");
}

/** Whether two paths name the same place; Windows paths ignore case. */
export function samePath(a, b) {
  if (a == null || b == null) return false;
  const [x, y] = [resolve(a), resolve(b)];
  return process.platform === "win32"
    ? x.toLowerCase() === y.toLowerCase()
    : x === y;
}

/**
 * Runs `node <args>` in `cwd` with plain output, so the text Claude reads
 * carries no escape codes. Resolves with whether it passed, how it ended, and
 * its stdout and stderr in the order they arrived.
 */
export function runNode(cwd, args) {
  return new Promise((settle) => {
    const chunks = [];
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
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
 * Runs one of TOOLS from `root`. A tool missing from a checkout that has
 * node_modules is a broken install, reported as a failure, never a pass.
 */
export function runTool(root, tool, args) {
  const script = join(root, TOOLS[tool]);
  if (!existsSync(script)) {
    return Promise.resolve({
      passed: false,
      outcome: `could not run: ${TOOLS[tool]} is missing`,
    });
  }
  return runNode(root, [script, ...args]);
}

/** The last `lines` lines of `text`. */
export function tail(text, lines) {
  return (text ?? "").trimEnd().split(/\r?\n/).slice(-lines).join("\n");
}

/** Shows `message` to Claude next to the tool result, without blocking. */
export function tellClaude(message) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: message,
      },
    })}\n`,
  );
}

/** Shows `message` to the user. */
export function tellUser(message) {
  process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
}

/**
 * `git -C dir …`'s output, or null when git refuses (not a repository). A git
 * that cannot start at all throws: a hook must not pass because it is blind.
 */
export function git(dir, ...args) {
  if (typeof dir !== "string" || dir === "") return null;
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`git could not run: ${result.error.message}`);
  return result.status === 0 ? result.stdout.trim() : null;
}

function commonDir(dir) {
  const common = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common === null ? null : realpathSync.native(common);
}

function registryFile(sessionId) {
  const id = String(sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return id === "" ? null : join(tmpdir(), "claude-hooks", `${id}.roots`);
}
