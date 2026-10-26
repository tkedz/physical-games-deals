---
date: 2026-10-14T12:21:40+02:00
researcher: Claude Code (claude-opus-5-5)
git_commit: c3312ac5634d63aad6046681244f1eebe5df90ad
branch: main
repository: 10x-physical-games-deals
topic: "Moving all local work from the hosted Supabase project to a local Supabase stack on Docker"
tags: [research, supabase, local-stack, env, seed, grants, e2e]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Moving all local work from the hosted Supabase project to a local Supabase stack on Docker

**Date**: 2026-10-14T12:21:40+02:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: c3312ac5634d63aad6046681244f1eebe5df90ad
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

The owner decided on 2026-10-14 (during `/10x-e2e-setup`) that local work moves off the hosted Supabase project. That covers `npm run dev`, `npm run build` + `next start` (the coming Playwright `webServer`) and the credential-loading npm scripts. Everything moves to a local Supabase stack (`npx supabase start`) running on Docker Desktop. Vercel production and previews stay on the hosted project, and so does the GitHub Actions pipeline (`.github/workflows/collect.yml`).

The questions:
- What has to change for the move?
- Does anything block it?
- Which decisions are left for the plan?

`.env.local` was never opened in this research, by any route (CLAUDE.md → Secrets).

## Summary

- **The stack works on this machine as the repo stands.** One `npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor` with CLI 2.117.0:
  - exited 0 after 227 s, image pulls included;
  - applied all 14 files in `supabase/migrations/` in order, with no warning or error in its log;
  - issues `sb_publishable_…` / `sb_secret_…` keys, the format the app and scripts read. Both keys are constants embedded in the CLI binary.
- **No code under `src/` needs to change.** All three app clients read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the environment, and the scripts' client reads the URL and `SUPABASE_SECRET_KEY` (`scripts/collector/supabase.mts:18-19`).
- **The app was proven against the stack.** `next dev` was started with the two `NEXT_PUBLIC_` variables in its process environment:
  - its `deals` and `pipeline_runs` reads reached the local gateway (kong log);
  - `/` rendered the empty state "Nie ma teraz żadnych okazji";
  - a guest's `/watchlist` answered 307 → `/login`.
- **Local auth matches hosted in what was probed.** No email confirmation, the same password rule (a weak password got `422 weak_password`), and a session of 3600 s.
- **The one real blocker: `public.collected_posts` holds `service_role`'s access only through Supabase's default grant.** Its migration revokes only from `anon, authenticated` (`20260921133305_create_collected_posts.sql:20`).
  - CLI 2.117.0 still auto-grants locally. Live `pg_default_acl` gives all three roles everything on new tables, sequences and functions, so it works today.
  - The Go half of the installed CLI announces that auto-exposure is removed on 2026-10-30. Under a revoke-by-default stack, a PGlite probe showed `npm run collect`, `collect:import` and `extract` failing with `42501` on that table. None of the other write and read paths it tried failed (section 2).
  - The fix is an additive migration with explicit grants.
- **Env layout: the safest option is a swap.** `.env.local` gets local values, and the hosted values move to a separate gitignored file used only by explicit opt-in scripts.
  - It needs no change to `dev`, `build` or `start`. `build` must stay `next build`, because Vercel runs it.
  - It fails closed: a missing hosted file stops the opt-in script instead of falling back to production.
  - The owner makes the swap by hand.
- **Seed data is needed.** The local database is empty and `[db.seed]` is disabled (`supabase/config.toml:65-74`).
  - A seed of four tables in foreign-key order gives listed deals, a phrase match and a fresh freshness line.
  - Generated and identity columns must stay out of it.
  - A PGlite test can guard the seed by `exec`-ing it after `buildDatabase()`.
- **Docs that become false:**
  - "dev and previews share the production Supabase project" (`context/foundation/test-plan.md:136-138`);
  - the `next dev` half of the risk row at `context/foundation/infrastructure.md:135`;
  - `.env.example`'s "fill in from the dashboard" (`.env.example:1`);
  - CLAUDE.md has no such sentence, but its migration loop and its "SQL editor" wording need a local step and clearer scope.

## Detailed Findings

### 1. Local stack bring-up (live, 2026-10-14)

