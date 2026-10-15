---
date: 2026-10-14T18:00:29+02:00
researcher: tkedz
git_commit: 2d6f628af1e3dd51db7123eb45e2b40d091246e2
branch: main
repository: 10x-physical-games-deals
topic: "Running the main-flow E2E test as the CI gate of test-plan §5: the local Supabase stack in GitHub Actions, the env for build and start, the test user, the job's place in ci.yml, and what seed.sql alone gives the flow"
tags: [research, testing, e2e, playwright, ci, github-actions, supabase-local-stack, seed]
status: complete
last_updated: 2026-10-14
last_updated_by: tkedz
---

# Research: The main-flow E2E test as a CI gate

**Date**: 2026-10-14T18:00:29+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 2d6f628af1e3dd51db7123eb45e2b40d091246e2 (`context/foundation/test-plan.md` and this change folder are uncommitted)
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

Ground rollout Phase 5 of `context/foundation/test-plan.md` ("Main flow end to end": guest redirect, sign-in, empty state, a watched phrase reaching `/my-deals` with price and link, removal, sign-out). Its §5 gate "e2e on the main flow" is "required after §3 Phase 5" and runs in "CI (environment chosen in §3 Phase 5)" (`test-plan.md:155`).

First, briefly verify an earlier exploration's findings about the test itself: RAWG called server-side and the phrase offer under a catalogue failure, soft removal, sign-out scope, the E2E infrastructure of commit 2d6f628, and the local-only target. Then answer:

1. How to run the local Supabase stack in GitHub Actions: CLI setup, `supabase start` with the exclusions `scripts/local/start.mts` uses, Docker on ubuntu runners, the time it adds, applying `supabase/migrations/` and `supabase/seed.sql` (CI has no `snapshot.sql`).
2. The env for `next build` + `next start` without `.env.local`: the local stack's URL and publishable key (fixed or generated per start, and how to pass them on without printing anything secret), `RAWG_API_KEY` unset, and what `playwright.config.ts` and `refuseSupabaseTarget` accept.
3. The test user in CI: how to create it before the setup project runs, and where `E2E_USERNAME` / `E2E_PASSWORD` come from.
4. Where the job sits in `.github/workflows/ci.yml` relative to `verify` and `deploy`; the runtime it adds; Playwright browser install and caching; the report and traces kept on failure.
5. What self-seeding from `/` finds with `seed.sql` alone (D1, D2), and whether that is enough for the flow.

Constraint: `context/foundation/lessons.md`. Each credential and command is proven locally against the exact CI invocation before it enters a workflow, and a gate must fail on every breach.

## Summary

1. **The earlier findings hold, but they were never recorded.** `change.md`'s Notes hold only the template comment (`change.md:12`). Each of the six points was checked against the code, and each is supported (table under Detailed Findings §0).

2. **The local stack runs in Actions with the repository's own CLI and no extra setup.**
   - `npm ci` installs CLI 2.117.0 with its linux-x64 binary from the lockfile (`package-lock.json:2452-2458`). The `supabase` package's `scripts` hold no `install`, `preinstall` or `postinstall` entry (`node_modules/supabase/package.json`).
   - `ubuntu-latest` (ubuntu-24.04) has Docker preinstalled (runner-images `Ubuntu2404-Readme.md:74-78`, image 20261004).
   - On a fresh volume, which every job on a GitHub-hosted runner starts with, `supabase start` applies `supabase/migrations/`. It skips the seed while `[db.seed]` is disabled (`supabase/config.toml:65`; CLI v2.117.0 `legacy-seed.ts:85`).
   - One estimate of the start time, not measured for this repository: about 80–100 s for a full start on ubuntu-latest. That figure comes from setup-cli's own E2E job (runs 38543810042, 38497119547, 38378372501). The local first run took 227 s on Windows, image pulls included (`context/changes/local-supabase-stack/research.md:36`).

3. **The keys are fixed defaults, but a bare `supabase start` prints them into the job log.**
   - The local publishable and secret keys are constants embedded in the CLI. A boolean-only check found them in the local binary (`local-supabase-stack/research.md:102-104`), and CLI v2.117.0 source defines them (`apps/cli-go/pkg/config/apikeys.go:16-21`).
   - In CI, `start` prints its status table on stdout, the Publishable and Secret rows and the DB URL included. This holds unless a coding agent is detected or `--output-format json` is passed (v2.117.0 `shared/cli/agent-output.ts:159-171`, start `SIDE_EFFECTS.md:244-276`).
   - `npm run local:start` screens that output. It works on Linux as it is, but its arguments are pinned by a unit test (`tests/unit/local/commands.test.ts:214-221`).
   - `supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` emits the app's two names. This was verified on the installed 2.117.0, with names printed only.

