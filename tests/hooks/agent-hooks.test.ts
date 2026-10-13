/**
 * The agent hooks in .claude/hooks/, run the way Claude Code runs them: hook
 * input piped into the real scripts, exit code and output channel asserted.
 * For PostToolUse and Stop, exit 2 with stderr is what reaches Claude; JSON on
 * stdout carries `additionalContext` (Claude) or `systemMessage` (the user);
 * anything else on exit 0 is seen by no one (Claude Code hooks reference,
 * checked: 2026-10-13).
 *
 * Every case works in throwaway git repositories under the system temp
 * directory, never in this checkout. The scripts and git are real; only the
 * tools the scripts start are stubs, each failing on a marker string in a file:
 * ESLint on LINT-ERROR, Prettier on FORMAT-ERROR, tsc on TYPE-ERROR and the
 * test entry on TEST-FAIL under tests/. `next typegen` writes the route types.
 * Each stub logs its name, working directory and arguments, so a case can
 * assert what ran where.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const HOOKS = join(REPOSITORY, ".claude", "hooks");

const LOG_STUB = String.raw`
const fs = require("node:fs");
fs.appendFileSync(
  process.env.HOOK_STUB_LOG,
  JSON.stringify({ tool: TOOL, cwd: process.cwd(), args: process.argv.slice(2) }) + "\n",
);
`;

const STUBS: Record<string, string> = {
  "node_modules/eslint/bin/eslint.js": String.raw`const TOOL = "eslint";
${LOG_STUB}
const files = process.argv.slice(2).filter((a) => !a.startsWith("--") && fs.existsSync(a));
let failed = false;
for (const file of files) {
  if (fs.readFileSync(file, "utf8").includes("LINT-ERROR")) {
    console.log(file + "\n  1:14  error  'LINT-ERROR' is assigned a value but never used  no-unused-vars");
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
`,
  "node_modules/prettier/bin/prettier.cjs": String.raw`const TOOL = "prettier";
${LOG_STUB}
const files = process.argv.slice(2).filter((a) => !a.startsWith("--") && fs.existsSync(a));
// .prettierignore of this repository skips Markdown.
const ugly = files.filter((f) => !f.endsWith(".md") && fs.readFileSync(f, "utf8").includes("FORMAT-ERROR"));
for (const file of ugly) console.log("[warn] " + file);
if (ugly.length) console.log("[warn] Code style issues found in the above file. Run Prettier with --write to fix.");
process.exit(ugly.length ? 1 : 0);
`,
  "node_modules/typescript/bin/tsc": String.raw`const TOOL = "tsc";
${LOG_STUB}
const path = require("node:path");
const errors = [];
if (fs.existsSync("next-env.d.ts") && !fs.existsSync(path.join(".next", "types", "routes.d.ts"))) {
  errors.push("next-env.d.ts(3,8): error TS2307: Cannot find module './.next/types/routes.d.ts'.");
}
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.m?tsx?$/.test(entry.name) && fs.readFileSync(file, "utf8").includes("TYPE-ERROR")) {
      errors.push(file + "(1,1): error TS2322: TYPE-ERROR");
    }
  }
})(".");
for (const error of errors) console.log(error);
process.exit(errors.length ? 2 : 0);
`,
  "node_modules/next/dist/bin/next": String.raw`const TOOL = "next";
${LOG_STUB}
const path = require("node:path");
if (process.argv[2] !== "typegen") process.exit(1);
fs.mkdirSync(path.join(".next", "types"), { recursive: true });
fs.writeFileSync(path.join(".next", "types", "routes.d.ts"), "export {};\n");
`,
};

/** Tracked files of every throwaway checkout; scripts/test.mts is a stub. */
const TRACKED: Record<string, string> = {
  ".gitignore": "node_modules/\n.next/\n.claude/worktrees/\n",
  "README.md": "# Throwaway\n",
  "tsconfig.json": "{}\n",
  "next-env.d.ts": 'import "./.next/types/routes.d.ts";\n',
  "src/a.ts": "export const a = 1;\n",
  "scripts/extract/prompt.mts": "export const prompt = 1;\n",
  "tests/unit/a.test.ts": "// passes\n",
  "scripts/test.mts": String.raw`import fs from "node:fs";
import path from "node:path";
fs.appendFileSync(
  process.env.HOOK_STUB_LOG,
  JSON.stringify({ tool: "test", cwd: process.cwd(), args: process.argv.slice(2) }) + "\n",
);
const failing = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (fs.readFileSync(file, "utf8").includes("TEST-FAIL")) failing.push(file);
  }
})("tests");
for (const file of failing) console.log(" FAIL " + file + " > AssertionError: TEST-FAIL");
process.exit(failing.length ? 1 : 0);
`,
};