- **CLI and Docker.**
  - The installed CLI is 2.117.0 (`npx supabase --version`); 2.120.0 is available.
  - The Docker Desktop engine is 29.8.2 and was running.
  - The checkout is linked: `supabase/.temp/` holds `project-ref`, `linked-project.json` and version pins from `supabase link` on 2026-09-21.
- **Command run:** `npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor`. The excluded names come from the flag's help text.
  - Exit 0 after 227 s wall clock, first run, image pulls included.
  - The log shows `Applying migration …` for all 14 files in `supabase/migrations/`, in version order.
- **Images and containers.**
  - `postgres:17.6.1.166` matches `supabase/.temp/postgres-version`.
  - Seven containers ran: db, auth (gotrue v2.197.0), rest (postgrest v14.5), kong 2.8.1, studio, postgres-meta v0.99.0 and mailpit v1.30.2.
  - `realtime:v2.130.0` and `storage-api:v1.73.1` were also pulled although excluded. They appear after "Initialising schema..." in the log, and were not started.
- **Disk.** `docker system df`:

  | | Before | After |
  |---|---|---|
  | Images | 1.389 GB | 7.533 GB (+6.14 GB) |
  | Local volumes | 226.1 MB | 278.5 MB |

  `docker images` sizes by image:

  | Group | Images (size) | Total |
  |---|---|---|
  | Running set | postgres 1.7 GB, studio 1.67 GB, postgres-meta 569 MB, kong 203 MB, gotrue 94.4 MB, mailpit 49.7 MB, postgrest 27.3 MB | ≈ 4.3 GB |
  | Pulled, not started | storage-api 1.31 GB, realtime 559 MB | ≈ 1.87 GB |
  | Running set without studio and postgres-meta | — | ≈ 2.1 GB |

- **Status variables.** `supabase status -o env` prints 17 names, values not shown here:
  - URLs: `API_URL=http://127.0.0.1:54321`, `DB_URL` (host 127.0.0.1), `STUDIO_URL` `:54323`, `MAILPIT_URL` `:54324`;
  - keys: `PUBLISHABLE_KEY` in `sb_publishable_` format, `SECRET_KEY` in `sb_secret_` format;
  - legacy JWTs `ANON_KEY` and `SERVICE_ROLE_KEY`, plus `JWT_SECRET`;
  - `LINKED_PROJECT_REF`, `LINKED_PROJECT_NAME`, `LINKED_ORG_ID` and `LINKED_ORG_SLUG`, which describe the hosted project.

  Consequences:
  - `--override-name api.url=NEXT_PUBLIC_SUPABASE_URL --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --override-name auth.secret_key=SUPABASE_SECRET_KEY` renames those three to the app's names.
  - The whole output is not fit to paste into an env file, because it also carries the hosted identifiers and the legacy JWTs.
- **Keys are CLI defaults.**
  - A Node check found both the local `PUBLISHABLE_KEY` and `SECRET_KEY` values inside `node_modules/@supabase/cli-windows-x64/bin/supabase.exe` and `supabase-go.exe`. It printed booleans only.
  - So the stack did not adopt anything from the root `.env.local`. The CLI does read root dotenv files for `SUPABASE_*` overrides, per the binary strings and Context7 `/supabase/cli`, as reported by the env worker.
- **Side effects in the repo.**
  - `supabase/.branches/_current_branch` was created; it is ignored by `supabase/.gitignore`.
  - An empty `supabase/snippets/` was created, and `supabase/.gitignore` does not cover it. Git does not track an empty directory. Whether Studio's saved SQL snippets land there was not verified.
  - `git status` after the run showed only the new change folder.
- **Not tested:**
  - the analytics service (logflare + vector) on Windows. It was excluded, so the earlier sizing pass's claim that it needs the Docker daemon on `tcp://localhost:2375` stays unverified;
  - start-up in GitHub Actions.

### 2. Grants: local stack vs hosted vs the PGlite stub

Live privileges on the local stack, from `has_table_privilege` / `has_function_privilege` / `information_schema.column_privileges`:

| Object | anon | authenticated | service_role |
|---|---|---|---|
| `collected_posts` | — | — | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE |
| `post_extractions` | — | — | INSERT, SELECT, UPDATE |
| `deals` | SELECT | SELECT | DELETE, INSERT, SELECT |
| `pipeline_runs` | SELECT | SELECT | INSERT |
| `watchlist_entries` | — | SELECT + column INSERT (`game_id, game_name, game_released, game_slug, kind, phrase, platform`) + column UPDATE (`removed_at`) | — |
| `matched_deals` (view) | — | SELECT | — |
| `deals_id_seq`, `pipeline_runs_id_seq`, `watchlist_entries_id_seq` | SELECT, UPDATE | SELECT, UPDATE | SELECT, UPDATE |
| `fold_for_matching(text)`, `game_match_key(text)` | no | execute | execute |
| `deal_match_keys(…)`, `deal_match_text(…)` | no | no | execute |

No function in `public` is executable by `PUBLIC`.

- **Every row except `collected_posts`' service_role cell and the sequences matches an explicit statement in the migrations.**
  - `20260930061806:26-27`, `20260930061813:34-36`, `20260930061820:23-25` with `20261006124528:9`, `20261007141021:51-55`, `20261012070050:196-211,226-227`.
  - Source: the schema worker's grants inventory, with the `collected_posts` line checked directly.
- **`collected_posts` has no grant statement.** It has only `revoke all on table public.collected_posts from anon, authenticated;` (`supabase/migrations/20260921133305_create_collected_posts.sql:20`), and its comment says "service_role is deliberately left alone — that is the write path" (`:18`).
- **The sequences have no grant or revoke in any migration**, so they rely on defaults too. Identity inserts did not need sequence privileges in the schema worker's revoked-model probe.
- **Local default ACLs.** `pg_default_acl` for role `postgres` in `public` grants:
  - `arwdDxtm` on tables, `rwU` on sequences and `X` on functions;
  - to each of `postgres`, `anon`, `authenticated` and `service_role`.

  So CLI 2.117.0's `start` auto-exposes new objects when `auto_expose_new_tables` is unset, as the `config.toml` comment says (`supabase/config.toml:19-23`).
- **The installed CLI contradicts itself about the future.** From binary strings and Context7 source, via the schema worker:
  - The TypeScript `start` / `db reset` path auto-exposes unless the option is explicitly `false`. That matches the live result.
  - The Go binary carries "api.auto_expose_new_tables is deprecated and will be removed on 2026-10-30" and a template line "When unset, new entities are NOT auto-exposed".
  - `package.json` allows `supabase` `^2.117.0`, so a later install can change what a fresh volume or `db reset` grants.
- **What a revoke-by-default stack would break.**
  - The schema worker built PGlite twice: once with the CLI's exact revoke statements, once with no defaults. All migrations applied in both.
  - `service_role` insert, select and update on `collected_posts` failed with `42501` in both.
  - The other paths the probe tried succeeded:
    - `service_role` on `post_extractions`, on `deals` (insert and delete) and on `pipeline_runs`;
    - `authenticated` inserting into `watchlist_entries`;
    - `anon` reading `deals` and `pipeline_runs`.
  - `npm test` cannot see this. `tests/db/harness/database.ts:31` (`DEFAULT_PRIVILEGES_END = "20261030000000"`) applies defaults per migration date, modelling the hosted project's history (`tests/db/stub/default-privileges.sql:27-32`).
- **Privileges the pipeline actually uses on `collected_posts`:**
  - the collector's upsert with `ignoreDuplicates` plus `.select("id")` (`scripts/collector/posts.mts:239-240`) needs INSERT and SELECT;
  - the extractor needs SELECT (`scripts/extract/store.mts:136,284,324,430`) and UPDATE of `processed_at`, `extraction_attempts` and `extraction_error` (`:197,251,301`);
  - no call site in `scripts/` or `src/` deletes from it.

  Explicit `select, insert, update` covers both. Applied hosted, the same migration would leave the default grant's other privileges in place unless it also revokes them. Revoking them is a separate decision.
- **Implication for testing.** Locally under CLI 2.117.0, a forgotten grant passes, because `pg_default_acl` auto-exposes new tables, sequences and functions that `postgres` creates in `public`. The PGlite date model, which also runs in CI, stays the grants authority; the local stack does not replace it.

### 3. Auth on the local stack (live probe through `/auth/v1`, publishable key)

