# Main Flow End to End Implementation Plan

## Overview

Rollout Phase 5 of `context/foundation/test-plan.md`: one Playwright test of the PRD's primary flow, run as a CI gate that `deploy` waits for. The flow is guest redirect, sign-in, empty state, a watched phrase reaching `/my-deals` with its price and link, removal, and sign-out. Sign-out is checked in the browser and on the server. The test runs against the local Supabase stack, on Docker locally and inside the GitHub runner in CI. Each attempt creates its own account and deletes it afterwards.

### Execution routing

Each phase names the skill that drives it. All three skills share the `## Progress` section below, so the phases run in order with a different command each.

| Phase | Executor | Command | Why this skill |
|---|---|---|---|
| 1. Gate settings and test accounts | `/10x-implement` | `/10x-implement testing-main-flow-end-to-end phase 1` | It changes the app `webServer` entry of `playwright.config.ts`, which `/10x-e2e` must leave to `/10x-e2e-setup`. It also adds an account module and unit tests that CI shares. |
| 2. Main-flow E2E test | `/10x-e2e` | `/10x-e2e testing-main-flow-end-to-end phase 2` | The risk crosses auth, routing, the database and the rendered UI; every feature it drives is built, and no spec covers it yet. |
| 3. E2E job in CI | `/10x-implement` | `/10x-implement testing-main-flow-end-to-end phase 3` | `/10x-e2e` does not wire up CI. |
| 4. Cookbook and rules-file facts | `/10x-implement` | `/10x-implement testing-main-flow-end-to-end phase 4` | Documentation. |

## Current State Analysis

- **E2E infrastructure exists (commit 2d6f628).**
  - `playwright.config.ts` loads `.env.local` (`:11`), refuses any target but the local stack (`:17-24`), and runs `npm run build && npm run start` as its `webServer` (`:59-65`).
  - `tests/e2e/auth.setup.ts` signs in as `E2E_USERNAME` and saves `playwright/.auth/user.json`.
  - `tests/e2e/seed.spec.ts` covers one facet of risk #6: a guest on `/my-deals` lands on `/login`.
  - `context/foundation/test-stack.md` records the rest and belongs to `/10x-e2e-setup`.
- **The gate has holes as configured.**
  - `retries: 2` in CI without `failOnFlakyTests` (`playwright.config.ts:37`), so a flaky pass exits 0 (research Summary 7).
  - `webServer` keeps the default `stdout: "ignore"`, which hides `next build` errors.
  - There is no `globalTimeout`.
- **Locally the server under test holds the live RAWG key.** `.env.local` carries `RAWG_API_KEY`, so a search on `/watchlist` calls RAWG. Test-plan §4 forbids live RAWG calls in tests.
- **No CI job runs Playwright.**
  - `.github/workflows/ci.yml` has `verify` (lint, format, `npm test`) and `deploy` with `needs: verify` (`:70-71`).
  - `paths-ignore` skips `supabase/**` (`:31,40`).
- **The flow's traps** (research §0, §3, §5):
  - Sign-out uses `scope: "local"` (`src/components/auth/sign-out-button.tsx:30`). This ends the session that signs out, so the test signs in itself rather than using the saved session.
  - Removal is soft (`removed_at`). A leftover active entry from a failed attempt breaks the empty-state step of the next attempt.
  - Phrase matching is a substring test on folded text, so a shared word matches several deals.
- **The seed is enough for the flow.**
  - With only `supabase/seed.sql`, `/` lists D1 then D2 (`tests/db/seed.test.ts:6-12`).
  - D1, „Gra Elden Ring PS5 Pudełkowa”, has a shop link and a post link; its whole title matches only itself.

## Desired End State

- `tests/e2e/main-flow.spec.ts` walks the main flow on a fresh account per attempt, self-seeded from the public deals list. It passes locally on whatever data the local stack holds, and in CI on the seed alone.
- It fails when:
  - the watched phrase no longer reaches `/my-deals`;
  - sign-out leaves the server session alive;
  - a private view opens to guests.
