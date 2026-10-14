import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
// The .ts extension is written out, as in next.config.ts, which imports the
// same file.
import { refuseSupabaseTarget } from "./src/lib/env/supabase-target.ts";

// The test user's credentials (E2E_USERNAME, E2E_PASSWORD) and the app's env
// come from the gitignored .env.local, which holds the local Supabase stack's
// values. A variable already set in the environment wins over the file. In CI
// the file is absent and the variables come from the job.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// The webServer below runs next build and next start, which skip the guard
// that stops next dev (next.config.ts). The run signs in and writes as the
// test user, so it checks the target here, and refuses the hosted project
// even when SUPABASE_TARGET says so: E2E runs against the local stack only.
const refusal =
  process.env.SUPABASE_TARGET === "hosted"
    ? "E2E tests run against the local Supabase stack only; unset SUPABASE_TARGET."
    : refuseSupabaseTarget({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        target: process.env.SUPABASE_TARGET,
      });
if (refusal !== null) throw new Error(refusal);

// 3000 is next start's default: the package.json scripts pass no -p and
// next.config.ts sets no port. E2E_PORT overrides it when 3000 is taken —
// outside CI, a server already listening there (npm run dev, say) is reused
// and tested instead of a fresh build.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The HTML report never opens itself: on a failure it would otherwise serve
  // the report and keep the run from exiting. `npx playwright show-report`
  // opens it.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + start, on the port above.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