- **Weak password rejected.** `abcdefgh` returned `422`, `weak_password`, reason `characters`. This matches `minimum_password_length = 8` and `password_requirements = "lower_upper_letters_digits_symbols"` (`supabase/config.toml:185,188`).
- **No email confirmation.** A strong-password sign-up returned 200 with a session and a confirmed email (`enable_confirmations = false`, `supabase/config.toml:230`).
- **Sign-in.** Password sign-in returned 200, an access token and `expires_in: 3600` (`jwt_expiry = 3600`, `:168`).
- **Rate limits.** `sign_in_sign_ups = 30` per 5 minutes per IP (`:210`) and `token_refresh = 150` (`:208`).
- **Cleanup.** The probe user was deleted. `auth.users` holds 0 rows at the end of this research.
- **Resets.** `supabase db reset --local` wipes local data, including `auth.users` and anything collected locally. The CLI docs say so (schema worker).

### 4. The app against the local stack (live)

- **How it was run:** `next dev -p 3100`, with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exported from `supabase status -o env --override-name …` into the process environment. `.env.local` was left as it is.
  - `GET /` returned 200 and contained "Nie ma teraz żadnych okazji" (`src/components/deals/deals-section.tsx:96`).
  - A guest's `GET /watchlist` returned `307 → /login`.
  - The kong log for the same 5 minutes shows `GET /rest/v1/deals` ×2 and `GET /rest/v1/pipeline_runs` ×2. The app's reads went to the local stack, so variables from the process environment beat `.env.local` for `next dev`.
  - The server was stopped afterwards, and port 3100 is free.
- **PostgREST number shape.** One fixture deal chain (`collected_posts` → `post_extractions` → `deals`) was inserted as `postgres` through `supabase db query --local -f` in a single CTE statement, then read as anon via `GET /rest/v1/deals`.
  - It returned 1 row with `price_amount` as a JSON number (149), so the zod `z.number()` check in `src/lib/deals/queries.ts` accepts it.
  - The generated columns computed `match_keys = {probe game}` and `match_text = "probe game ps5 | probe game"`.
  - The rows were deleted (`post_extractions` first, since `post_id` has no cascade), and all three tables are back to 0 rows.
- An inline, semicolon-separated three-statement string passed to `db query --local` inserted no rows in this run. Its stderr was discarded, so the cause is unrecorded.

### 5. Env loading and layouts

- **Next 16 load order** (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:266-276`):
  1. `process.env`
  2. `.env.$(NODE_ENV).local`
  3. `.env.local` (skipped when `NODE_ENV` is `test`)
  4. `.env.$(NODE_ENV)`
  5. `.env`

  The first hit wins.
  - `next dev` defaults to development; other commands default to production (`:283`). `next build` calls `loadEnvConfig(dir, false, …)` (`node_modules/next/dist/build/index.js:487`).
  - `NEXT_PUBLIC_` values are inlined at build time, and a built app "will no longer respond to changes to these environment variables" (`environment-variables.md:158-166`). A `.next` built against hosted values keeps serving hosted values under `next start`.
  - `next dev` writes to `.next/dev`, `next build` to `.next` (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:909`).
- **Node 24** (env worker, Context7 `/websites/nodejs_latest-v24_x_api`, plus dummy-file tests on v24.21.0):
  - With `--env-file` / `--env-file-if-exists`, a variable already in the environment wins.
  - With several flags, the later file overrides the earlier one.
  - `process.loadEnvFile()` did not override any variable already set in the v24.21.0 tests. The docs do not state this.
- **Playwright** starts its `webServer` with `{...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...webServer.env}` (env worker, Context7 `/microsoft/playwright`).
- **Who reads Supabase variables** (env worker inventory):

  | Consumer | Supabase variables |
  |---|---|
  | `dev`, `build` | publishable pair (inlined) |
  | `start` | none: uses the build's values |
  | `collect`, `collect:import`, `extract`, `extract:report` | URL + secret key, via `scripts/collector/supabase.mts:18-19` |
  | `catalog:probe` (RAWG only), `extract:eval` (local JSON + OpenRouter) | none |

  `DATABASE_URL` is declared in `.env.example:18`, and no code in `src/`, `scripts/`, `tests/`, `.github/` or `supabase/` reads it. The workflows take values from step env and secrets, and never from `.env.local`, which is gitignored and absent in CI.
