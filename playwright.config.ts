import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
// The .ts extension is written out, as in next.config.ts, which imports the
// same file.
import { refuseE2eTarget } from "./src/lib/env/supabase-target.ts";

// The test user's credentials (E2E_USERNAME, E2E_PASSWORD) and the app's env
// come from the gitignored .env.local, which holds the local Supabase stack's
// values. A variable already set in the environment wins over the file. In CI
// the file is absent and the variables come from the job.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// The webServer below runs next build and next start, which skip the guard
// that stops next dev (next.config.ts). The run signs in and writes as the
// test user, so it checks the target here, and refuses the hosted project
// even when SUPABASE_TARGET says so: E2E runs against the local stack only.
// The account module (scripts/e2e/accounts.mts) refuses the same way.
const refusal = refuseE2eTarget({
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
  // In CI a test that fails and then passes on a retry fails the run: a flaky
  // pass is a finding, not a green gate. The retries stay, so the report
  // still holds the retry's trace.
  failOnFlakyTests: !!process.env.CI,
  // Bounds the whole CI run, so a hung run ends with a report instead of
  // being killed by the job's timeout. Unset (no limit) locally.
  globalTimeout: process.env.CI ? 15 * 60_000 : undefined,
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
    // In CI the command's stdout reaches the log, so a failed next build
    // shows why. Locally it stays out of the test output. Its stderr is
    // piped either way, Playwright's default.
    stdout: process.env.CI ? "pipe" : "ignore",
    // The server under test never calls the live game catalogue (test-plan
    // §4): readRawgApiKey (src/lib/catalog/rawg.ts) treats an empty key as
    // unset, so a /watchlist search reports the catalogue unavailable and
    // still offers the phrase. It has to be the empty string, not undefined.
    // Playwright starts the command with {...process.env, ...env}, and
    // process.env already holds the key, loaded from .env.local above.
    // undefined would drop the variable from the server's environment, and
    // next build and next start would read it from .env.local again, because
    // @next/env fills only a variable the environment lacks entirely. An
    // empty string is present, so it stays. A reused server (outside CI) keeps
    // whatever key it started with.
    env: { RAWG_API_KEY: "" },
  },
});