- It leaves no account behind.
- `ci.yml` has an `e2e` job that starts the local stack in the runner, seeds it, and runs `npx playwright test`; `deploy` needs both `verify` and `e2e`. A flaky pass fails the job. The job prints no key, and on any finished run it keeps `playwright-report/` as an artifact.
- Test plan §6.5 holds the pattern, and CLAUDE.md states the new job and the new credential-loading commands.

Verify by: the Phase 2 local runs and deliberate breaks, the Phase 3 PR runs (one green, one with a deliberate break where `deploy` never starts), and the Phase 4 doc checks.

### Key Discoveries:

- An empty string beats `.env.local`.
  - `@next/env` fills a key only when `process.env` lacks it entirely (`typeof p[t]==="undefined"` in `node_modules/@next/env/dist/index.js`).
  - Playwright starts the server with `{...process.env, ...webServer.env}` (`node_modules/playwright/lib/runner/index.js:870-875`).
  - So `webServer.env: { RAWG_API_KEY: "" }` blanks the key for `next start`. `readRawgApiKey` then treats `""` as unset (`src/lib/catalog/rawg.ts:36-44`), and the search answers „Katalog gier jest chwilowo niedostępny” with the phrase offer still shown (`src/components/watchlist/search-results.tsx:69-77,216`).
- Deleting a user removes its watchlist rows: `watchlist_entries.user_id … references auth.users (id) on delete cascade` (`supabase/migrations/20261007141021_create_watchlist_entries.sql:9`).
- `createCollectorClient()` (`scripts/collector/supabase.mts:28-58`) is the existing pattern for a guarded secret-key client kept outside `src/`. It accepts `SUPABASE_TARGET=hosted`, so the E2E client needs a stricter guard.
- `npm run local:start` and `npm run local:reset` screen the CLI's output (`scripts/local/start.mts`, `scripts/local/reset.mts`). Without `supabase/snapshot.sql`, which is gitignored and absent in CI, `local:reset` loads migrations plus `seed.sql` (`scripts/local/commands.mts:54-64`). Both run unchanged in CI.
- `npx supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` emits the app's two names. It also emits `SECRET_KEY`, among others (research §2, names only, CLI 2.117.0).
- The password rule the account generator must meet: `hasRequiredCharacters` and the 8–72-byte bounds in `src/lib/auth/credentials.ts:27-60`.
- The text the test asserts on:
  - signed-out header link „Zaloguj się” (`src/app/(app)/layout.tsx:59`);
  - „Wyloguj się” (`src/components/auth/sign-out-button.tsx:48`);
  - empty state „Twoja lista obserwowanych jest pusta” (`src/components/deals/my-deals-section.tsx:174`);
  - „Usuń” (`src/components/watchlist/watchlist-entry-row.tsx:64`);
  - the phrase button `Obserwuj frazę „…”` (`src/components/watchlist/phrase-offer.tsx:56-58`).
- `/my-deals` reads through `loadMatchedDealsPage` (`src/lib/deals/queries.ts:196-202`), which is the natural place for Phase 2's first deliberate break.

## What We're NOT Doing

- **No E2E on pushes that touch only `supabase/**`.** `database-tests.yml` stays unchanged: its `npm test` already checks the matching rule, and an E2E-only breakage surfaces on the next push that runs `ci.yml`. (Decided in planning.)
- **No catalogue path in the E2E test and no RAWG mock server.** Risk #7 belongs to rollout Phase 3, at the unit layer.
- **No edits to test-plan §1–§5.** That covers the §3 status flip, the §4 e2e row and the §5 gate row's "Where"; they are left to `/10x-test-plan`, as earlier changes did. This plan edits §6 only.
- **No edits to files owned by `/10x-e2e-setup`:** `test-stack.md`, `tests/e2e/auth.setup.ts`, `tests/e2e/seed.spec.ts`. In `playwright.config.ts`, every field `test-stack.md` records also stays unchanged: command, url, port, `reuseExistingServer`, setup project and `storageState`.
- **Nothing that speeds up stack start-up in CI.** No change to `START_ARGS`, no Docker image cache, no `.next/cache`, no browser cache. The seed loads through the proven `local:reset`, not the unobserved `SUPABASE_DB_SEED_ENABLED` route.
- **No `$GITHUB_ENV` route for the keys, and no GitHub secret for this job.**
- **No second E2E test, and no test per access combination.** Test-plan §2 #6 names a test per combination as an anti-pattern. No layout or visual assertions.
- **No branch-protection change.** `gh` is not signed in, and the required-check caveat in `ci.yml:17-19` stays as written.
- **No E2E against the hosted project.**

