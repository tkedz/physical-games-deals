import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must stay last: it switches off the ESLint rules that overlap with
  // Prettier, so formatting is decided in one place instead of two.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's output: a report with traces bundles the trace viewer's
    // JavaScript. Gitignored, but ESLint does not read .gitignore.
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "playwright/.cache/**",
  ]),
]);

export default eslintConfig;