let sandbox: string;
let hookTmp: string;
let log: string;
/** The session's checkout. */
let work: string;
/** A worktree of `work` with dependencies, where .claude/worktrees/ puts it. */
let worktree: string;
/** A worktree of `work` without node_modules, as a fresh one is. */
let bareWorktree: string;
/** Another repository, holding an error of its own. */
let other: string;
/** A checkout whose node_modules lacks the tools. */
let broken: string;
/** The checkouts a case wrote to, reset after it. */
const touched = new Set<string>();

beforeAll(() => {
  // Canonical, as git prints it: os.tmpdir() may carry an 8.3 short name.
  sandbox = realpathSync.native(mkdtempSync(join(tmpdir(), "agent-hooks-")));
  hookTmp = join(sandbox, "tmp");
  mkdirSync(hookTmp);
  log = join(sandbox, "calls.log");
  work = createRepository("work");
  installStubs(work);
  git(work, "worktree", "add", "-q", "-b", "wt", ".claude/worktrees/wt");
  worktree = join(work, ".claude", "worktrees", "wt");
  installStubs(worktree);
  git(work, "worktree", "add", "-q", "-b", "bare", ".claude/worktrees/bare");
  bareWorktree = join(work, ".claude", "worktrees", "bare");
  other = createRepository("other");
  installStubs(other);
  broken = createRepository("broken");
  mkdirSync(join(broken, "node_modules"));
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  writeFileSync(log, "");
  rmSync(join(hookTmp, "claude-hooks"), { recursive: true, force: true });
  // Ignored by git, so no reset restores it; the typegen case removes it.
  for (const root of [work, worktree]) {
    mkdirSync(join(root, ".next", "types"), { recursive: true });
    writeFileSync(join(root, ".next", "types", "routes.d.ts"), "export {};\n");
  }
});

afterEach(() => {
  for (const root of touched) {
    git(root, "reset", "-q", "--hard");
    git(root, "clean", "-q", "-fd");
  }
  touched.clear();
});