## Implementation Approach

1. **Phase 1** makes the gate strict and the test data disposable before any spec exists:
   - Playwright settings fail on a flaky pass, show the build output, and keep the server under test off RAWG.
   - One module creates and deletes local test accounts through the admin API. It is guarded to the local stack, with its pure parts unit-tested.
2. **Phase 2** builds the spec with `/10x-e2e`'s risk loop on top of that module, and proves it with deliberate breaks.
3. **Phase 3** moves the run into CI:
   - The stack is started and seeded with the repository's own screened wrappers.
   - The job's env goes into a workspace `.env.local`, the same contract the local run uses, so no key reaches the log.
   - A per-run setup user is created for `auth.setup.ts`.
   - `deploy` waits for the job.
4. **Phase 4** writes down the pattern and the new facts.

## Critical Implementation Details

- **Timing & lifecycle.**
  - `NEXT_PUBLIC_*` values are inlined by `next build`, which the `webServer` runs. So in CI the workspace `.env.local` must exist before `npx playwright test` starts.
  - Locally, `reuseExistingServer` reuses any server already on port 3000, `npm run dev` with the live RAWG key included. Free the port, or set `E2E_PORT`, before every verify and deliberate-break run.
- **Secrets in CI.**
  - A bare `supabase start` or `supabase status` prints the local keys. The job uses `npm run local:start`, and lets `supabase status -o env` out only through a name filter into a file.
  - No step echoes `.env.local`, and the generated test password never appears on a command line.
- **Sign-out scope.** `scope: "local"` revokes only the session that signs out. The test's own sign-in creates that session, so the saved setup session stays valid for other specs.

## Phase 1: Gate Settings and Test Accounts

### Overview

**Executor: `/10x-implement`.**
- Tightens `playwright.config.ts` for CI and blanks the catalogue key for the server under test.
- Adds a local-only account module the spec and CI both use, with a CLI around it.

### Changes Required:

#### 1. E2E target refusal

**File**: `src/lib/env/supabase-target.ts`, `tests/unit/env/supabase-target.test.ts`

**Intent**: Move the inline refusal in `playwright.config.ts:17-24` into one exported function, so the config and the account module refuse the same way. E2E runs against the local stack only, even when `SUPABASE_TARGET` says `hosted`.

**Contract**: `refuseE2eTarget({ url, target }: SupabaseTargetInput): string | null`.
- It returns the existing "unset SUPABASE_TARGET" message when `target === "hosted"`, and otherwise delegates to `refuseSupabaseTarget`.
- New test rows:
  - `hosted` with a hosted URL is refused;
  - `hosted` with a loopback URL is refused;
  - unset with a non-loopback URL is refused;
  - unset or `local` with `http://127.0.0.1:54321` passes.

#### 2. Playwright gate settings

**File**: `playwright.config.ts`

**Intent**: Make the CI run fail on a flaky pass and bound its length, show `next build` output when the server fails, and keep the server under test off the live catalogue.

**Contract**:
- The refusal calls `refuseE2eTarget`.
- `failOnFlakyTests: !!process.env.CI`.
- `globalTimeout` is 15 minutes in CI and unset locally.
- `webServer.stdout` is `"pipe"` in CI and `"ignore"` locally.
- `webServer.env: { RAWG_API_KEY: "" }`, with a comment saying why the empty string works and `undefined` would not.
- Every field `test-stack.md` records stays unchanged.

#### 3. Account module

**File**: `scripts/e2e/accounts.mts` (new), `tests/unit/e2e/accounts.test.ts` (new)

**Intent**: Create and delete test accounts in the local stack through the Auth admin API, so every attempt starts empty and leaves nothing. The secret-key client lives outside `src/`, beside `createCollectorClient()`, where a Server Component cannot import it. The pure decisions are separate from the I/O (lessons.md).

