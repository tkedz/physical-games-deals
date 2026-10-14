# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: playwright.config.ts (loads .env.local; refuses a Supabase URL that is not the local stack, since next build and next start skip the next dev guard)
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:3000
- port: 3000 (detected from Next.js's `next start` default: no -p in the package.json scripts, no port in next.config.ts; detected default 3000, override with E2E_PORT)
- web server command: npm run build && npm run start -- -p <port>; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .env.local — a user in the local Supabase stack, which npm run local:reset deletes
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects #6, its browser round trip: an access change opens a private view to guests (a guest on /my-deals must land on /login)
- browser CLI: playwright-cli (global @playwright/cli 0.1.22), command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-14
