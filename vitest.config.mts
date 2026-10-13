import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The `@/` paths of tsconfig.json. Code under src/ imports through them
      // at runtime, not only for types. fileURLToPath rather than .pathname,
      // which yields "/C:/…" on Windows.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Each project names its own files. Vitest's default include would also
    // collect the node:test files under .claude/skills/, which the 10x CLI
    // manages. Inline projects inherit the alias above.
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // PGlite built from supabase/migrations/ (tests/db/harness/). A file
        // builds its database in beforeAll, in 1–2 s, and its checks then run
        // in milliseconds.
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // The agent hooks in .claude/hooks/, piped hook input in throwaway git
        // repositories with stubbed tools. Its own project, so the per-edit
        // unit run does not pay for the git and process spawns.
        test: {
          name: "hooks",
          include: ["tests/hooks/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