**Contract**:
- `TEST_EMAIL_DOMAIN = "example.com"`.
- `uniqueTestEmail(label: string): string`: the label plus a timestamp and a random suffix.
- `testAccountPassword(): string`: random, meets `hasRequiredCharacters`, 8–72 UTF-8 bytes.
- `createE2eAdminClient(env = process.env)`:
  - throws `refuseE2eTarget`'s message, then a message naming a missing `SUPABASE_SECRET_KEY`, both before any request;
  - builds the client with `persistSession: false, autoRefreshToken: false`.
- `createTestAccount(client, { email, password }): Promise<{ id: string }>`: `email_confirm: true`.
- `findTestAccountId(client, email): Promise<string | null>`.
- `deleteTestAccount(client, id): Promise<void>`.
- Every failure throws the Auth error code and never the password.
- Unit rows:
  - 200 generated passwords each pass `hasRequiredCharacters` and the byte bounds, and differ from one another;
  - emails are unique, carry the label and end in the domain;
  - `createE2eAdminClient` refuses hosted targets, non-loopback URLs and a missing key, with the env injected.

#### 4. Account CLI

**File**: `scripts/e2e/account.mts` (new), `package.json`

**Intent**: Give CI one command to create the per-run setup user. Locally the same command restores the E2E user after `npm run local:reset` and deletes a probe account.

**Contract**:
- `"e2e:account": "node --env-file-if-exists=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/e2e/account.mts"`.
- Subcommands `create` and `delete` act on `E2E_USERNAME` / `E2E_PASSWORD` from the environment.
- Each prints one line that names neither the address nor the password: "created", "already exists", "deleted" or "nothing to delete", each exiting 0. Any other failure exits 1 with the error code.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the new rows in `tests/unit/env/supabase-target.test.ts` and `tests/unit/e2e/accounts.test.ts`
- `npm run lint` and `npm run format:check` pass
- `npx tsc --noEmit` passes
- `npx playwright test` stays green locally (setup + seed) under the new settings, with port 3000 free
- `npm run e2e:account -- create`, then `-- delete`, with a throwaway `E2E_USERNAME`/`E2E_PASSWORD` set in the command's environment (password generated in a subshell, never echoed), creates and removes a local account and prints no credential; a repeated `-- delete` reports nothing to delete
- With `SUPABASE_TARGET=hosted` in the command's environment, `npm run e2e:account -- create` exits 1 with the refusal before any request

**Implementation Note**: After this phase, hand over to `/10x-e2e` for Phase 2 (`/10x-e2e testing-main-flow-end-to-end phase 2`). If the local stack refuses the `example.com` domain, switch `TEST_EMAIL_DOMAIN` to one it accepts, and record the departure in `change.md` Notes (lessons.md).

---

## Phase 2: Main-Flow E2E Test

### Overview

**Executor: `/10x-e2e`.**
- One test, `tests/e2e/main-flow.spec.ts`, protecting test-plan §3 Phase 5: risks #1, #4 and #6, in their browser round trip.
- Built through the skill's PLAN → GENERATE → REVIEW → VERIFY loop against the running app, modelled on `seed.spec.ts`.
- Its gate holds:
  - every feature it drives is built (sign-in, watchlist phrase offer, `/my-deals`, removal, sign-out);
  - no spec covers the flow;
  - `seed.spec.ts` covers only the guest-on-`/my-deals` facet.

### Changes Required:

#### 1. The main-flow spec

**File**: `tests/e2e/main-flow.spec.ts` (new); a small helper under `tests/e2e/` if the hydration wait is shared

**Intent**: Prove the PRD's primary flow end to end, on a fresh account per attempt, self-seeded from the public deals list, asserting behaviour rather than layout.

**Contract**:
- **Setup.**
  - A provenance header names the risks and the seed.
  - The spec opts out of the saved session (`storageState` empty), as `seed.spec.ts:8` does.
  - Before each attempt, a fixture or hook creates an account with `scripts/e2e/accounts.mts`, and afterwards deletes it, asserting the deletion. It records the account's address as a `test-data` annotation, never the password.