describe("lint-edited-file.mjs (PostToolUse, per edit)", () => {
  it("reports an ESLint finding in the edited file on stderr, exit 2", () => {
    write(work, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook("lint-edited-file.mjs", edit(join(work, "src/bad.ts")));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("ESLint");
    expect(result.stderr).toContain("src/bad.ts");
    expect(result.stderr).toContain("LINT-ERROR");
  });

  it("reports a Prettier finding on stderr, exit 2", () => {
    write(work, "src/ugly.ts", "export const x='FORMAT-ERROR'\n");
    const result = hook(
      "lint-edited-file.mjs",
      edit(join(work, "src/ugly.ts")),
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Prettier");
    expect(result.stderr).toContain("src/ugly.ts");
  });

  it("passes a clean file silently, having run both tools on it alone", () => {
    const result = hook("lint-edited-file.mjs", edit(join(work, "src/a.ts")));
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(calls()).toEqual([
      { tool: "eslint", cwd: work, args: expect.arrayContaining(["src/a.ts"]) },
      {
        tool: "prettier",
        cwd: work,
        args: expect.arrayContaining(["src/a.ts"]),
      },
    ]);
  });

  it("runs only Prettier on a file type ESLint does not cover", () => {
    const result = hook("lint-edited-file.mjs", edit(join(work, "README.md")));
    expect(result.code).toBe(0);
    expect(calls().map((call) => call.tool)).toEqual(["prettier"]);
  });

  it("exits 0 for a file that does not exist, starting nothing", () => {
    const result = hook(
      "lint-edited-file.mjs",
      edit(join(work, "src/gone.ts")),
    );
    expect(result.code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it.each([
    ["{}", "{}"],
    ["not JSON", "not json"],
    ["empty input", ""],
    ["a call without a path", JSON.stringify({ tool_input: {} })],
  ])("exits 0 for %s, starting nothing", (_name, input) => {
    expect(hook("lint-edited-file.mjs", input).code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it("resolves a relative path against the input's cwd", () => {
    write(work, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook("lint-edited-file.mjs", edit("src/bad.ts"));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("src/bad.ts");
  });

  it("leaves a file of another repository alone", () => {
    write(other, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook(
      "lint-edited-file.mjs",
      edit(join(other, "src/bad.ts")),
    );
    expect(result.code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it("checks the edited file's checkout, whatever CLAUDE_PROJECT_DIR names", () => {
    write(other, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook("lint-edited-file.mjs", edit(join(work, "src/a.ts")), {
      env: { CLAUDE_PROJECT_DIR: other },
    });
    expect(result.code).toBe(0);
    expect(calls().map((call) => call.cwd)).toEqual([work, work]);
  });

  it("checks an edit in a worktree inside that worktree", () => {
    write(worktree, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook(
      "lint-edited-file.mjs",
      edit(join(worktree, "src/bad.ts")),
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("src/bad.ts");
    expect(calls()[0]).toMatchObject({ tool: "eslint", cwd: worktree });
  });

  it("tells Claude a worktree without node_modules was not checked", () => {
    const result = hook(
      "lint-edited-file.mjs",
      edit(join(bareWorktree, "src/a.ts")),
    );
    expect(result.code).toBe(0);
    expect(context(result.stdout)).toContain("has no node_modules");
    expect(calls()).toEqual([]);
  });

  it("fails, not passes, when ESLint is missing from node_modules", () => {
    const result = hook(
      "lint-edited-file.mjs",
      { ...edit(join(broken, "src/a.ts")), cwd: broken },
      { cwd: broken },
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      "node_modules/eslint/bin/eslint.js is missing",
    );
  });

  it.runIf(process.platform === "win32")(
    "routes a path with a lowercase drive letter the same way",
    () => {
      write(work, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
      const lower = (path: string) => path[0].toLowerCase() + path.slice(1);
      const result = hook("lint-edited-file.mjs", {
        ...edit(lower(join(work, "src/bad.ts"))),
        cwd: lower(work),
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("src/bad.ts");
    },
  );
});

describe("post-edit-tests.mjs (PostToolUse, per edit, by path)", () => {
  it("runs the unit project for a unit path and passes silently", () => {
    const result = hook(
      "post-edit-tests.mjs",
      edit(join(work, "tests/unit/a.test.ts")),
      { args: ["unit"] },
    );
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(calls()).toEqual([
      { tool: "test", cwd: work, args: ["run", "--project", "unit"] },
    ]);
  });

  it("reports a failing project on stderr, exit 2", () => {
    write(work, "tests/unit/b.test.ts", "// TEST-FAIL\n");
    const result = hook(
      "post-edit-tests.mjs",
      edit(join(work, "tests/unit/b.test.ts")),
      { args: ["unit"] },
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--project unit");
    expect(result.stderr).toContain("TEST-FAIL");
  });

  it.each([
    ["unit", "src/a.ts"],
    ["unit", "supabase/checks/matching.sql"],
    ["db", "tests/unit/a.test.ts"],
    ["hooks", "src/a.ts"],
  ])("leaves a path outside its map alone (%s, %s)", (suite, path) => {
    write(work, path, "-- any\n");
    const result = hook("post-edit-tests.mjs", edit(join(work, path)), {
      args: [suite],
    });
    expect(result.code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it.each([
    ["db", "supabase/migrations/20260101000000_x.sql"],
    ["hooks", ".claude/hooks/x.mjs"],
  ])("runs the %s project for %s", (suite, path) => {
    write(work, path, "-- any\n");
    const result = hook("post-edit-tests.mjs", edit(join(work, path)), {
      args: [suite],
    });
    expect(result.code).toBe(0);
    expect(calls()).toEqual([
      { tool: "test", cwd: work, args: ["run", "--project", suite] },
    ]);
  });

  it("reminds Claude of the eval after a prompt edit", () => {
    const result = hook(
      "post-edit-tests.mjs",
      edit(join(work, "scripts/extract/prompt.mts")),
      { args: ["unit"] },
    );
    expect(result.code).toBe(0);
    expect(context(result.stdout)).toContain("npm run extract:eval");
  });

  it("tests an edit in a worktree inside that worktree", () => {
    write(worktree, "tests/unit/b.test.ts", "// TEST-FAIL\n");
    const result = hook(
      "post-edit-tests.mjs",
      edit(join(worktree, "tests/unit/b.test.ts")),
      { args: ["unit"] },
    );
    expect(result.code).toBe(2);
    expect(calls()).toEqual([
      { tool: "test", cwd: worktree, args: ["run", "--project", "unit"] },
    ]);
  });

  it("tells Claude a worktree without node_modules was not tested", () => {
    const result = hook(
      "post-edit-tests.mjs",
      edit(join(bareWorktree, "tests/unit/a.test.ts")),
      { args: ["unit"] },
    );
    expect(result.code).toBe(0);
    expect(context(result.stdout)).toContain("has no node_modules");
    expect(calls()).toEqual([]);
  });

  it("refuses an unknown project with exit 1, a hook error for the user", () => {
    const result = hook("post-edit-tests.mjs", "{}", { args: ["both"] });
    expect(result.code).toBe(1);
  });
});

describe("end-of-turn.mjs (Stop)", () => {
  it("runs nothing when nothing changed", () => {
    expect(hook("end-of-turn.mjs", stop())).toEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
    expect(calls()).toEqual([]);
  });

  it("runs nothing when only Markdown changed", () => {
    write(work, "README.md", "# Edited\n");
    expect(hook("end-of-turn.mjs", stop()).code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it("passes a clean change after every check ran", () => {
    write(work, "src/a.ts", "export const a = 2;\n");
    expect(hook("end-of-turn.mjs", stop())).toEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
    expect(
      calls()
        .map((call) => call.tool)
        .sort(),
    ).toEqual(["eslint", "prettier", "test", "tsc"]);
  });

  it("blocks on a lint error written past the per-edit hook", () => {
    write(work, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook("end-of-turn.mjs", stop());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Fix these before you finish");
    expect(result.stderr).toContain("src/bad.ts");
    expect(result.stderr).toContain("LINT-ERROR");
  });

  it("reports a format, a test and a type failure in one message", () => {
    write(work, "src/ugly.ts", "export const x='FORMAT-ERROR'\n");
    write(work, "tests/unit/b.test.ts", "// TEST-FAIL\n");
    write(work, "src/typed.ts", "export const n: number = 'TYPE-ERROR';\n");
    const result = hook("end-of-turn.mjs", stop());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Prettier");
    expect(result.stderr).toContain("src/ugly.ts");
    expect(result.stderr).toContain("TEST-FAIL");
    expect(result.stderr).toContain("TS2322: TYPE-ERROR");
  });

  it("lets the agent finish once it is already continuing", () => {
    write(work, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    const result = hook("end-of-turn.mjs", stop({ stop_hook_active: true }));
    expect(result.code).toBe(0);
    expect(calls()).toEqual([]);
  });

  it("generates the route types before the typecheck when they are missing", () => {
    rmSync(join(work, ".next"), { recursive: true });
    write(work, "src/a.ts", "export const a = 2;\n");
    expect(hook("end-of-turn.mjs", stop()).code).toBe(0);
    const tools = calls().map((call) => call.tool);
    expect(tools).toContain("next");
    expect(tools.indexOf("next")).toBeLessThan(tools.indexOf("tsc"));
  });

  it("sweeps a worktree the session's edits registered", () => {
    write(worktree, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    // The per-edit hook registers the checkout for the session.
    hook("lint-edited-file.mjs", edit(join(worktree, "src/bad.ts")));
    const result = hook("end-of-turn.mjs", stop());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(worktree);
    expect(result.stderr).toContain("src/bad.ts");
  });

  it("does not sweep a worktree another session registered", () => {
    write(worktree, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    hook("lint-edited-file.mjs", {
      ...edit(join(worktree, "src/bad.ts")),
      session_id: "another",
    });
    expect(hook("end-of-turn.mjs", stop()).code).toBe(0);
  });

  it("sweeps the session's checkout, whatever CLAUDE_PROJECT_DIR names", () => {
    write(other, "src/bad.ts", "export const x = 'LINT-ERROR';\n");
    write(work, "src/a.ts", "export const a = 2;\n");
    const result = hook("end-of-turn.mjs", stop(), {
      env: { CLAUDE_PROJECT_DIR: other },
    });
    expect(result.code).toBe(0);
  });

  it("tells the user a checkout without node_modules was not checked", () => {
    write(bareWorktree, "src/a.ts", "export const a = 2;\n");
    hook("lint-edited-file.mjs", edit(join(bareWorktree, "src/a.ts")));
    const result = hook("end-of-turn.mjs", stop());
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).systemMessage).toContain(
      "has no node_modules",
    );
  });

  it("fails, not passes, when the tools are missing from node_modules", () => {
    write(broken, "src/a.ts", "export const a = 2;\n");
    const result = hook("end-of-turn.mjs", stop({ cwd: broken }), {
      cwd: broken,
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      "node_modules/eslint/bin/eslint.js is missing",
    );
  });

  it("tells the user when the session is in no checkout", () => {
    const result = hook("end-of-turn.mjs", stop({ cwd: hookTmp }), {
      cwd: hookTmp,
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).systemMessage).toContain(
      "not in a git checkout",
    );
  });
});

describe(".claude/settings.json", () => {
  type Handler = {
    command: string;
    args: string[];
    timeout: number;
    asyncRewake?: boolean;
  };
  const groups = (event: string): { matcher?: string; hooks: Handler[] }[] =>
    JSON.parse(
      readFileSync(join(REPOSITORY, ".claude", "settings.json"), "utf8"),
    ).hooks?.[event] ?? [];
  const handlers = () =>
    [...groups("PostToolUse"), ...groups("Stop")].flatMap(
      (group) => group.hooks,
    );

  it("runs the per-edit hooks on Edit and Write, matched by exact name", () => {
    expect(groups("PostToolUse").map((group) => group.matcher)).toEqual([
      "Edit|Write",
    ]);
    expect(
      groups("PostToolUse")[0].hooks.map((handler) => handler.args.join(" ")),
    ).toEqual([
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/lint-edited-file.mjs",
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tests.mjs unit",
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tests.mjs hooks",
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tests.mjs db",
    ]);
  });

  it("runs the sweep when the agent stops", () => {
    expect(
      groups("Stop").flatMap((group) => group.hooks.map((h) => h.args[0])),
    ).toEqual(["${CLAUDE_PROJECT_DIR}/.claude/hooks/end-of-turn.mjs"]);
  });

  it("starts every handler as `node <script>` and the script exists", () => {
    for (const handler of handlers()) {
      expect(handler.command).toBe("node");
      expect(handler.args[0]).toMatch(/^\$\{CLAUDE_PROJECT_DIR\}\//);
      const script = join(
        REPOSITORY,
        handler.args[0].split("/").slice(1).join("/"),
      );
      expect(readFileSync(script, "utf8")).not.toBe("");
    }
  });

  it("gives every handler a timeout in seconds, not milliseconds", () => {
    for (const handler of handlers()) {
      expect(handler.timeout).toBeGreaterThan(0);
      expect(handler.timeout).toBeLessThanOrEqual(600);
    }
  });

  it("runs the db project in the background and everything else in the turn", () => {
    const background = handlers().filter((handler) => handler.asyncRewake);
    expect(background.map((handler) => handler.args.slice(1))).toEqual([
      ["db"],
    ]);
  });
});

/** Runs one hook script with `input` on stdin. */
function hook(
  script: string,
  input: unknown,
  options: { args?: string[]; cwd?: string; env?: Record<string, string> } = {},
) {
  const result = spawnSync(
    process.execPath,
    [join(HOOKS, script), ...(options.args ?? [])],
    {
      cwd: options.cwd ?? work,
      input: typeof input === "string" ? input : JSON.stringify(input),
      encoding: "utf8",
      env: {
        ...process.env,
        // The registry of checkouts and the db lock live under the temp
        // directory; this keeps them inside the sandbox.
        TEMP: hookTmp,
        TMP: hookTmp,
        TMPDIR: hookTmp,
        HOOK_STUB_LOG: log,
        CLAUDE_PROJECT_DIR: work,
        ...options.env,
      },
    },
  );
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** PostToolUse input for an Edit of `file`, in session s1 working in `work`. */
function edit(file: string) {
  return {
    session_id: "s1",
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    cwd: work,
    tool_input: { file_path: file },
  };
}

/** Stop input for session s1 working in `work`. */
function stop(fields: Record<string, unknown> = {}) {
  return {
    session_id: "s1",
    hook_event_name: "Stop",
    cwd: work,
    stop_hook_active: false,
    ...fields,
  };
}

/** The `additionalContext` a hook printed for Claude. */
function context(stdout: string): string {
  return JSON.parse(stdout).hookSpecificOutput.additionalContext;
}

/** The stubs that ran since the case started, in order. */
function calls(): { tool: string; cwd: string; args: string[] }[] {
  return readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const call = JSON.parse(line);
      return { ...call, cwd: realpathSync.native(call.cwd) };
    });
}

function createRepository(name: string): string {
  const root = join(sandbox, name);
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "core.autocrlf", "false");
  for (const [path, content] of Object.entries(TRACKED)) {
    write(root, path, content);
  }
  git(root, "add", "-A");
  git(
    root,
    "-c",
    "user.name=hooks",
    "-c",
    "user.email=hooks@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "init",
  );
  return root;
}

function installStubs(root: string) {
  for (const [path, content] of Object.entries(STUBS))
    write(root, path, content);
}

function write(root: string, path: string, content: string) {
  touched.add(root);
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function git(dir: string, ...args: string[]) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${dir}: ${result.stderr}`);
  }
}