- **Constraint:** Vercel runs the `package.json` `build` script (`.github/workflows/ci.yml:112` runs `vercel build`). `build` must stay plain `next build`, with no wrapper that needs a local stack.
- **Layout 1: swap.** `.env.local` holds the three local Supabase values plus `RAWG_API_KEY` and `OPENROUTER_API_KEY`. The hosted values move to `.env.hosted.local`, reached only by opt-in scripts with `--env-file=.env.hosted.local` (no `-if-exists`, so a missing file fails).
  - `dev`, `build`, `start` and the six credential scripts stay unchanged.
  - Fails closed.
  - Covered by `.gitignore`'s `.env*`.
  - Not covered by the deny rule, which is only `Read(.env.local)` (`.claude/settings.json:27`).
- **Layout 2: overlay.** `.env.local` stays hosted. Local values go into `.env.development.local` and `.env.production.local`, and every credential script gets a second `--env-file-if-exists`.
  - It fails open: a missing or partial overlay silently falls back to production, including for the RLS-bypassing secret key.
- **Layout 3: wrapper.** Values are derived at run time from `supabase status`.
  - `build` cannot be wrapped (Vercel), so a plain `npm run build` stays hosted. That fails open for exactly the E2E build.
  - Every run needs Docker.
- **Risks that apply to layout 1** (env worker; `context/deployment/deploy-plan.md:110`, `context/foundation/infrastructure.md:146`):
  - `vercel env pull` writes `.env.local` by default, and `vercel link` writes `VERCEL_OIDC_TOKEN` there. Either can put Vercel values back into the local file.
  - A stale `.next` keeps old values.
  - Variables exported in the shell beat every file.
  - What `.env.local` currently holds beyond the documented names (`DATABASE_URL`, `VERCEL_OIDC_TOKEN`, `SUPABASE_DB_PASSWORD`) is unknown and is for the owner to check.

### 6. Hosted-only work that needs an explicit path after the move

- **`npm run extract:report`** reads `post_extractions`, `deals` and `collected_posts` (`scripts/extract/report.mts`, `scripts/extract/store.mts:352-432`, env worker). Its 5% sample review is defined over production posts (`context/foundation/test-plan.md:336-337`), so it needs a hosted variant.
- **`npm run collect:import`** inserts into `collected_posts` with on-conflict-do-nothing (`scripts/collector/import-jsonl.mts:39,99`). It was used for the hosted cutover; it could also load a local stack.
- **`scripts/extract/eval/export-posts.sql`** is run by hand in the hosted SQL editor (header `:1-10`). No env is involved.
- **`db:push` / `db:status` / `db:check`** carry `--linked` (`package.json:17-19`). They are unaffected by the app env.
- **CLI targeting.** The `--help` text of `db reset`, `migration up`, `db query`, `migration list`, `db push`, `gen types` and `db advisors` lists `--local`, `--linked` and `--db-url` without stating a default. `db reset`'s description reads "Resets the local database to current migrations". `db push` has `--include-seed`.
- **Permissions.** No permission rule mentions `supabase`, and `Bash(npx *)` / `Bash(npm *)` are allowed (`.claude/settings.json:4-6`, decisions worker). "Human-only" for `db:push` is a CLAUDE.md convention, not a permission.

### 7. Seed data

- **Current state.** The local database starts empty. `[db.seed] enabled = false` with `sql_paths = ["./seed.sql"]`, and no `supabase/seed.sql` exists (`supabase/config.toml:65-74`). The comment there says to turn seeding on "deliberately".
- **When seeds run** (Context7 `/supabase/cli` via the schema worker; `db reset --help`):
  - while `[db.seed] enabled = true`: after migrations, on the first `supabase start` of a fresh volume and on each `db reset`;
  - not on a later start of an existing volume;
  - not on `migration up --local`;
  - `db reset --sql-paths <path>` "force-enables seeding" for that reset even when `enabled = false`.
- **The `--include-seed` danger.** `supabase db push --include-seed` would push the seed to the linked hosted project. Fixture deals would become publicly listed, and a fake ok `pipeline_runs` row would make production's freshness line lie.
  - The installed push code prints "Skipping seed because it is disabled in config.toml" when `enabled = false` (binary strings).
  - `db:push` does not pass `--include-seed` (`package.json:17`).