- **Steps**, each with its assertion:
  1. **Self-seed.** As a guest on `/`, take the first deal card whose title is 3–100 characters. Record its title, its price text and every link target on it.
  2. **Guest redirect.** As a guest, open `/watchlist`; you land on `/login`.
  3. **Sign-in.** Sign in with the attempt's account, after the same hydration proof `auth.setup.ts:16-25` uses. You land on `/`, and „Wyloguj się” is visible.
  4. **Empty state.** `/my-deals` shows „Twoja lista obserwowanych jest pusta”.
  5. **Watch the phrase.** On `/watchlist`, search the recorded title and press `Obserwuj frazę „<title>”`, targeted by its full name so the step does not depend on the catalogue's outcome.
  6. **The deal reaches `/my-deals`.** A card with that title shows the same price text and the same link targets as on `/`. Assert its presence, not a count: local snapshot data may match more deals.
  7. **Removal.** On `/watchlist`, „Usuń” on the entry; `/my-deals` shows the empty state again.
  8. **Sign-out.** Record the context's cookies, then press „Wyloguj się”. The header offers „Zaloguj się”, and `/my-deals` sends you to `/login`.
  9. **Server-side session.** A new browser context carrying the recorded cookies opens `/my-deals` and lands on `/login`.
- **Real vs mocked.**
  - Auth, PostgREST, RLS and the proxy stay real.
  - RAWG is blank through Phase 1's `webServer.env`, so the phrase path is deterministic.
  - There is no `page.route` mock.
- **Required deliberate breaks** (VERIFY), each reverted at once:
  - `/my-deals` reading no rows (e.g. in `loadMatchedDealsPage`) turns step 6 red.
  - A sign-out that clears the browser's session without revoking it on the server turns step 9 red.
- **If step 9 fails on unbroken code**, the server session survives sign-out. That is a risk #6 finding: stop and report it, and never weaken the assertion.

### Success Criteria:

#### Automated Verification:

- Exploring the E2E build, a `/watchlist` search shows „Katalog gier jest chwilowo niedostępny” and the phrase offer — the server under test holds no RAWG key
- `npx playwright test tests/e2e/main-flow.spec.ts` passes on the local stack as it stands (snapshot data if loaded), with port 3000 free
- `npx playwright test tests/e2e/main-flow.spec.ts --repeat-each=3` passes — parallel attempts on separate accounts do not collide
- Deliberate break: `/my-deals` reading no rows turns the spec red at the deal assertion; the break is reverted
- Deliberate break: a sign-out that leaves the server session alive turns the spec red at the replayed-cookies assertion; the break is reverted
- No test account remains in the local stack after the green runs and after each red run
- The spec passes review against the five anti-patterns in `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`
- `npx playwright test` (setup, seed and main flow) passes, and `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass

#### Manual Verification:

- Tomasz watches one headed run (`npx playwright test tests/e2e/main-flow.spec.ts --headed`) and confirms it walks the PRD's main flow

**Implementation Note**: After this phase, hand back to `/10x-implement` for Phase 3 (`/10x-implement testing-main-flow-end-to-end phase 3`).

---

## Phase 3: E2E Job in CI

### Overview

**Executor: `/10x-implement`.**
- Adds an `e2e` job to `ci.yml`, running alongside `verify`. It starts and seeds the local stack in the runner, writes the job's env without printing it, creates the per-run setup user, and runs the suite.
- `deploy` waits for it.
- Every command is proven locally first (lessons.md), without wiping local data.

### Changes Required:

#### 1. The `e2e` job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the Playwright suite against a disposable local stack in every pipeline run that reaches `deploy`, and make `deploy` wait for it.

**Contract**:
- `jobs.e2e`:
  - `runs-on: ubuntu-latest`, `timeout-minutes: 30`;
  - no secrets, and the workflow's `contents: read`.
- Steps, in order:
  1. checkout;
  2. `setup-node` with `.nvmrc` and `cache: npm`;
  3. `npm ci`;
  4. `npm run local:start`;
  5. `npm run local:reset` (no snapshot in CI, so migrations plus `seed.sql`);
  6. "Write the local stack's env" (below);
  7. "Per-run test user": appends `E2E_USERNAME=e2e-setup-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}@example.com` (or the domain Phase 1 settled on) and a generated `E2E_PASSWORD` to `.env.local`. The password is a fixed `Aa1!` prefix plus `openssl rand -hex 16`, and nothing is echoed;
  8. `npm run e2e:account -- create`;
  9. `npx playwright install --with-deps chromium`;
  10. `npx playwright test`;
  11. upload `playwright-report/` with `if: ${{ !cancelled() }}` and `retention-days: 14`, using the current major of `actions/upload-artifact`.
- `jobs.deploy.needs: [verify, e2e]`.

The env step is the one place a key could leak, so its shape is fixed here. Verify the `SECRET_KEY` name locally, by name only, before relying on it:

```yaml
      # Never a bare `supabase status`: it prints the local keys. Only these
      # three names leave this step, into a file no step echoes.
      - name: Write the local stack's env
        run: |
          npx supabase status -o env \
            --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
            --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
            | sed -n -e 's/^SECRET_KEY=/SUPABASE_SECRET_KEY=/p' \
                     -e '/^NEXT_PUBLIC_SUPABASE_\(URL\|PUBLISHABLE_KEY\)=/p' \
            > .env.local
          test "$(cut -d= -f1 .env.local | sort | tr '\n' ' ')" = \
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_URL SUPABASE_SECRET_KEY "
```

#### 2. The workflow's comments

**File**: `.github/workflows/ci.yml`

**Intent**: Keep the comments true now that a second build runs and `supabase/**` feeds a job.

**Contract**:
- The build-once comment above `verify` (`:53-54`) says:
  - `verify` has no build;
  - `e2e` builds its own copy with the local stack's values, which cannot be shipped because `NEXT_PUBLIC_*` values are inlined;
  - the shipped build runs once, inside `vercel build`.
- The `supabase/**` comment (`:7-10`) says:
  - the `e2e` job consumes `supabase/migrations/`, `seed.sql` and `config.toml`;
  - a push touching only `supabase/**` still skips `ci.yml` by decision: `database-tests.yml` runs `npm test`, and the E2E test runs on the next push that runs `ci.yml`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm test` pass
- `.github/workflows/ci.yml` parses as YAML (js-yaml from `node_modules`) and `jobs.deploy.needs` lists `verify` and `e2e`
- The env step's pipeline, run locally into a scratch file outside the repository, yields exactly the three names (checked by name only), and `process.loadEnvFile` on that file gives values with no surrounding quote (boolean check)
- Credentials generated locally the way the per-run step generates them, loaded with the scratch file's values into the environment, create and delete an account through `npm run e2e:account` without printing a credential

#### Manual Verification:

- A pull request carrying this phase runs `e2e` green; the job time and its stack-start, reset, build and test step times are recorded in `change.md` Notes
- The `e2e` job log holds no `sb_secret_`, `sb_publishable_` or `eyJ` string (GitHub log search)
- A pull request whose only change is a deliberate break the main-flow test catches turns `e2e` red, `deploy` never starts (no preview comment), and its `playwright-report` artifact holds the failure's trace or screenshot; the branch is deleted afterwards
- After the merge to `main`, the push runs `verify` and `e2e` green and the production deploy goes ahead

**Implementation Note**: Pushing a branch and opening a pull request are outward-facing. The agent pushes only with Tomasz's go-ahead, and Tomasz opens the pull requests in the GitHub UI (`gh` is not signed in).

---

## Phase 4: Cookbook and Rules-File Facts

### Overview

**Executor: `/10x-implement`.** Records the E2E pattern in test-plan §6.5 and §6.6, and the new facts in CLAUDE.md.

### Changes Required:

#### 1. Test-plan cookbook

**File**: `context/foundation/test-plan.md` (§6.5 and §6.6 only)

**Intent**: Replace §6.5's "TBD" with how to add to the E2E test, and add a dated Phase 5 note to §6.6.

**Contract**: §6.5 covers:
- **Where.** `tests/e2e/`, one test per file.
- **The pattern:**
  - a fresh account per attempt through `scripts/e2e/accounts.mts`;
  - the test's own sign-in when it signs out;
  - self-seeding from `/`, asserting behaviour over layout;
  - the phrase path, because the server under test has no RAWG key;
  - deliberate breaks, and no residue.
- **Run.**
  - `npx playwright test`, with port 3000 free or `E2E_PORT` set;
  - local data may be the production snapshot;
  - `npm run e2e:account` restores the E2E user after `npm run local:reset`.
- **CI.** The `e2e` job, `deploy`'s dependency on it, flaky passes failing, and the report artifact.
- **Known gaps.** Pushes touching only `supabase/**` skip E2E, and the CI build is separate from the shipped one.

§6.6 records what Phase 5 taught, the measured CI time included.

#### 2. Rules-file facts

**File**: `CLAUDE.md`

**Intent**: State the new gate and the new commands that load `.env.local`.

**Contract**:
- **Verification**: a bullet saying `ci.yml`'s `e2e` job runs Playwright against a local stack in the runner, and `deploy` needs `verify` and `e2e`.
- **Secrets**: the sanctioned list gains `npm run e2e:account` (`--env-file-if-exists=.env.local`) and `npx playwright test` (`playwright.config.ts` loads `.env.local` through `process.loadEnvFile`).
- **Local stack**: a line saying the `e2e` job runs `local:start` and `local:reset` inside the runner.

#### 3. Change notes

**File**: `context/changes/testing-main-flow-end-to-end/change.md`

**Intent**: Keep the decisions, the measured times and every departure from this plan in one place (lessons.md).

**Contract**: The Notes section, dated entries.

### Success Criteria:

#### Automated Verification:

- `npm run format:check` passes
- Test-plan §6.5 no longer reads "TBD", and CLAUDE.md's Secrets list names `npm run e2e:account` and `npx playwright test` (grep)

#### Manual Verification:

- Tomasz reads §6.5 and the new CLAUDE.md lines and confirms they match how he runs the test

---

## Testing Strategy

### Unit Tests:

- `refuseE2eTarget`: hosted refused with either URL, non-loopback refused, local loopback passes.
- Account module: the password generator meets the app's sign-up rule over many samples; emails are unique; the client factory refuses before any request.

### Integration Tests:

- The main-flow spec (Phase 2) against the local stack, with a real browser, real Auth and a real database. Deliberate breaks prove that steps 6 and 9 protect something.
- The CI job (Phase 3): a green PR run, and a red PR run where `deploy` never starts.

### Manual Testing Steps:

1. Watch one headed local run of the main-flow spec.
2. Open a PR with this change and confirm `e2e` is green and `deploy` waited for it.
3. Open a PR with a deliberate break and confirm `deploy` never starts.
4. Search the `e2e` job log for key prefixes.

## Performance Considerations

- The `e2e` job runs alongside `verify`, so `deploy` waits for the longer of the two.
- Estimated at 6–10 minutes: a stack start of about 80–100 s per setup-cli's runs, plus `npm ci`, `local:reset`, the chromium install, `next build` and the test. The first PR run measures it (3.5).
- The repository is private, with 2000 free Actions minutes a month, and `collect.yml` already runs every four hours. Record the measured job time in `change.md` so the budget can be checked.

## Migration Notes

- No schema change and no migration.
- Local data is untouched: the account module creates and deletes only its own accounts, and the agent never runs `npm run local:reset` locally.

## References

- Research: `context/changes/testing-main-flow-end-to-end/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (risks #1, #4, #6), §3 Phase 5, §5 (e2e gate), §6.5
- E2E setup: `context/foundation/test-stack.md`, `playwright.config.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/seed.spec.ts`
- Skills: `.claude/skills/10x-e2e/SKILL.md`, `.claude/skills/10x-implement/SKILL.md`
- Secret-key client pattern: `scripts/collector/supabase.mts:28-58`
- Screened stack wrappers: `scripts/local/start.mts`, `scripts/local/reset.mts`, `scripts/local/commands.mts:22-64`
- Prior local-stack work: `context/changes/local-supabase-stack/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Gate Settings and Test Accounts

#### Automated

- [x] 1.1 `npm test` passes, including the new rows in `tests/unit/env/supabase-target.test.ts` and `tests/unit/e2e/accounts.test.ts` — 542edbe
- [x] 1.2 `npm run lint` and `npm run format:check` pass — 542edbe
- [x] 1.3 `npx tsc --noEmit` passes — 542edbe
- [x] 1.4 `npx playwright test` stays green locally (setup + seed) under the new settings, with port 3000 free — 542edbe
- [x] 1.5 `npm run e2e:account -- create`, then `-- delete`, with a throwaway `E2E_USERNAME`/`E2E_PASSWORD` set in the command's environment (password generated in a subshell, never echoed), creates and removes a local account and prints no credential; a repeated `-- delete` reports nothing to delete — 542edbe
- [x] 1.6 With `SUPABASE_TARGET=hosted` in the command's environment, `npm run e2e:account -- create` exits 1 with the refusal before any request — 542edbe

### Phase 2: Main-Flow E2E Test

#### Automated

- [x] 2.1 Exploring the E2E build, a `/watchlist` search shows „Katalog gier jest chwilowo niedostępny” and the phrase offer — the server under test holds no RAWG key
- [x] 2.2 `npx playwright test tests/e2e/main-flow.spec.ts` passes on the local stack as it stands (snapshot data if loaded), with port 3000 free
- [x] 2.3 `npx playwright test tests/e2e/main-flow.spec.ts --repeat-each=3` passes — parallel attempts on separate accounts do not collide
- [x] 2.4 Deliberate break: `/my-deals` reading no rows turns the spec red at the deal assertion; the break is reverted
- [x] 2.5 Deliberate break: a sign-out that leaves the server session alive turns the spec red at the replayed-cookies assertion; the break is reverted
- [x] 2.6 No test account remains in the local stack after the green runs and after each red run
- [x] 2.7 The spec passes review against the five anti-patterns in `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`
- [x] 2.8 `npx playwright test` (setup, seed and main flow) passes, and `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass

#### Manual

- [x] 2.9 Tomasz watches one headed run (`npx playwright test tests/e2e/main-flow.spec.ts --headed`) and confirms it walks the PRD's main flow

### Phase 3: E2E Job in CI

#### Automated

- [ ] 3.1 `npm run lint`, `npm run format:check` and `npm test` pass
- [ ] 3.2 `.github/workflows/ci.yml` parses as YAML (js-yaml from `node_modules`) and `jobs.deploy.needs` lists `verify` and `e2e`
- [ ] 3.3 The env step's pipeline, run locally into a scratch file outside the repository, yields exactly the three names (checked by name only), and `process.loadEnvFile` on that file gives values with no surrounding quote (boolean check)
- [ ] 3.4 Credentials generated locally the way the per-run step generates them, loaded with the scratch file's values into the environment, create and delete an account through `npm run e2e:account` without printing a credential

#### Manual

- [ ] 3.5 A pull request carrying this phase runs `e2e` green; the job time and its stack-start, reset, build and test step times are recorded in `change.md` Notes
- [ ] 3.6 The `e2e` job log holds no `sb_secret_`, `sb_publishable_` or `eyJ` string (GitHub log search)
- [ ] 3.7 A pull request whose only change is a deliberate break the main-flow test catches turns `e2e` red, `deploy` never starts (no preview comment), and its `playwright-report` artifact holds the failure's trace or screenshot; the branch is deleted afterwards
- [ ] 3.8 After the merge to `main`, the push runs `verify` and `e2e` green and the production deploy goes ahead

### Phase 4: Cookbook and Rules-File Facts

#### Automated

- [ ] 4.1 `npm run format:check` passes
- [ ] 4.2 Test-plan §6.5 no longer reads "TBD", and CLAUDE.md's Secrets list names `npm run e2e:account` and `npx playwright test` (grep)

#### Manual

- [ ] 4.3 Tomasz reads §6.5 and the new CLAUDE.md lines and confirms they match how he runs the test
