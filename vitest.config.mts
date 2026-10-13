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
    ],
  },
});