- **The listed predicate.** `kind = 'game' and edition = 'physical' and price_amount is not null and (expires_at is null or expires_at > now())`. It appears in the `deals` select policy and the `matched_deals` view (`20261013145356_hide_expired_deals.sql:14-16,36-37`) and in the page query (`src/lib/deals/queries.ts:161-166`).
- **Freshness.**
  - Fresh means the newest `outcome = 'ok'` run finished at most 6 h ago (`src/lib/deals/freshness.ts:13`; `queries.ts:212-227`, schema worker).
  - A seeded run with `finished_at = now()` stays fresh for 6 h after the seed runs.
  - `service_role` has INSERT on `pipeline_runs`, so a test can insert a fresh run itself.
- **Rendering hazards** (schema worker):
  - Every row is validated with zod, and `currency` must match `/^[A-Z]{3}$/` (`src/lib/deals/queries.ts:65`). One bad row turns the page into its error state.
  - Prices render in pl-PL format with a non-breaking space ("149,00 zł").
  - An http(s) `shop_url` gives "Przejdź do sklepu" plus "Zobacz wpis". A null or non-http(s) one falls back to the post link (`src/lib/deals/links.ts:38-55`).
- **Minimal seed**, per table, in foreign-key order:
  1. `collected_posts`: `id, source, platform_hint, title, link, published_at, first_seen_at, processed_at`. Set `processed_at` non-null, so a local `npm run extract` does not send the fixture to the model.
  2. `post_extractions`: `link, post_id, model, prompt_version, item_count, output`.
  3. `deals`: `link, item_index, source, published_at, kind, edition, platform, title, english_title, price_amount, currency`, plus optional `discount_percent, shop_url, shop_name, alternative_titles`.
  4. `pipeline_runs`: `started_at, finished_at, collect_succeeded, outcome='ok', links_attempted, links_extracted, links_failed, deals_listed, links_pending, cost_usd`.

  Never insert `deals.id`, `pipeline_runs.id`, `deals.match_keys` or `deals.match_text`: they are identity or generated and fail with `428C9`, per the schema worker's probe.
- **Rows checked in the PGlite probe:**
  - D1: a PS5 game, title "Gra Elden Ring PS5 Pudełkowa", english "Elden Ring", 129.99 PLN, with a `shop_url`. A game entry "Elden Ring" pinned to ps5 matches it.
  - D2: a Switch deal, "Hollow Knight: Silksong – edycja pudełkowa", 149.00 PLN, no `shop_url`. The phrase `silksong` matches it alone.
  - Optional D3: a `digital` row, which stays unlisted.
  - Probe result: anon saw exactly D1 and D2, and the phrase flow returned D2, then 0 rows after removal.
- **What stays out of the seed.** `auth.users` and `watchlist_entries`. An E2E user signs up through the app, and phrases are unique per user among active rows (`20261007141021:33-39`, `20261012070050:159-161`).
- **How matching works:**
  - phrase: `strpos(match_text, fold_for_matching(phrase)) > 0`;
  - game: `game_match_key(game_name) = any(match_keys)`;
  - platform: the entry's platform is null or equals the deal's.

  Current bodies: `fold_for_matching` in `20261013115104_fold_nfc_first.sql`, `game_match_key` in `20261012130317_bound_game_match_key.sql`, the view in `20261013145356:25-43`.
- **The phrase flow does not need RAWG.** The `/watchlist` phrase offer renders when the catalogue fails or is misconfigured (`src/components/watchlist/search-results.tsx:69-77,206-227`; `src/lib/watchlist/catalog.ts:40-44`).
- **A seed guard in PGlite.**
  - `buildDatabase()` leaves the session as the owner role `migrator` (`tests/db/harness/database.ts:28,160-166`). `db.pg.exec(<seed.sql>)` then applies the seed as the owner, and role-switched queries (`set local role anon` plus `request.jwt.claims`, as in `supabase/checks/listed-expiry.sql:81-82,141-149`) can assert what anon sees.
  - The harness's `seed` and `extraMigrations` options do not fit: one runs before a named migration, the other goes through the date rule.
  - `supabase/seed.sql` is not in the post-edit hook's db `SUITE_PATHS` (`.claude/hooks/post-edit-tests.mjs:57-62`). The end-of-turn hook still runs all of `npm test`.

### 8. Docs and rules that change (decisions worker)

