# Local Supabase Stack Implementation Plan

## Overview

Move all local work — `npm run dev`, a local `build` + `start`, and the credential-loading scripts — from the hosted Supabase project to a local Supabase stack on Docker. Vercel production and previews and the GitHub Actions pipeline stay on the hosted project. After the move, production can be reached only where someone wrote `SUPABASE_TARGET=hosted`: the collect workflow, `npm run dev:hosted` and `npm run extract:report:hosted`. The local database holds a one-off data snapshot of production, made by the owner, plus a small committed seed.

This change unblocks `/10x-e2e-setup`, paused on 2026-10-14 until local work stops sharing production.

## Current State Analysis

- **The code is already environment-agnostic.** The three app clients read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`src/utils/supabase/*.ts`). The scripts' client reads the URL and `SUPABASE_SECRET_KEY` (`scripts/collector/supabase.mts:17-33`).
- **Everything local points at production today.** That holds for `.env.local` (`.env.example:1`), for `next dev` sign-ups, which create real accounts (`context/foundation/infrastructure.md:110,135`), and for a local `npm run extract`, which writes production deals.
- **The local stack works on this machine** (research §1).
  - CLI 2.117.0, pinned by `package-lock.json`. Docker 29.8.2.
  - All 14 migrations apply.
  - The first start pulled images for 227 s, about +6 GB. Re-checked 2026-10-14: 34 s from a stopped volume, and 4 s with exit 0 when the stack is already running.
- **One blocker: `public.collected_posts`.** Its migration revokes only from `anon, authenticated`, so `service_role` reaches the table only through Supabase's default grant (`supabase/migrations/20260921133305_create_collected_posts.sql:18-20`). Under a revoke-by-default stack, `collect`, `collect:import` and `extract` fail with `42501`. The installed CLI announces that default for 2026-10-30. The PGlite date model cannot see this (`tests/db/harness/database.ts:31`).
- **The local database is empty** and seeding is off (`supabase/config.toml:65-74`).
- **`supabase start` and `supabase status` print the local keys** (research §1), and the Secrets rule forbids printing them.

## Desired End State

- **Swap.** `.env.local` holds the local stack's values. `.env.hosted.local` holds the hosted ones plus `SUPABASE_TARGET=hosted`.
- **`npm run dev`** starts the stack through `predev` and serves local data.
- **`npm run dev:hosted`** serves production data on demand, and switching back shows local data again.
- **The guard.** `createCollectorClient()` and `next dev` refuse a URL that does not match `SUPABASE_TARGET`, so an unswapped or overwritten `.env.local` stops a local run instead of writing to production.
- **Local stack scripts.** `npm run local:start`, `local:stop`, `local:up` and `local:reset` manage the stack, every one of them pinned to `--local`. `local:reset` loads `supabase/snapshot.sql` when present, then `supabase/seed.sql`.
- **Grants.** `service_role` holds exactly `select, insert, update` on `collected_posts` on both the local and hosted databases, and a PGlite test proves the pipeline's writes without any default grants.
- **Docs.** CLAUDE.md, `.env.example`, `infrastructure.md` and test-plan §6 describe the setup as it is.

Verify by:
- `npm test`, lint and format;
- the guard refusing a mismatched URL;
- the seed's `sklep.example` deal appearing under `npm run dev` and not under `dev:hosted`;
- a green collect workflow run after the merge and after the hosted `db:push`.

### Key Discoveries:

- **Next loads the env before `next.config`.** It does so with the dev flag set for `PHASE_DEVELOPMENT_SERVER` (`node_modules/next/dist/server/config.js:1404`), and the config may export a function of `phase` (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/index.md:78-95`). A dev-only guard can therefore live in `next.config.ts` without touching `next build` on Vercel.
- **Process environment beats `.env.local`.** It does for `next dev` (research §4, live) and for `node --env-file` (research §5). `dev:hosted` can therefore load `.env.hosted.local` with `node --env-file=…` in front of `node_modules/next/dist/bin/next dev` and needs no shell syntax.
- **`supabase db reset --linked` resets the hosted project.** `--sql-paths` may be repeated and force-enables seeding even when `[db.seed]` is disabled (`npx supabase db reset --help`; Context7 `/supabase/cli`). With `[db.seed] enabled = false`, `db push --include-seed` skips the seed (research §7).
- **The pattern to mirror** is `post_extractions`: `revoke all … from anon, authenticated, service_role; grant select, insert, update … to service_role;` (`supabase/migrations/20260930061806_create_post_extractions.sql:26-27`).
- **What the pipeline needs on `collected_posts`:**
  - INSERT and SELECT for the collector, via an upsert with `.select("id")` (`scripts/collector/posts.mts:239-240`);
  - SELECT, plus UPDATE of the processing columns, for the extractor (`scripts/extract/store.mts:136,197,251,284,301,324,430`);
  - nothing deletes from it.
- **The PGlite harness switches default privileges by migration date** (`tests/db/harness/database.ts:31,150-170`) and has no switch for "no defaults at all".
- **Scripts already import `src/lib/` with `.ts` specifiers.** Examples are `scripts/catalog/probe.mts:20-23` and `scripts/extract/deals.mts`, and `tsconfig.json:17` sets `allowImportingTsExtensions`.
- **`collect.yml` runs `npm run collect` and `npm run extract` with step-scoped env.** It also has `workflow_dispatch` (`.github/workflows/collect.yml:9-15,63-100`), so production collection never needs a local hosted run.
- **Synthetic fixtures in this repo** link to `.example` hosts (`context/foundation/test-plan.md:331-332`).

## What We're NOT Doing

- **Edits to test-plan §1–§5**, including the §4 sentence "dev and previews share the production Supabase project". They are left to `/10x-test-plan --refresh`, as in `testing-matching-rule-protection` and `testing-extraction-and-listing-guard`. This plan edits §6 only.
- **E2E setup.** No Playwright, no guard for a local `next build` + `next start`, no E2E test user. `/10x-e2e-setup` resumes after this change.
- **A CI job that runs the local stack**, and the analytics, storage, realtime and edge-runtime services.
- **A separate Supabase project for previews.** Previews keep sharing production.
- **A broader grants audit**, including the sequences' default privileges. That is test-plan rollout Phase 4 (Risk #4).
- **Changing the CLI version range.** `package-lock.json` already pins 2.117.0 for `npm ci`, and with explicit grants on every table a later CLI no longer changes what the pipeline can write.
- **Setting `auto_expose_new_tables`.** CLAUDE.md forbids it.
- **Ignoring `supabase/snippets/` and changing the create-next-app README.**
- **Editing `.claude/settings.json`.** Widening the deny rule is the owner's step (Phase 3, manual).

## Implementation Approach

1. **Grants first** — the one blocker. It lands hosted independently of the rest.
2. **Then the stack's scripts and data**, verifiable on the local stack before any env changes.
3. **Then the guard and the env split.** The guard makes `npm run dev` refuse until the owner swaps `.env.local`, so the swap belongs to the same phase.
4. **Last, the docs**, written against what shipped.

## Critical Implementation Details

- **Keys in CLI output.** `supabase start` prints the publishable and secret keys, the legacy JWTs, the JWT secret and the database URL, both on start and when the stack is already running. `supabase status` does too. The agent therefore runs the stack only through `npm run local:start` and `local:reset`, which never print them, and never runs bare `supabase start` or `supabase status` where the output reaches the conversation. `predev` makes this apply to every `npm run dev` the agent starts.
- **`--local` on every reset.** `supabase db reset` without `--local` defaults to local, but a `--linked` reset wipes production, so every script passes `--local` explicitly.
- **Windows spawn.** On Windows `npx` is a `.cmd` shim, so a Node wrapper spawning it needs a shell, or must call the CLI binary in `node_modules/.bin`.
- **Stale cached values.** `NEXT_PUBLIC_*` values are inlined at compile time, and `next dev` caches under `.next/dev`. The local → hosted → local switch is a manual check for that reason.

---

## Phase 1: Grants for `collected_posts`

### Overview

Give `service_role` explicit `select, insert, update` on `public.collected_posts`, so the pipeline's writes no longer rest on Supabase's default grant. Prove it in PGlite without any default privileges, then push it to the hosted project.

### Changes Required:

#### 1. The migration

**File**: `supabase/migrations/<timestamp>_grant_collected_posts_to_service_role.sql`, created with `npm run db:new -- grant_collected_posts_to_service_role`

**Intent**: Replace the default grant with exactly what the collector and the extractor use, following `post_extractions`. The comment names the call sites the privileges serve.

**Contract**:
- **Header lines:**
  - `-- Revert: grant all on table public.collected_posts to service_role;`
  - backward-compatible "yes": the collector and the extractor keep `select, insert, update`, and nothing deployed deletes, truncates, references or triggers on the table.
- **Body:** `revoke all on table public.collected_posts from service_role;` then `grant select, insert, update on table public.collected_posts to service_role;`.
- **Not touched:** `anon` and `authenticated`, which are already revoked.

#### 2. A harness switch for "no default privileges"

**File**: `tests/db/harness/database.ts`, and its self-test in `tests/db/harness.test.ts`

**Intent**: Model a local stack started by a CLI that no longer auto-exposes new objects, alongside the existing hosted date model.

**Contract**:
- **The option:** `BuildOptions.defaultPrivilegesEnd?: string` overrides `DEFAULT_PRIVILEGES_END` for one build. A value at or before the first migration's version builds the whole chain with no Supabase default privileges.
- **Default unchanged:** omitting the option keeps today's behaviour.
- **Self-test:** such a build leaves `pg_default_acl` empty for the owner.

#### 3. The grants test

**File**: `tests/db/collected-posts-grants.test.ts`

**Intent**: Prove the pipeline's operations on `collected_posts` under both privilege models, and that the table is otherwise closed.

**Contract**:
- **Builds:** one with the date model (hosted), one with `defaultPrivilegesEnd` before the chain (revoke-by-default stack).
- **Allowed for `service_role` in each:**
  - insert with `returning id`;
  - `insert … on conflict do nothing` (the import path);
  - select;
  - update of `processed_at`, `extraction_attempts` and `extraction_error`.
- **Refused for `service_role`:** `delete` and `truncate`, with `42501`.
- **Refused for `anon` and `authenticated`:** `select`, with `42501`.
- **Role switch:** `set local role` plus `request.jwt.claims`, as in `supabase/checks/listed-expiry.sql:81-82`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `tests/db/collected-posts-grants.test.ts` and the harness self-test
- Deliberate break: with the migration's `grant` line removed, the revoke-by-default case fails with `42501`; restored, it passes (recorded in `change.md`)
- `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass
- `npx supabase migration up --local` applies the migration to the local stack. `has_table_privilege` read through `npx supabase db query --local` shows `select, insert, update` for `service_role`, and not `delete`

#### Manual Verification:

- Tomasz: `npm run db:push -- --dry-run` lists only the new migration, then `npm run db:push` applies it
- Tomasz: `npm run db:check` exits 0 and `npm run db:status` shows the migration on both sides
- The next collect workflow run after the push (scheduled, or "Run workflow") is green in both steps, and production's freshness line shows that run

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Local stack scripts, seed and snapshot

### Overview

Give the stack npm scripts that never print a credential and never reach the hosted project. Start it from `predev`, and fill it with a committed seed plus an optional production snapshot.

### Changes Required:

#### 1. Stack wrappers

**File**: `scripts/local/commands.mts` (pure), `scripts/local/start.mts`, `scripts/local/reset.mts`

**Intent**: Run `supabase start` and `supabase db reset` so that their output never shows a key, and so that a reset can never target the hosted project. The decisions sit in a module without side effects, following `scripts/catalog/coverage.mts`.

**Contract**:
- **`start`** runs `supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor`.
- **`reset`** runs `supabase db reset --local`, with `--sql-paths ./snapshot.sql` before `--sql-paths ./seed.sql` when `supabase/snapshot.sql` exists, and with the seed alone otherwise.
- **Output:** neither script prints the publishable or secret key, a legacy JWT, the JWT secret, an S3 key or the database URL. A pure function selects or redacts the CLI output, printing the API and Studio URLs on success and the CLI's error on failure.
- **Exit code:** both pass the CLI's exit code through.

#### 2. npm scripts

**File**: `package.json`

**Intent**: One name per stack action, kept apart from the hosted `db:*` scripts.

**Contract**:
- **New scripts:**
  - `local:start` → `node scripts/local/start.mts`;
  - `local:stop` → `supabase stop`, which keeps the volume;
  - `local:up` → `supabase migration up --local`;
  - `local:reset` → `node scripts/local/reset.mts`;
  - `predev` → `npm run local:start`.
- **Unchanged:** `dev`, `build`, `start` and every `db:*` script.

#### 3. The seed

**File**: `supabase/seed.sql`

**Intent**: Deterministic local data that shows each rendering variant and a fresh freshness line, and that applies on top of a snapshot.

**Contract**:
- **Order:** inserts follow the foreign keys: `collected_posts` → `post_extractions` → `deals`, then `pipeline_runs`.
- **Fixture posts:**
  - `source = 'seed'`;
  - ids `5eed000000000001`…`5eed000000000004`;
  - links and shop URLs on `.example` hosts;
  - `processed_at` set, so a local `npm run extract` never sends them to the model.
- **Deals:**
  - D1, listed: PS5, "Elden Ring", 129.99 PLN, `discount_percent` 20, `shop_url` on `sklep.example`;
  - D2, listed: Switch, "Hollow Knight: Silksong", 149.00 PLN, no `shop_url`, so it falls back to the post link;
  - D3, unlisted: `edition = 'digital'`;
  - D4, unlisted: physical, `expires_at` one day before the seed runs.
- **Run:** one `pipeline_runs` row with `outcome = 'ok'` and `finished_at = now()`.
- **Never inserted:**
  - the identity columns `deals.id` and `pipeline_runs.id`;
  - the generated columns `match_keys` and `match_text`;
  - `auth.users` and `watchlist_entries`.
- **Header comment:** the file is local-only, `[db.seed]` stays disabled, and `local:reset` passes it explicitly.

#### 4. The seed test

**File**: `tests/db/seed.test.ts`

**Intent**: Keep the seed applicable and its visible result fixed as migrations change.

**Contract**:
- **Setup:** the seed is `exec`-ed as the owner after `buildDatabase()`.
- **As `anon`:** the listed deals are exactly D1 and D2, and the newest ok run finished within the last minute.
- **As a stub user** with the phrase `silksong`: `matched_deals` returns D2.
- **Snapshot case:** the seed also applies on top of an existing deal chain inserted with an explicit identity value and `setval`, as a data-only dump leaves it.

#### 5. Hook paths and ignores

**File**: `.claude/hooks/post-edit-tests.mjs`, `tests/hooks/agent-hooks.test.ts`, `supabase/.gitignore`, `supabase/config.toml`

**Intent**: Run the right suites when the seed or the wrappers change, keep the snapshot out of git, and say why seeding stays off.

**Contract**:
- **`SUITE_PATHS`:** `db` gains `supabase/seed.sql` and `unit` gains `scripts/local/`. The hooks test's "runs the %s project" table gains `["db", "supabase/seed.sql"]`.
- **`supabase/.gitignore`:** gains `snapshot.sql`, commented: production post text, never committed.
- **`[db.seed]`:** the comment says `seed.sql` now exists, and that seeding stays disabled so that `start` and `db push --include-seed` never apply it, while `local:reset` passes the files itself. `enabled = false` stays.

#### 6. Unit tests for the wrappers

**File**: `tests/unit/local/commands.test.ts`

**Intent**: Pin the two safety properties of the wrappers.

**Contract**:
- **Reset arguments:** always contain `--local` and never `--linked` or `--db-url`, and put the snapshot before the seed when it exists.
- **Output selection:** over a captured sample of `supabase start` / `status` output with placeholder values, it never returns a line carrying a key, JWT, secret or database URL.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass
- `npm run local:start` exits 0. Its output contains no `sb_secret_`, `sb_publishable_` or `eyJ` substring and no `postgresql://` URL (checked by count, never printed)
- A second `npm run local:start` while running exits 0
- `npm run local:up` reports the local database up to date
- After asking Tomasz: `npm run local:reset` without a snapshot exits 0, and an anon `GET /rest/v1/deals` returns exactly D1 and D2 (counted in a Node one-liner that reads the key from `supabase status -o json` without printing it)
- `git check-ignore supabase/snapshot.sql` succeeds
- With the stack stopped (`npm run local:stop`), starting `npm run dev` brings the stack back up through `predev`

#### Manual Verification:

- Tomasz, in the VS Code terminal, enters the database password when asked: `npx supabase db dump --linked --data-only -s public -x public.watchlist_entries --use-copy -f supabase/snapshot.sql`
- `supabase/snapshot.sql` holds data for `collected_posts`, `post_extractions`, `deals` and `pipeline_runs`, and nothing from `auth` or `watchlist_entries`, checked by grep counts
- After asking Tomasz: `npm run local:reset` with the snapshot exits 0, and anon's count of listed deals equals the snapshot's listed deals plus 2

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Target guard and env split

### Overview

Make production reachable only where `SUPABASE_TARGET=hosted` is written. Add the two hosted opt-in scripts, then the owner swaps the env files.

### Changes Required:

#### 1. The target predicate

**File**: `src/lib/env/supabase-target.ts`, tested by `tests/unit/env/supabase-target.test.ts`

**Intent**: One pure decision, shared by the scripts' client and `next dev`, on whether a Supabase URL matches the declared target.

**Contract**:
- **Signature:** `refuseSupabaseTarget({ url, target }): string | null` returns the refusal message, or `null` when the pair is allowed.
- **Allowed:**
  - `target` unset or `local` with a loopback URL: `127.0.0.1`, `localhost` or `[::1]`, any port;
  - `target = 'hosted'` with a non-loopback URL.
- **Refused:**
  - a missing or unparsable URL;
  - a loopback URL under `hosted`;
  - any other `target` value.
- **Message:** names the host and the way out (`npm run dev:hosted`, `npm run extract:report:hosted`, the swap in `.env.example`), and never the key.
- **Test cases:** `127.0.0.1.example.com` and `localhost.example` are not loopback, and `LOCALHOST` is.

#### 2. The scripts' client

**File**: `scripts/collector/supabase.mts`

**Intent**: Refuse before any request, so a mismatched env fails loudly instead of writing to the wrong database.

**Contract**:
- **Check:** `createCollectorClient()` throws the predicate's message before `createClient`, importing it with a `.ts` specifier.
- **Messages:** the two "not set" messages name `.env.local` for the local stack and `.env.hosted.local` for hosted runs.

#### 3. The dev guard

**File**: `next.config.ts`

**Intent**: Stop `next dev` from serving production data by accident, while leaving `next build` and `next start` untouched for Vercel and the coming E2E build.

**Contract**:
- **Shape:** the config becomes a function of `phase`.
- **Check:** under `PHASE_DEVELOPMENT_SERVER` it throws the predicate's message for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_TARGET`.
- **Unchanged:** the existing `experimental.serverComponentsHmrCache: false`.

#### 4. The workflow states its target

**File**: `.github/workflows/collect.yml`

**Intent**: The production pipeline passes the guard because it says it targets hosted, not because it runs in CI.

**Contract**:
- **Steps:** `SUPABASE_TARGET: hosted` is added to the `env:` of the Collect and Extract deals steps, with a comment pointing at the guard.
- **Unchanged:** nothing else.

#### 5. Hosted opt-in scripts

**File**: `package.json`, `.claude/hooks/post-edit-tests.mjs`

**Intent**: The two sanctioned ways to reach production from this machine, both failing closed when the hosted file is missing.

**Contract**:
- **`dev:hosted`** → `node --env-file=.env.hosted.local node_modules/next/dist/bin/next dev`. npm runs no `predev` for it, so no Docker is needed.
- **`extract:report:hosted`** → `node --env-file=.env.hosted.local scripts/extract/report.mts`.
- **Fail closed:** `--env-file` without `-if-exists` makes a missing file an error.
- **Hook paths:** `SUITE_PATHS.unit` gains `src/lib/env/`.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass
- Refused before any request: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co SUPABASE_SECRET_KEY=x npm run collect` exits non-zero with the guard's message
- Refused before any request: `SUPABASE_TARGET=hosted NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=x npm run extract:report` exits non-zero with the guard's message
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npx next dev -p 3100` exits with the guard's message
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npm run build` passes the guard
- `npm run extract:report:hosted` with no `.env.hosted.local` present fails on the missing file. Run only before Tomasz creates it, or skipped

#### Manual Verification:

- Tomasz swaps the env files in VS Code, following the steps in `.env.example`
  - he moves `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from `.env.local` into a new `.env.hosted.local` and adds `SUPABASE_TARGET=hosted`;
  - he fills the three names in `.env.local` with the API URL, Publishable key and Secret key from `npx supabase status` in the VS Code terminal;
  - he keeps `RAWG_API_KEY` and `OPENROUTER_API_KEY` in `.env.local`, and deletes `DATABASE_URL`, which no code reads
- Tomasz adds `Read(.env.hosted.local)` to the `deny` list in `.claude/settings.json`
- `npm run dev` → `/` shows the seed's Elden Ring deal with "Przejdź do sklepu" to `sklep.example`, alongside the snapshot's deals
- A sign-up on the local app works without email confirmation, and the account appears in the local Studio, not in the production dashboard
- `npm run dev:hosted` → `/` shows production deals without the seed deal. After stopping it, `npm run dev` shows the seed deal again
- `npm run extract:report:hosted` writes a sample from production posts, and `npm run db:status` still lists the hosted migrations
- After the merge, the next collect workflow run (scheduled, or "Run workflow") is green in both steps

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Documentation

### Overview

Make the rules file, the env example and the foundation docs state the local setup as shipped, without restating reasons that belong in lessons.md.

### Changes Required:

#### 1. Rules file

**File**: `CLAUDE.md`

**Intent**: Record the new facts where agents look, and narrow two rules that would otherwise forbid the agreed local loop.

**Contract**:
- **Supabase:** a bullet on the two env files, `SUPABASE_TARGET`, the guard (`src/lib/env/supabase-target.ts`) and `collect.yml` setting it.
- **New "Local stack" section:**
  - the `local:*` scripts and `predev`;
  - what `-x` excludes;
  - seed and snapshot: `supabase/seed.sql` is committed; `supabase/snapshot.sql` is gitignored, made by Tomasz with the `db dump` command, and holds post text;
  - `[db.seed]` stays disabled;
  - agents run `local:start`, `local:stop` and `local:up` themselves, and ask before `local:reset`, because it wipes local data and local accounts;
  - agents never run bare `supabase start` or `supabase status`, because both print keys;
  - a local `npm run extract` calls OpenRouter for every pending local post.
- **Database migrations:**
  - the loop becomes `db:new` → `npm test` → `npm run local:up` → `db:push --dry-run` → `db:push` → `db:check`;
  - "every DDL path stays human-only" becomes "every DDL path to the hosted project stays human-only".
- **Deal matching:** "Rerun it in the SQL editor" becomes "in the hosted SQL editor after the push".
- **Secrets:**
  - the sanctioned scripts gain `npm run dev:hosted` and `npm run extract:report:hosted`, which load `.env.hosted.local` with `--env-file`;
  - the never-read rule names `.env.hosted.local` too.

#### 2. Env example

**File**: `.env.example`

**Intent**: Describe the swap the owner performs, and where each value comes from.

**Contract**:
- **Header:** `.env.local` holds the local stack's values from `npx supabase status`.
- **Hosted section:** names `.env.hosted.local`, with the three Supabase names plus `SUPABASE_TARGET=hosted` from the dashboard, read only by `dev:hosted` and `extract:report:hosted`.
- **Removed:** `DATABASE_URL`, which no code reads.
- **Corrected:** the secret key's comment.

#### 3. Infrastructure

**File**: `context/foundation/infrastructure.md`

**Intent**: Bring the operational story and the risk register up to date, without rewriting history.

**Contract**:
- **Operational Story:**
  - a "Local development" line: the local stack, the guard, the two hosted opt-ins;
  - the Previews line's `next dev` clause gains a dated note: dev now runs locally, and `dev:hosted` still creates real accounts;
  - the Schema migrations loop gains `npm test` → `npm run local:up`.
- **Risk Register:** the row "Previews and `next dev` sign up real accounts…" keeps its wording, and its Status gains a dated note that the dev half is closed.

#### 4. Test plan §6

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the cookbook accurate. §1–§5 stay untouched.

**Contract**:
- **§6.2 (b):** a bullet on `defaultPrivilegesEnd`, with `tests/db/collected-posts-grants.test.ts` as the reference.
- **§6.2 "The local loop":** gains `npm run local:up`.
- **§6.3:** the sample review names `npm run extract:report:hosted`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm test` pass
- Every npm script named in CLAUDE.md and `.env.example` exists in `package.json` (Node one-liner over the script names)
- `grep` finds no "from the Supabase dashboard" in `.env.example`'s local section, and no `DATABASE_URL` in `.env.example`

#### Manual Verification:

- Tomasz reads the CLAUDE.md and `.env.example` diffs and confirms they describe what he now does

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- **The target predicate:** every allowed and refused pair, lookalike hosts, case, IPv6 loopback, unset and garbage values.
- **The wrapper decisions:** reset arguments are always `--local` and keep the snapshot-then-seed order; the output selection never passes a credential line.

### Integration Tests:

- **PGlite: grants on `collected_posts`** under the hosted date model and under no default privileges.
- **PGlite: the seed** applies after the migrations and on top of snapshot-shaped rows; anon sees exactly D1 and D2, and the phrase matches D2.
- **Live local stack:** reset, an anon REST read, and `predev` starting the stack.

### Manual Testing Steps:

1. Tomasz pushes the grant migration, runs `db:check`, and confirms the next collect run is green.
2. Tomasz exports the snapshot, and the agent (after asking) resets the local database with it.
3. Tomasz swaps the env files and adds the deny rule.
4. `npm run dev` shows local data, `npm run dev:hosted` shows production data, and back again.
5. After the merge, the collect workflow run is green.

## Performance Considerations

- `predev` adds about 4 s to `npm run dev` while the stack runs, and about 34 s after Docker restarts with the volume intact.
- The first ever start pulls about 6 GB of images (227 s on 2026-10-14).

## Migration Notes

- **The grant migration** is applied by Tomasz with `db:push`. It is backward-compatible: no deployed code uses the revoked privileges.
- **Order:** it can land hosted before or after Phases 2–4.
- **Revert:** the `grant all` in its header.

## References

- Related research: `context/changes/local-supabase-stack/research.md`
- The grant pattern: `supabase/migrations/20260930061806_create_post_extractions.sql:26-27`
- The PGlite harness: `tests/db/harness/database.ts:28-170`
- The role-switch pattern: `supabase/checks/listed-expiry.sql:81-82`
- Side-effect-free decision module next to a script: `scripts/catalog/coverage.mts`, `scripts/catalog/probe.mts:28-38`
- Prior decisions: `context/changes/schema-migrations-and-rls-baseline/plan.md:36`; `context/changes/testing-matching-rule-protection/plan.md:78-82`; `context/changes/email-password-accounts/plan.md:29-31,247-254`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Grants for `collected_posts`

#### Automated

- [x] 1.1 `npm test` passes, including `tests/db/collected-posts-grants.test.ts` and the harness self-test — 7e5a5ce
- [x] 1.2 Deliberate break: with the migration's `grant` line removed, the revoke-by-default case fails with `42501`; restored, it passes (recorded in `change.md`) — 7e5a5ce
- [x] 1.3 `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass — 7e5a5ce
- [x] 1.4 `npx supabase migration up --local` applies the migration to the local stack. `has_table_privilege` read through `npx supabase db query --local` shows `select, insert, update` for `service_role`, and not `delete` — 7e5a5ce

#### Manual

- [x] 1.5 Tomasz: `npm run db:push -- --dry-run` lists only the new migration, then `npm run db:push` applies it — 7e5a5ce
- [x] 1.6 Tomasz: `npm run db:check` exits 0 and `npm run db:status` shows the migration on both sides — 7e5a5ce
- [x] 1.7 The next collect workflow run after the push (scheduled, or "Run workflow") is green in both steps, and production's freshness line shows that run — 7e5a5ce

### Phase 2: Local stack scripts, seed and snapshot

#### Automated

- [x] 2.1 `npm test`, `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass — 3c654c3
- [x] 2.2 `npm run local:start` exits 0. Its output contains no `sb_secret_`, `sb_publishable_` or `eyJ` substring and no `postgresql://` URL (checked by count, never printed) — 3c654c3
- [x] 2.3 A second `npm run local:start` while running exits 0 — 3c654c3
- [x] 2.4 `npm run local:up` reports the local database up to date — 3c654c3
- [x] 2.5 After asking Tomasz: `npm run local:reset` without a snapshot exits 0, and an anon `GET /rest/v1/deals` returns exactly D1 and D2 (counted in a Node one-liner that reads the key from `supabase status -o json` without printing it) — 3c654c3
- [x] 2.6 `git check-ignore supabase/snapshot.sql` succeeds — 3c654c3
- [x] 2.7 With the stack stopped (`npm run local:stop`), starting `npm run dev` brings the stack back up through `predev` — 3c654c3

#### Manual

- [x] 2.8 Tomasz, in the VS Code terminal, enters the database password when asked: `npx supabase db dump --linked --data-only -s public -x public.watchlist_entries --use-copy -f supabase/snapshot.sql` — 3c654c3
- [x] 2.9 `supabase/snapshot.sql` holds data for `collected_posts`, `post_extractions`, `deals` and `pipeline_runs`, and nothing from `auth` or `watchlist_entries`, checked by grep counts — 3c654c3
- [x] 2.10 After asking Tomasz: `npm run local:reset` with the snapshot exits 0, and anon's count of listed deals equals the snapshot's listed deals plus 2 — 3c654c3

### Phase 3: Target guard and env split

#### Automated

- [x] 3.1 `npm test`, `npm run lint`, `npm run format:check` and `npx tsc --noEmit` pass — e97ec1a
- [x] 3.2 Refused before any request: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co SUPABASE_SECRET_KEY=x npm run collect` exits non-zero with the guard's message — e97ec1a
- [x] 3.3 Refused before any request: `SUPABASE_TARGET=hosted NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=x npm run extract:report` exits non-zero with the guard's message — e97ec1a
- [x] 3.4 `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npx next dev -p 3100` exits with the guard's message — e97ec1a
- [x] 3.5 `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npm run build` passes the guard — e97ec1a
- [x] 3.6 `npm run extract:report:hosted` with no `.env.hosted.local` present fails on the missing file. Run only before Tomasz creates it, or skipped — e97ec1a

#### Manual

- [x] 3.7 Tomasz swaps the env files in VS Code, following the steps in `.env.example` — e97ec1a
- [x] 3.8 Tomasz adds `Read(.env.hosted.local)` to the `deny` list in `.claude/settings.json` — e97ec1a
- [x] 3.9 `npm run dev` → `/` shows the seed's Elden Ring deal with "Przejdź do sklepu" to `sklep.example`, alongside the snapshot's deals — e97ec1a
- [x] 3.10 A sign-up on the local app works without email confirmation, and the account appears in the local Studio, not in the production dashboard — e97ec1a
- [x] 3.11 `npm run dev:hosted` → `/` shows production deals without the seed deal. After stopping it, `npm run dev` shows the seed deal again — e97ec1a
- [x] 3.12 `npm run extract:report:hosted` writes a sample from production posts, and `npm run db:status` still lists the hosted migrations — e97ec1a
- [x] 3.13 After the merge, the next collect workflow run (scheduled, or "Run workflow") is green in both steps — e97ec1a

### Phase 4: Documentation

#### Automated

- [x] 4.1 `npm run lint`, `npm run format:check` and `npm test` pass
- [x] 4.2 Every npm script named in CLAUDE.md and `.env.example` exists in `package.json` (Node one-liner over the script names)
- [x] 4.3 `grep` finds no "from the Supabase dashboard" in `.env.example`'s local section, and no `DATABASE_URL` in `.env.example`

#### Manual

- [x] 4.4 Tomasz reads the CLAUDE.md and `.env.example` diffs and confirms they describe what he now does