4. **Both `NEXT_PUBLIC_*` values must be set before `next build`, and there are two ways to pass them on unprinted.**
   - `next build` makes no Supabase request, as of the last local build. `/`, `/my-deals` and `/watchlist` are dynamic: that build prerendered only `/_global-error /_not-found /favicon.ico /kitchen-sink /login /signup` (`.next/prerender-manifest.json`, built 2026-10-14 15:56). The one commit since, 2d6f628, changed no file under `src/`.
   - But `NEXT_PUBLIC_*` values are frozen at build time (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:158-166`).
   - Route (a): write the two lines to `.env.local` in the CI workspace. `playwright.config.ts:11` and `next build` (`environment-variables.md:266-274`) both read it, and nothing is printed.
   - Route (b): append them to `$GITHUB_ENV`. Then each later `run:` step's log header lists them in plain text, unless each value was first passed to `::add-mask::` (actions/runner `main`@796cc18 `ScriptHandler.cs:128-135`).
   - With `RAWG_API_KEY` unset, the catalogue search returns "misconfigured" before any fetch, and the phrase offer still renders (`src/lib/watchlist/catalog.ts:39-44`; `src/components/watchlist/search-results.tsx:69-77`).

5. **The test user can be created with the publishable key alone.**
   - With `enable_confirmations = false` (`supabase/config.toml:232`), the app's own `/signup` form signs the new user in and lands on `/` (`src/components/auth/sign-up-form.tsx:55,76`). The same `POST /auth/v1/signup` is reachable without the browser (`@supabase/auth-js` `GoTrueClient.js:528`).
   - The admin API would need the local secret key in the job, and no script in the repository calls it.
   - In CI the stack is new on every run, so `E2E_USERNAME` / `E2E_PASSWORD` can be per-run values. They are not production credentials.

6. **The test's design has two traps.**
   - Sign-out uses `scope: "local"` (`src/components/auth/sign-out-button.tsx:30`), which ends that session on the server, per Supabase Auth docs (not observed in this repository). A main-flow test that signs out with the shared `playwright/.auth/user.json` session would then leave a dead session for its own retry and for later tests.
   - Removal is soft: it sets `removed_at`, so a removed phrase never blocks adding it again. But an attempt that adds the phrase and fails before removing it leaves an active entry, and that entry breaks the retry's empty-state step.

7. **The gate has a hole as configured.**
   - `retries: 2` in CI (`playwright.config.ts:37`) without `failOnFlakyTests` means a test that fails and then passes on retry exits 0. The option exists in the installed 1.64.1 (`node_modules/playwright/types/test.d.ts:1307-1324`).
   - "No tests found" already fails by default (`node_modules/playwright/lib/runner/index.js:6665-6674`).

8. **Job placement is a planning choice.** `deploy` must need the E2E job either way. Two facts bear on it:
   - The job adds a second `next build` to every pipeline run that reaches it, contrary to the comment at `ci.yml:53-54`. That build cannot be shared with the deploy, because the deploy's build inlines different `NEXT_PUBLIC_*` values.
   - `paths-ignore: supabase/**` (`ci.yml:31,40`) means a push whose changed files all sit under `supabase/` (a migration or `seed.sql`, say) runs no job of `ci.yml`, the E2E job included.

9. **`seed.sql` alone is enough for the flow.**
   - `/` lists exactly D1 then D2 (`tests/db/seed.test.ts:6-12` pins it).
   - A phrase made from either whole title, or "silksong", matches one deal. A shared word such as „pudełkowa” matches both, because phrase matching is a substring test on folded text (`supabase/migrations/20261013145356_hide_expired_deals.sql:42`).

## Detailed Findings

### 0. The earlier exploration, verified

The request said `change.md`'s Notes record a 2026-10-14 exploration. They do not: `context/changes/testing-main-flow-end-to-end/change.md:12` is the `/10x-new` template comment. Each finding was checked on its own:

| Claim | Verdict | Evidence |
|---|---|---|
| RAWG is called server-side | supported | `src/lib/watchlist/catalog.ts:21` imports `server-only`; `searchCatalog` (`:36-51`) is called only from the async Server Component in `src/components/watchlist/search-results.tsx:64`; the fetch is `src/lib/catalog/rawg.ts:131` |
| The phrase offer survives a catalogue failure, `RAWG_API_KEY` unset included | supported | `readRawgApiKey` throws on unset or `""` (`rawg.ts:36-44`), `searchCatalog` returns `{ok:false, reason:"misconfigured"}` before any fetch (`catalog.ts:39-44`) and logs `Searching the game catalogue failed: misconfigured, status none` (`:58-60`); the UI shows „Katalog gier jest chwilowo niedostępny” (`search-results.tsx:216`) and the `PhraseOffer` button `Obserwuj frazę „${phrase}”` (`src/components/watchlist/phrase-offer.tsx:56-58`) |
| Removal is soft | supported | `removed_at` column, partial unique indexes `where removed_at is null`, `grant update (removed_at)` only, no delete grant (`supabase/migrations/20261007141021_create_watchlist_entries.sql:18,33-39,47-55`); `markEntryRemoved` sets `removed_at` (`src/lib/watchlist/queries.ts:202-216`) |
| Sign-out scope | supported: `local` | `src/components/auth/sign-out-button.tsx:30`, then `router.push("/")` and `router.refresh()` (`:40-41`) |
| E2E infrastructure in 2d6f628 | supported | `playwright.config.ts`, `tests/e2e/auth.setup.ts` (signs in at `/login` with `E2E_USERNAME`/`E2E_PASSWORD`, saves `playwright/.auth/user.json`), `tests/e2e/seed.spec.ts`, `context/foundation/test-stack.md` (`git show --stat 2d6f628`) |
| Local-only target | supported | `playwright.config.ts:17-24` refuses `SUPABASE_TARGET=hosted` outright, then applies `refuseSupabaseTarget` (`src/lib/env/supabase-target.ts:61-85`; loopback hosts `127.0.0.1`, `localhost`, `[::1]` at `:27-31`) |

### 1. The local Supabase stack in GitHub Actions

**CLI setup.**
- The repository pins `supabase` `^2.117.0` as a devDependency. The lockfile carries `@supabase/cli-linux-x64` 2.117.0 as an optional dependency (`package-lock.json:2452-2458`), although the lockfile was written on Windows.
- The package's `bin` is a JS shim, `dist/supabase.js`, that resolves the platform package. Its `scripts` hold build and test entries and no install hook (`node_modules/supabase/package.json`).
- So `npm ci` is the whole setup, provided the job does not pass `--omit=optional`, which would drop the binary.
- Supabase's CI guides use `supabase/setup-cli@v1` with `version: latest` (supabase.com/docs/guides/deployment/ci/testing). That is unpinned and would diverge from the lockfile.
- The setup-cli README has moved to `@v3`. With no `version` input, v3 reads the version from `package-lock.json` (setup-cli README:25-39, 100-102). Neither is needed when the job runs `npm ci`.

**Docker and psql on the runner.**
- `ubuntu-latest` is ubuntu-24.04 (runner-images `README.md:25`). It ships Docker 28.0.4 and Compose 2.38.2 (`Ubuntu2404-Readme.md:74-78`).
- PostgreSQL 16 is installed with its service disabled (`:172-177`). A `psql` 16 client is inferred from the package's dependency (`scripts/build/install-postgresql.sh:23`); the readme does not list `psql`.

**What `start` does on a fresh volume (CLI v2.117.0 source).**
- It runs the schema setup, then the pending `supabase/migrations/*.sql`, then the seed, gated on `db.migrations.enabled` and `db.seed.enabled` (`apps/cli/src/commands/start/SIDE_EFFECTS.md:24-44,88`; `command-internal/legacy-migrate-and-seed.ts:79-99`; `legacy-seed.ts:85`).
- `[db.migrations] enabled = true` here. `[db.seed]` is disabled on purpose (`supabase/config.toml:65`, comment in `supabase/seed.sql:5-9`), so a plain start loads no seed.

**Exclusions.**
- The installed CLI accepts `-x` for `gotrue, realtime, storage-api, imgproxy, kong, mailpit, postgrest, postgres-meta, studio, edge-runtime, logflare, vector, supavisor` (`npx supabase start --help`).
- `scripts/local/commands.mts:22-37` excludes seven of them. The E2E test needs `kong` (the gateway at port 54321), `gotrue` and `postgrest`; each has its own switch (v2.117.0 `start.gates.ts`).
- `studio`, `postgres-meta` and `mailpit` can also go. Kong's routes to them then answer 502, and GoTrue's SMTP still points at Mailpit, so any auth email would fail at send time (`templates/kong.yml.ts:211,242`; `start.handler.ts:258-303`). With `enable_confirmations = false`, sign-up and sign-in send none.
- Dropping them from `npm run local:start` changes `START_ARGS`, which `tests/unit/local/commands.test.ts:214-221` pins.
- Per the prior sizing pass, the running set is ≈ 4.3 GB of images, or ≈ 2.1 GB without Studio and postgres-meta (`local-supabase-stack/research.md:89-91`). Excluded realtime and storage images were still pulled there (`:77`).

**Time (estimates only, not measured for this repository).**
- Setup-cli's own E2E job runs a full start with no exclusions on ubuntu-latest. Its start step took 82, 93 and 99 s in three runs on 13–14 Oct 2026.
- supabase/cli PR #4394 (concurrent image pulls) reports a cold start falling from about 2:43 to about 1:30.
- Neither Supabase's docs nor setup-cli cache Docker images.
- The only comparison found is a third-party one (Classmethod blog), where `actions/cache` + `docker load` cost about what it saved.
- The first CI run measures the real number.

**Loading `seed.sql` (CI has no snapshot: `supabase/.gitignore:4-7`).** Three routes, none yet executed in CI:

| Route | How | Evidence | Cost or risk |
|---|---|---|---|
| Seed on start | `SUPABASE_DB_SEED_ENABLED=true` in the start step's env; config's `sql_paths = ["./seed.sql"]` (`config.toml:76`) applies | `db.seed.enabled` is env-overridable (v2.117.0 `legacy-db-config.toml-read.ts:304-321,2317-2327`); the string is in the local binary; `scripts/local/cli.mts` spawns with the inherited environment | Source only, not observed. One pass, no extra restart |
| `psql` after start | `psql <default local DB URL> -v ON_ERROR_STOP=1 -f supabase/seed.sql` | Default DB URL documented in status `SIDE_EFFECTS.md:178,223`; `seed.sql` has no meta-commands | `psql` on the runner is inferred. Without `ON_ERROR_STOP`, psql exits 0 on SQL errors, so the seed step would not fail on a broken seed |
| `db reset` | `supabase db reset --local --sql-paths ./seed.sql`, as `resetArgs` builds (`scripts/local/commands.mts:54-64`) | Proven locally by `npm run local:reset` | Recreates the DB container and reruns every migration (reset `SIDE_EFFECTS.md:54-69,91-116`). Slowest |

The seed's freshness rows use `now()` (`supabase/seed.sql:117-121`), so the freshness line is fresh for six hours after any of these.

### 2. The env for `next build` + `next start` in CI

**What the app reads** (inventory of `process.env` under `src/` and `next.config.ts`):
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are read by the three Supabase clients (`src/utils/supabase/client.ts:9-10`, `server.ts:14-15`, `session.ts:27-28`).
  - Unset at build time: the browser bundle gets `undefined`, and sign-in, sign-up and sign-out end in the generic „Coś poszło nie tak. Spróbuj ponownie.”
  - Unset at runtime as well: the proxy's `createServerClient` throws on every request its matcher covers.
- `RAWG_API_KEY` (`src/lib/watchlist/catalog.ts:41`) is optional. Unset, it gives the deterministic misconfigured path above.
- No file under `src/` reads `SUPABASE_SECRET_KEY` or `OPENROUTER_API_KEY`. The first is read in `scripts/collector/supabase.mts:30`, the second in the extract scripts.
- `next.config.ts:14-28` checks the target under `next dev` only. There is no env schema and no instrumentation file.
- `next build` fetches Geist through `next/font/google` (`src/app/layout.tsx:2`), so the build needs network access.

**Build time vs runtime.**
- `NEXT_PUBLIC_*` values come "from the environment in which you run `next build`" and are frozen after it (`environment-variables.md:164-166`).
- Load order: `process.env`, then `.env.$(NODE_ENV).local`, then `.env.local`, then `.env.$(NODE_ENV)`, then `.env` (`:266-274`).
- `.env.local` is skipped when `NODE_ENV` is `test` (`:272`). `NODE_ENV` defaults to `production` for every command except `next dev` (`:283`).
- The stack need not be up during the build: the three data routes are dynamic (Summary item 4). It must be up before the tests run.
- Playwright's readiness probe on `/` passes even with the stack down. There is no session cookie, and the deals read fails inline into „Nie udało się wczytać okazji”. A dead stack therefore surfaces as a test failure, not a webServer timeout.

**What the guards accept.**
- `playwright.config.ts` throws at load time on any of these:
  - `SUPABASE_TARGET=hosted` (`:17-19`)
  - a missing or non-http(s) `NEXT_PUBLIC_SUPABASE_URL`
  - a non-loopback host while the target is unset or `local` (`supabase-target.ts:61-85`)
- The stack's API URL is on loopback port 54321 (`supabase/config.toml:10`), so it passes with `SUPABASE_TARGET` unset.
- `collect.yml` sets `SUPABASE_TARGET: hosted` on its own steps only. That is another workflow, so it cannot leak into `ci.yml`.

**Fixed keys, still treated as secrets.**
- CLI v2.117.0 defines the publishable and secret keys as constants (`apps/cli-go/pkg/config/apikeys.go:16-21,43-73`; TS twin `packages/stack/src/JwtGenerator.ts:5-9`).
- The legacy JWTs are HS256 over fixed claims (`legacy-go-jwt.ts:86-96`).
- `[auth]` keys or `SUPABASE_AUTH_*` variables would override them (status `SIDE_EFFECTS.md:57-61,379-383`). `config.toml` sets none.
- CLAUDE.md (Secrets) forbids printing any secret regardless, so the workflow must keep them out of the log.

**Passing them on without printing.**
- **Never a bare `supabase start` step.** It prints the keys (Summary item 3). `npm run local:start` prints only the API and Studio URLs and screens stderr (`scripts/local/start.mts:29-42`, `commands.mts` `screenLine`). It needs Node 24, which `setup-node` with `.nvmrc` gives.
- **The export.** `npx supabase status -o env --override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` emits those two names. It also emits `ANON_KEY`, `DB_URL`, `JWT_SECRET`, `SECRET_KEY`, `SERVICE_ROLE_KEY` and URL lines, plus `LINKED_*` on a linked checkout (verified on 2.117.0, names only).
  - Its values are written as `KEY="VALUE"` (status `SIDE_EFFECTS.md:207`).
  - Only the two `NEXT_PUBLIC_` lines should leave the step, selected by name, with stdout never echoed.
- **Route (a), `.env.local` in the workspace.**
  - `playwright.config.ts:11` calls `process.loadEnvFile(".env.local")` when the file exists, and `next build` reads it.
  - Nothing reaches the log and no mask is needed. The setup-cli README does the same with `>> .env.test` (README:138-152).
  - Unverified: that Node's `loadEnvFile` strips the double quotes. The local dry run settles it.
  - `upload-artifact` skips hidden files by default, and the report path does not include the workspace root.
- **Route (b), `$GITHUB_ENV`.**
  - A value written there enters the env context, and each later `run:` step prints `env:` with every `KEY: value` in its collapsible header (actions/runner `main`@796cc18 `FileCommandManager.cs:209-210`, `Handlers/ScriptHandler.cs:128-135`).
  - Writing to `$GITHUB_ENV` registers no mask. A value appears as `***` there only if it was registered with `::add-mask::` before the write, or is already a known secret such as a `secrets.*` value. GitHub's docs: "register the secret with 'add-mask' before outputting it" and "once per value per job" (docs.github.com, workflow commands, "Masking a value in a log").
  - The parser does not strip quotes (`FileCommandManager.cs:391-405`), so the `-o env` quotes would land in the values.
  - No GitHub doc sentence covers the `env:` header itself; this rests on the runner source.

### 3. The test user in CI

**Constraints.**
- `tests/e2e/auth.setup.ts:6-11` throws unless `E2E_USERNAME` and `E2E_PASSWORD` are set. Its message names `.env.local`.
- It signs in at `/login` and expects `/` and „Wyloguj się” (`:33-34`).
- Local Auth: `enable_signup = true` (`supabase/config.toml:181`), `minimum_password_length = 8` (`:187`), `password_requirements = "lower_upper_letters_digits_symbols"` (`:190`), `enable_confirmations = false` (`:232`), `sign_in_sign_ups = 30` per 5 minutes per IP (`:212`).
- The app mirrors the password rule, plus at most 72 UTF-8 bytes (`src/lib/auth/credentials.ts:28-33,48-66`).

| Option | Credential the job needs | Evidence | Notes |
|---|---|---|---|
| UI sign-up at `/signup`, in a setup step or the test | publishable key only (already in the build) | `sign-up-form.tsx:55` calls `auth.signUp` in the browser; with a session it goes to `/` (`:76`); labels „E-mail”, „Hasło”, „Powtórz hasło”, button „Załóż konto” | `getByLabel("Hasło")` also matches „Powtórz hasło” without `exact: true`. The form needs the same hydration wait as sign-in (`auth.setup.ts:16-25`). An existing account gives „Konto z tym adresem już istnieje. Zaloguj się.” (`credentials.ts:122`) |
| GoTrue sign-up over HTTP before Playwright | publishable key only | `POST ${url}/signup`, which supabase-js uses (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:528`) | No browser. A script or `curl` that prints only the status code |
| Admin API `auth.admin.createUser({ …, email_confirm: true })` | local secret key | Nothing in the repository calls it; `createCollectorClient()` (`scripts/collector/supabase.mts:28-58`) gives a guarded secret-key client | Puts a second key into the job for no gain while sign-up is open |
| SQL insert into `auth.users` | DB URL | Existing inserts are id-only stubs that cannot sign in (`tests/db/stub/supabase-prelude.sql:49`, `supabase/checks/matching.sql:72-73`) | Depends on GoTrue's internal schema |

**Where the credentials come from.**
- The CI stack is created and destroyed within the job, so the account cannot reach production or outlive the run.
- The values can be per-run (an address on the domain the local user already uses, and a password that meets the rule above). They can go into the same workspace `.env.local` as route (a), or be masked first in `$GITHUB_ENV`.
- Unverified: whether local GoTrue accepts every email domain. The domain of the existing local E2E user is not known to this research; it lives in `.env.local`, which agents do not read.

**Interplay with the flow.**
- Sign-out with `scope: "local"` ends the session on the server (`sign-out-button.tsx:30`). Per Supabase Auth docs (Context7 `supabase/auth`), a later `getUser` with that session answers `session_not_found`. This was not observed in this repository.
- So the main-flow test should not sign out with the shared `storageState`. It needs its own sign-in with empty storage, as `tests/e2e/seed.spec.ts:8` opts out of the saved session.
- Signing in inside the test is also step 2 of the flow.

### 4. The job in `ci.yml`

**Today.**
- `verify` runs `npm ci`, lint, format check and `npm test` (`ci.yml:55-68`). `deploy` has `needs: verify` (`:71`) and builds inside `vercel build` (`:112`).
- `concurrency` cancels a superseded run (`:47`).
- `paths-ignore` lists `supabase/**` for push and pull_request (`:31,40`). Its rationale is that the directory is "inert only while nothing under it feeds the Next build" (`:7`).
- No prior change inspected branch protection ("Branch protection was not checked; `gh` is not signed in.", `testing-matching-rule-protection/research.md:331`), and this research did not either. A required check that a `paths-ignore`d PR never reports would sit Pending (`ci.yml:17-19`).

**Placement facts for the plan.**
- **Gating.** `deploy` must list the E2E job in `needs` for the gate to hold. With `needs: verify` the E2E time is added in series. Running it alongside `verify`, with `deploy` needing both, bounds the wall clock by the longer job, but spends minutes on runs that lint already fails.
- **The build-once comment.** The E2E job runs its own `next build` through `webServer` (`playwright.config.ts:61`). `ci.yml:53-54` then no longer holds, and that build cannot be reused for the deploy, because `NEXT_PUBLIC_*` values are inlined (`environment-variables.md:164-166`).
- **Migration-only pushes.** A push touching only `supabase/**` runs `database-tests.yml` (`npm test`) and no E2E test, even though the E2E test now consumes `supabase/migrations/` and `supabase/seed.sql`. Whether `database-tests.yml` also runs it is a planning choice.
- **Actions minutes.** The repository is private, with 2000 free Actions minutes a month (`context/deployment/deploy-plan.md:36`). It is the only Actions-minutes concern a search of `context/**` found.

**Browser install and caching (Playwright 1.64 docs, `release-1.64` sources).**
- Install only what runs: `npx playwright install chromium --with-deps` (playwright.dev/docs/best-practices, `best-practices-js.md:487-498`).
- `--only-shell` installs just the headless shell when no `channel` is set (`browsers.md:345-349`). `devices["Desktop Chrome"]` sets none (`node_modules/playwright-core/lib/coreBundle.js:31049-31062`). Combining `--only-shell` with the `chromium` argument is inferred, not documented.
- Caching browsers "is not recommended, since the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries", and Linux OS dependencies are not cacheable (`ci.md:1006-1010`, playwright.dev/docs/ci#caching-browsers).
- Next's own CI cache is `.next/cache` with `actions/cache`, keyed on `package-lock.json` and source hashes (`node_modules/next/dist/docs/01-app/02-guides/ci-build-caching.md:73-89`). It is optional.

**Report and traces.**
- Playwright's GitHub Actions example uploads `playwright-report/` under `if: ${{ !cancelled() }}` with `retention-days: 30` (`ci.md:112-117`). That page uses `upload-artifact@v5`; the action's README shows `@v7` as of 2026-10-14.
- `!cancelled()` rather than `failure()`: while flaky passes exit 0, `failure()` skips the upload on one, although its first retry holds a trace.
- The HTML report copies each attachment that has a path (traces, screenshots) into `playwright-report/data/` (`node_modules/playwright/lib/runner/index.js:3978-3986`), so that folder alone suffices. `test-results/` helps only if the reporter never ran.
- With `trace: "on-first-retry"` and `retries: 2`, tracing starts only when `retry === 1` (`node_modules/playwright/lib/worker/workerProcessEntry.js:550`). A test failing all three attempts keeps exactly one trace.
- `screenshot: "only-on-failure"` saves one per failed attempt.
- A trace's Network tab holds request and response bodies (`trace-viewer.md:760`). So a traced `setup` retry would carry the sign-in body and token responses into the artifact.
  - In CI those belong to the throwaway account of a destroyed stack.
  - `playwright/.auth/` is outside the upload path, and `upload-artifact` excludes hidden files by default.

**Gate strength (lessons.md: "A gate that exits 0 on warnings is not a gate").**
- A flaky pass exits 0 today (Summary item 7). `failOnFlakyTests: !!process.env.CI` or `--fail-on-flaky-tests` closes it (`test.d.ts:1307-1324`, `program.js:194`).
- `forbidOnly` is already on in CI (`playwright.config.ts:36`).
- `webServer` failures fail the run:
  - A build that exits non-zero reports `Process from config.webServer was not able to start. Exit code: N` at once (`runner/index.js:897`).
  - A server that never answers reports `Timed out waiting 180000ms from config.webServer.` (`:954`).
  - The 180 s covers build and start together (`playwright.config.ts:61,64`).
- The `webServer` default `stdout: "ignore"` hides `next build` output (`runner/index.js:909`; `class-testconfig.md:729-730`).
- Playwright's CI page advises a `globalTimeout`, plus a job `timeout-minutes` above it, so that a killed job still writes a report (`ci.md:61-78`). The config sets neither.
- Lessons.md also asks to prove the gate by breaking it once on a branch and confirming `deploy` never starts.

**Runtime.** No primary source gives numbers for the chromium install, `next build` or the test itself on this repository. Only the stack start has an estimate (§1). The first CI run measures the total.

### 5. Self-seeding from `/` with `seed.sql` alone

**What `/` lists.**
- With only migrations and the seed, anon lists exactly D1 and D2, newest first (`tests/db/seed.test.ts:6-12`). The page query orders by `published_at` descending, with page size 30 (`src/lib/deals/queries.ts:149-182`).
- D1 („Gra Elden Ring PS5 Pudełkowa”, 129,99 zł, −20%, shop link) is published an hour before the seed runs. D2 („Hollow Knight: Silksong – edycja pudełkowa”, 149,00 zł, post link only) is two hours before (`supabase/seed.sql:94-105`).
- D3 (digital) and D4 (expired) stay hidden.
- Card text: title as `h2`, price via pl-PL formatting, D1's discount „−20%” with U+2212. D1's links are „Przejdź do sklepu” → `https://sklep.example/elden-ring-ps5` and „Zobacz wpis” → the post. D2 has „Zobacz wpis” only. Each accessible name ends in „ (otwiera się w nowej karcie)” (`src/components/deals/deal-card.tsx:24-27,52-56,80-88`; `src/lib/deals/format.ts:50,57`; `src/lib/deals/links.ts:44-55`).
- The price separator before „zł” is probably U+00A0 (unverified).

**How a phrase matches.**
- `strpos(match_text, fold_for_matching(phrase)) > 0` in `public.matched_deals` (`supabase/migrations/20261013145356_hide_expired_deals.sql:42`). It is a substring test on folded text with no word boundaries.
- Folded `match_text` (title | English title): D1 "gra elden ring ps5 pudelkowa | elden ring", D2 "hollow knight silksong edycja pudelkowa | hollow knight silksong" (folding per `20261013115104_fold_nfc_first.sql:30-52`).
- On the seed alone, either whole title matches only its own deal. That is derived from the folded texts above, not executed. „silksong” matches D2 alone, which `tests/db/seed.test.ts:9-10` pins.
- „pudełkowa” matches both. A phrase must be 3–100 characters, or no offer appears (`src/lib/watchlist/rules.ts:67-73`).

**Is it enough for the flow?** On the seed alone, yes, for each step of the Phase 5 goal:

| Step | What it finds |
|---|---|
| Guest redirect | `seed.spec.ts` already covers it |
| Sign-in | The test signs in itself |
| Empty state | A fresh user's `/my-deals` shows „Twoja lista obserwowanych jest pusta” (`src/components/deals/my-deals-section.tsx:174-185`) |
| Watched phrase | Search on `/watchlist` gives the catalogue-failure alert plus `Obserwuj frazę „…”` without `RAWG_API_KEY` |
| Matched deal | The deal reaches `/my-deals` with its price and link |
| Removal | „Usuń” (`watchlist-entry-row.tsx:64`) returns `/my-deals` to the empty state |
| Sign-out | „Wyloguj się” |

Conditions that make it fragile:
- **Leftover active entries.** A retry, or the same user from an earlier failed run, still holds the phrase. The offer then shows the disabled „Ta fraza jest już na liście” (`phrase-offer.tsx:51`), and `/my-deals` skips the empty state. Removed rows never block re-adding (partial unique indexes, `isPhraseOnList` in `rules.ts:203-217`). A fresh user per attempt, or a cleanup step first, avoids this.
- **Shared user with `fullyParallel: true`.** Any other spec adding entries for the same user breaks the empty-state assertion (`playwright.config.ts:35`).
- **Snapshot data locally.** With `supabase/snapshot.sql`, `/` leads with production deals. The first card's title may exceed 100 characters (no offer), or match several deals. Self-seeding then still works if the test takes a title within the limit and asserts that its card is present, not a count.
- **The freshness line** turns stale six hours after the seed ran (`src/lib/deals/freshness.ts:13`). It is not an assertion target.
- **Live RAWG locally.** When `RAWG_API_KEY` is set locally, the search calls RAWG, and `page.route` cannot stub a server-side fetch. Targeting the phrase button by its full name keeps the test independent of the catalogue outcome.

## Code References

- `playwright.config.ts:11,17-24,35-38,45-46,54,61-64` — env loading, target refusal, CI settings, trace/screenshot, storageState, webServer
- `tests/e2e/auth.setup.ts:6-11,16-36` — credential check, hydration wait, sign-in, saved session
- `tests/e2e/seed.spec.ts:8` — opt-out of the saved session
- `src/lib/env/supabase-target.ts:27-31,61-85` — loopback hosts, refusal rules
- `next.config.ts:14-28` — guard under `next dev` only
- `scripts/local/commands.mts:22-37,54-64` — `START_ARGS`, `resetArgs`
- `scripts/local/start.mts:29-42`, `scripts/local/cli.mts` — screened start, spawn with inherited env
- `tests/unit/local/commands.test.ts:214-221` — `START_ARGS` pinned
- `supabase/config.toml:10,65,76,181,187,190,212,232` — API port, seed off, seed path, auth settings
- `supabase/seed.sql:1-35,94-121` — D1–D4 and the run
- `tests/db/seed.test.ts:6-12` — what anon and a phrase see on the seed
- `src/components/auth/sign-out-button.tsx:30,40-41` — `scope: "local"`
- `src/components/auth/sign-up-form.tsx:55,76` — browser `signUp`, landing on `/`
- `src/lib/auth/credentials.ts:28-33,48-66,122` — password rule, duplicate message
- `src/lib/watchlist/catalog.ts:21,36-60` — server-only search, misconfigured path
- `src/components/watchlist/phrase-offer.tsx:41-58` — phrase offer
- `src/lib/deals/queries.ts:149-182` — public list query
- `supabase/migrations/20261013145356_hide_expired_deals.sql:25-43` — `matched_deals`
- `.github/workflows/ci.yml:7,17-19,31,40,47,53-54,71,105,112` — filters, caveats, gate comment, deploy
- `package-lock.json:2452-2458` — linux-x64 CLI binary
- `node_modules/playwright/types/test.d.ts:1307-1324` — `failOnFlakyTests`
- `node_modules/playwright/lib/runner/index.js:870-875,897,909,954,3978-3986,6665-6674` — webServer env merge and failures, report attachments, no-tests failure
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:158-166,266-283` — inlining, load order
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md:134-144` — production build, CI deps

## Architecture Insights

- **Two places enforce the local target.** `next.config.ts` covers `next dev`, and `playwright.config.ts` covers the E2E run's `next build` + `next start`. A CI E2E job inherits the second without new code, as long as `SUPABASE_TARGET` stays unset.
- **The credential-screening wrappers already exist** for the local stack. CI can reuse `npm run local:start` instead of a bare `supabase start`. Its fixed `START_ARGS` is the one coupling: changing the exclusions changes a pinned unit test.
- **`.env.local` is the shared contract.** It is the file `playwright.config.ts`, `next build` and `auth.setup.ts`'s message all assume, so writing the two Supabase lines and the two E2E lines into a workspace `.env.local` keeps CI on the same path as local runs.
- **The build-once design of `ci.yml` ends with this job.** A second build is inherent to E2E against the local stack, because the deploy build must inline the hosted values.

## Historical Context (from prior changes)

- `context/changes/local-supabase-stack/plan.md:55-56` — scoped out "E2E setup" and "A CI job that runs the local stack". Scoped out, not decided against.
- `context/changes/local-supabase-stack/research.md:36,72` — local first start 227 s with pulls; `:89-91` image sizes; `:102-104` keys are CLI constants; `:110-111` "Not tested: start-up in GitHub Actions"; `:276` the phrase flow does not need RAWG.
- `context/foundation/test-plan.md:136-138` — "Phase 5 research decides where the e2e test runs and with which account"; `:155` the gate row; `:358-361` §6.5 "self-seeded from the public deals list, behaviour over layout".
- `context/deployment/deploy-plan.md:32-36,42` — Actions chosen for pre-deploy gates; build once inside `vercel build`; 2000 free minutes while private.
- `context/foundation/test-stack.md:14` — the E2E user lives in the local stack, and `npm run local:reset` deletes it.
- No prior record of `::add-mask::`, `$GITHUB_ENV`, the auth admin API or a CI user-creation design (search over `context/**`, `.github/**`, CLAUDE.md).

## Related Research

- `context/changes/local-supabase-stack/research.md` — the local stack, its keys, the env load order and the screening wrappers.
- `context/changes/testing-matching-rule-protection/research.md` — PGlite vs the local stack, and CI caveats on required checks.

## Open Questions

Each is decided or proven in the plan. Per lessons.md, every command is first run locally exactly as the workflow will run it.

1. **Seed route.** `SUPABASE_DB_SEED_ENABLED=true` on start (unobserved), `psql -v ON_ERROR_STOP=1` (runner `psql` inferred), or `db reset --sql-paths` (proven, slowest).
2. **Stack start.** Reuse `npm run local:start` as it is, or change `START_ARGS` (and its test) to also drop `studio`, `postgres-meta` and `mailpit`.
3. **Env route.** A workspace `.env.local` (confirm Node's `loadEnvFile` strips the `-o env` quotes) or masked `$GITHUB_ENV`.
4. **Test user.**
   - Created through UI sign-up, the HTTP sign-up endpoint, or the admin API.
   - One user per run or per attempt.
   - The email domain local GoTrue accepts.
5. **Test design.** The main-flow test signs in itself, without the shared session (sign-out is `local`), and survives a retry (fresh user per attempt, or cleanup first).
6. **Gate settings.** `failOnFlakyTests` (or no retries), `globalTimeout` plus `timeout-minutes`, `webServer` stdout for build diagnostics, and a deliberate break proving `deploy` never starts.
7. **Placement.** E2E after `verify` or alongside it; whether `database-tests.yml` runs it on `supabase/**` pushes; rewording the build-once comment.
8. **Artifacts.** `playwright-report/` only, retention period, and whether the `setup` project's trace is acceptable in an artifact.
9. **Runtime.** Measured in the first CI run; Actions minutes against the 2000-minute budget.