**Becomes false for dev** (still true for previews):
- `context/foundation/test-plan.md:136-138`: "dev and previews share the production Supabase project, so there is no separate test database". §1–§5 of that file are edited through `/10x-test-plan` (`context/changes/testing-matching-rule-protection/plan.md:82`).
- `context/foundation/infrastructure.md:110`: the "or under `next dev`" half of the sign-up sentence.
- `context/foundation/infrastructure.md:135`: the risk row "Previews and `next dev` sign up real accounts in the production Supabase project". Rows there keep their wording and gain a dated status (`:119`).

**Needs rewording:**
- `.env.example:1,5-8,16-18`: the values come "from the Supabase dashboard"; `DATABASE_URL` is read by no code.
- `CLAUDE.md:50`: "Rerun it in the SQL editor". The local Studio also has one.
- `CLAUDE.md:54`: the migration loop has no local-apply step, and the stack commands have no npm script.
- `CLAUDE.md:56`: "every DDL path stays human-only". Its scope relative to a throwaway local stack is unstated.
- `CLAUDE.md:83`: the six scripts do not say which database they target.
- `context/foundation/test-plan.md:79,119,155,234-235,349-351`.
- The error messages naming `.env.local` (`scripts/collector/supabase.mts:25,30`; `src/lib/catalog/rawg.ts:40`; `scripts/extract/openrouter.mts:136`) stay correct under layout 1.

**Stays true:**
- CLAUDE.md's Secrets rule (`:82-84`), `auto_expose_new_tables` rule (`:62`) and `db:push` human-only rule for hosted (`:56`);
- `.github/workflows/*`;
- `context/deployment/deploy-plan.md:80,90` (previews);
- every dated record under `context/changes/**`.

**Neutral:** AGENTS.md and README.md.

## Code References

- `supabase/migrations/20260921133305_create_collected_posts.sql:18-20`: the revoke without a grant. Of the five tables in `public`, the one whose `service_role` access rests on the default grant.
- `supabase/config.toml:19-23`: `auto_expose_new_tables` unset falls back to `true` (local stack).
- `supabase/config.toml:65-74`: `[db.seed]` disabled, `sql_paths = ["./seed.sql"]`.
- `supabase/config.toml:168,185,188,208,210,230`: JWT expiry, password rules, rate limits, email confirmations.
- `package.json:17-19`: `db:push` / `db:status` / `db:check` with `--linked`.
- `.claude/settings.json:25-28`: deny `Read(.env.local)` only.
- `scripts/collector/supabase.mts:17-33`: the scripts' Supabase client and its env checks.
- `scripts/collector/posts.mts:239-240`, `scripts/extract/store.mts:136,197,251,284,301,324,430`: the `collected_posts` operations.
- `src/lib/deals/queries.ts:63-66,161-166`, `src/lib/deals/freshness.ts:13`: the zod row check, the listed filter, the freshness window.
- `tests/db/harness/database.ts:28,31,160-166`, `tests/db/stub/default-privileges.sql:27-32`: the PGlite owner and date-based default grants.
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:158-166,266-283`: inlining and load order.
- `context/foundation/test-plan.md:136-138`, `context/foundation/infrastructure.md:110,135`: the statements that become false for dev.

## Architecture Insights

- **The repo is already environment-agnostic at the code level.** Supabase location is purely configuration: two publishable variables for the app, URL plus secret key for the scripts. The move is a configuration, data and documentation change.
- **The pieces have different roles.**
  - PGlite remains the fast grants and matching authority. It runs under the agent hooks and in CI (`npm test`), and models hosted default privileges by migration date.
  - The local stack adds what PGlite lacks: PG 17, real GoTrue, PostgREST and Studio. Grant mistakes are not among the things it catches while CLI 2.117 auto-exposes.
  - The hosted SQL-editor checks remain the post-push authority.
- **Safety comes from failing closed toward production.** That favours layout 1, where hosted access is opt-in and errors when its file is missing.

## Historical Context (from prior changes)

- **`context/changes/schema-migrations-and-rls-baseline/plan-brief.md:21` and `plan.md:36`.** "Hosted only — no local Docker stack" because "Docker's engine is not running on this machine and the dependency was judged not worth carrying for a thin foundation change". The plan calls it a deferral: "it is the *proof* that is deferred, not the capability".
  - Engine not running: contradicted on 2026-10-14, when the engine is up.
  - Not worth carrying for that change: a scoped judgement, now superseded by the owner's decision.
- **`context/changes/testing-matching-rule-protection/research.md:55-59` and `plan.md:78`** chose PGlite over the local stack with pgTAP. Reasons and their current status:
  - about 1–2 s per database, no Docker, same in CI and on Windows: still holds;
  - the local stack "needs Docker, which is not running on this machine": contradicted now;
  - "Its CI start-up time was not measured": still unmeasured.
- **`context/changes/email-password-accounts/plan.md:29-31,119`.** "Dev and Vercel previews both read and write production… every test account is a real account." Becomes false for dev after this change.
  - `plan.md:247-254`, the requirement that `config.toml` auth mirrors hosted, now carries weight. The live probe confirms the password rule and email confirmation match.
- **Earlier sizing pass in this session.** Not a repository document, so assessed claim by claim:
  - "postgres 17.6.1.167": contradicted. Live is 17.6.1.166, matching `supabase/.temp/postgres-version`.
  - "3–6 GB full, 1.5–2.5 GB minimum": partly supported. Measured +6.14 GB of images for the minimal start, because two excluded images were still pulled. The running set is ≈ 4.3 GB, or ≈ 2.1 GB without Studio and postgres-meta.
  - "Migrations apply on a fresh stack": supported, live.
  - "Keys are `sb_publishable_` / `sb_secret_` constants": supported, live.
  - "Analytics needs tcp 2375 on Windows": not verified.

## Related Research

- `context/changes/testing-matching-rule-protection/research.md`: PGlite vs local stack; stub honesty and default privileges by date.
- `context/changes/testing-extraction-and-listing-guard/research.md`: the listed predicate and expiry in three places.
- `context/changes/physical-deals-from-real-posts/research.md`: pipeline write paths and the absence of an agent SQL route to hosted.

## Open Questions

Decisions for `/10x-plan` (none blocks planning):

1. **Env layout.** Layout 1 (swap, fails closed) is what the env worker and this synthesis favour. The plan should settle:
   - the opt-in scripts (`extract:report:hosted` at least, maybe `collect:import:hosted` and `dev:hosted`);
   - the owner's by-hand steps, since the agent may not read or write `.env.local`;
   - how to keep `vercel env pull` / `vercel link` from rewriting `.env.local`.
2. **Grant migration for `collected_posts`.** Explicit `grant select, insert, update … to service_role` is additive and backward-compatible. Whether to also revoke the default's other privileges (`DELETE, TRUNCATE, REFERENCES, TRIGGER`) hosted is a separate choice. Whether the sequences get explicit grants is open too.
3. **CLI pin.** Whether to pin `supabase` to an exact version (`package.json` has `^2.117.0`), so a fresh volume does not silently change its grant model.
4. **Seed mechanics.**
   - Turning on `[db.seed] enabled` would make the seed apply on `start` and `db reset`, and arm `--include-seed` against hosted.
   - Keeping it off and seeding through an explicit npm script (`db reset --local --sql-paths ./seed.sql`) keeps the hosted push a no-op.
   - Also open: the seed's contents (D1/D2/D3), and the PGlite guard test.
5. **Services.** Exclude through an npm script's `-x` or through `enabled = false` in `config.toml`. Studio, postgres-meta and mailpit are optional extras.
6. **npm scripts for the stack**, every one passing `--local` or `--linked` explicitly: `db:start`, `db:stop`, `db:reset`, `db:up`.
7. **Docs.** CLAUDE.md, `.env.example`, `infrastructure.md` (operational story and a dated status on risk row `:135`), and test-plan §4 and §6, the latter via `/10x-test-plan`. Plus whether README.md gets a local setup section.
8. **Owner-only.**
   - Widening the deny rule to cover the hosted file: the agent does not edit permissions.
   - Checking what `.env.local` holds beyond the documented names.

Unverified and out of scope:
- the analytics service on Windows;
- stack start-up time in GitHub Actions;
- a CI job for E2E, which this change does not touch;
- `supabase/snippets/` contents once Studio saves a snippet.

**State left behind:** the local stack is stopped with `npx supabase stop`, which keeps its volume. The database is empty and `auth.users` holds 0 rows.
