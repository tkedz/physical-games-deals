<!-- Project rules. Kept OUTSIDE the 10x-cli BEGIN/END markers so sync won't overwrite them. -->

# physical-games-deals

Next.js 16 + Supabase. A collector of physical game releases; deals are extracted with an LLM from human-written RSS posts.
Context: @context/foundation/prd.md, @context/foundation/tech-stack.md, @context/foundation/lessons.md

## Language

Write every project artifact in English: code comments, documentation, README files, configuration comments, commit messages and PR descriptions. Keep this rule even when the conversation is in Polish — the prompt language does not change the artifact language.

The exception is `context/`: the product-thinking documents there (`prd.md`, `shape-notes.md`, `tech-stack.md`) stay in Polish. Do not translate them, and write new ones in Polish too. `context/foundation/lessons.md` is the one file in that directory kept in English, because review skills quote its rules verbatim.

## Next 16 — not the Next.js you know

- Before writing code that touches a framework API, read the relevant file in `node_modules/next/dist/docs/` — see @AGENTS.md.
- The `middleware` convention is called **`proxy`** here: the file is `src/proxy.ts` and it exports `proxy()`, not `middleware()`. Do not create `middleware.ts`.

## Supabase

- Three clients: @src/utils/supabase/client.ts ("use client"), @src/utils/supabase/server.ts (Server Components / Actions / Route Handlers), @src/utils/supabase/session.ts (for `src/proxy.ts` only). Supabase's own docs call that last one `utils/supabase/middleware.ts`.
- Call `createClient()` from `server.ts` fresh on every request. Never hold the result in a module-level variable — session cookies are per-request.
- In @src/utils/supabase/session.ts, do not move `await supabase.auth.getUser()`. `updateSession()` returns `supabaseResponse` together with the user, and any redirect goes through its `redirectTo()`, which copies the cookies and cache headers. Returning any other response causes random logouts.
- Every path is public except `/watchlist` and `/my-deals`: `src/proxy.ts` sends signed-in users from `/login` and `/signup` to `/`, and signed-out users from both to `/login` (@src/lib/auth/access.ts). Nothing enforces privacy by default — a private view needs its own rule there, and its data stays behind RLS either way. Server Action calls pass the proxy, so every action checks the user itself.
- The public key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `..._ANON_KEY`). `SUPABASE_SECRET_KEY` bypasses RLS and **never** takes the `NEXT_PUBLIC_` prefix. Full list: @.env.example
- Two env files. `.env.local` holds the local stack's values; `.env.hosted.local` holds the hosted project's plus `SUPABASE_TARGET=hosted`, and under `npm run dev:hosted` Next still reads `.env.local` for every name `.env.hosted.local` does not set. `refuseSupabaseTarget` (`src/lib/env/supabase-target.ts`) allows `SUPABASE_TARGET` unset or `local` with a loopback URL only, and `hosted` with a non-loopback http(s) URL only. `createCollectorClient()` (`scripts/collector/supabase.mts`) checks it before any request, and `next.config.ts` under `next dev` only; `next build` and `next start` are unguarded. `.github/workflows/collect.yml` sets `SUPABASE_TARGET: hosted` on the Collect and Extract deals steps.
- Per-user data isolation rests on Postgres RLS, not on filtering in application code.
- A deal is listed when it is a game, a physical copy, priced and not expired (`expires_at` null or still ahead). The predicate is stated in the select policy on `public.deals`, in the view `public.matched_deals` and in the page query (`src/lib/deals/queries.ts`); a change to it changes all three. `supabase/checks/listed-expiry.sql` checks the first two.

## Game catalogue

- The provider is RAWG. The contract is `src/lib/catalog/types.ts`; `src/lib/catalog/rawg.ts` is the only file that knows RAWG.
- `src/lib/games/catalog.ts` is the app's only way into the catalogue. It picks the provider (`CATALOG_PROVIDER`) and caches its answers at function level with `unstable_cache`, the provider in every key; the rules are in `src/lib/games/cached-catalog.ts`. Never at fetch level: the request URL carries the key.
- `RAWG_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It rides in the request URL (`?key=`), so request URLs are never logged, thrown or returned. It lives in Vercel's project environment variables, for Production and Preview, and in `.env.local` for `npm run dev` and `npm run catalog:probe`.
- Files under `src/lib/catalog/` are also loaded by Node, so only whole-statement `import type` crosses between them. Scripts importing `src/` run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`.
- RAWG's terms require an active link to rawg.io on every page showing its data. The footer of `src/app/(app)/layout.tsx` carries it for every page under that layout.

## Deal extraction

- The provider is OpenRouter. `scripts/extract/openrouter.mts` is the only file that knows it.
- `OPENROUTER_API_KEY` is server-only and **never** takes the `NEXT_PUBLIC_` prefix. It lives in the GitHub Actions secrets, scoped to the extract step, and in `.env.local` for the extract scripts.
- The model list is `MODELS` in `scripts/extract/config.mts`, and every model in it is also in `CANDIDATES`.
- `npm run extract:eval` is a gate: it exits 1 on a breach, and on a pass writes `scripts/extract/eval/result.json`, which records the prompt and labels fingerprints (`scripts/extract/fingerprint.mts`). A change to what is sent to the model, or to the labelled set, is committed together with a new `result.json`. Until then `npm test` fails, and `npm run extract` aborts before it reads a credential. How to run it and what blocks: `context/foundation/test-plan.md` §6.3.
- Two repository variables steer the extract step without a deploy. `EXTRACT_PAUSED=true` skips it while collection keeps running. `EXTRACT_SINCE` — a date (`YYYY-MM-DD`, from the start of that day in Warsaw) or an instant with its offset — limits extraction to posts first seen since then; unset, every pending post is extracted. Locally, `npm run extract -- --since <value>` sets the cut-off for one run.

## Deal matching

- `/my-deals` reads `public.matched_deals`, a `security_invoker` view: the listed deals that match the caller's active watchlist entries.
- Game pages read `public.deals_for_game(name)` (`supabase/migrations/20261027085911_deals_for_game.sql`), an invoker function for `anon` and `authenticated` that relies on the select policy on `public.deals` for the listed predicate and does not restate it. Its key comes from `private.game_key`, a definer function in schema `private`, so `anon` still executes none of the matching functions. `private` is never exposed through any API setting: not in `supabase/config.toml`'s `schemas` or `extra_search_path`, not in the hosted Data API settings.
- The rule is `public.fold_for_matching` and `public.game_match_key`, in `supabase/migrations/20261012070050_match_deals_to_watchlist.sql`; `game_match_key`'s current body is in `20261012130317_bound_game_match_key.sql`, and `fold_for_matching`'s in `20261013115104_fold_nfc_first.sql`. `deals.match_keys` and `deals.match_text` are generated columns computed from them.
- `foldForMatching` in `src/lib/watchlist/rules.ts` mirrors `public.fold_for_matching` for the phrase pre-check, and must stay identical to it. `tests/db/fold-parity.test.ts` compares the two over the corpus in `tests/db/fixtures/fold-corpus.ts`.
- `create or replace function` neither recomputes the stored keys nor rebuilds an index. A migration that changes a matching function also runs `update public.deals set title = title`, and, for the fold, settles the phrases that newly fold alike and runs `reindex index public.watchlist_entries_active_phrase_folded`.
- `supabase/checks/matching.sql` is the rule's truth table. `npm test` runs it unchanged in PGlite against `supabase/migrations/` (`tests/db/matching.test.ts`). Rerun it in the hosted SQL editor after the push of every change to the rule; it ends in an error on purpose and rolls itself back.

## Database migrations

- The schema lives in `supabase/migrations/` and is applied by hand. The loop is `npm run db:new -- <name>` → `npm test` → `npm run local:up` → `npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`. Use the npm scripts, not the bare CLI: they carry the flags, and `supabase db advisors` without `--fail-on error` exits 0 while printing the very finding it was hired to catch.
- From a clean checkout the CLI is unlinked. `npx supabase login`, then `npx supabase link --project-ref <ref>`. Both are interactive and belong to a human — `link` asks for the database password, which is not in this repository and must not be read out of `.env.local` (see **Secrets**). The `--linked` commands (`db:push`, `db:status`, `db:check`, the snapshot dump) ask for none: the CLI mints a temporary login role with the `login` token.
- `npm run db:push` is a human action, never CI. No credential that can change the schema belongs in a workflow — every DDL path to the hosted project stays human-only. Row writes are the deliberate exception: the collector inserts into `public.collected_posts`, and the extractor updates its processing columns and writes `public.post_extractions`, `public.deals` and `public.pipeline_runs`. Both run from `.github/workflows/collect.yml` using `SUPABASE_SECRET_KEY`, held as a GitHub Actions secret that reaches neither Vercel nor the browser.
- Every new table in `public` ships locked: `enable row level security` plus `revoke all on table <t> from anon, authenticated, service_role`, and no policy. Then grant `service_role` exactly what the server-side writer uses — Supabase grants new tables to all three roles automatically until 2026-10-30 and to none after it, and the pair gives the same privileges either way. A missing grant surfaces as `42501` at write time, not at push. Add a policy, with `grant select` to `anon, authenticated`, only when a client holding the publishable key genuinely needs the rows — a browser, or a Server Component on Vercel — and justify it in the migration. A table that signed-in users write themselves (`public.watchlist_entries`) grants `authenticated` `select` plus column-level `insert` and `update` on just the columns they write, takes `user_id` from `default auth.uid()`, pins every policy to `(select auth.uid())`, and grants `anon` and `service_role` nothing.
- Every new function in `public` ships locked too: `revoke execute on function <f> from public, anon, authenticated, service_role`, then `grant execute` to each role that calls it — including the role whose write evaluates it in a generated column or an index expression. Postgres grants every new function to `PUBLIC`, and Supabase's default privileges grant it to all three roles, so a function left alone is an RPC endpoint for `anon`. A missing grant surfaces as `42501` at write time, not at push.
- Open every migration with two header lines: `-- Revert: <the statement that undoes this>` and a one-line statement of whether it is backward-compatible with the previous deployment. `vercel rollback` moves traffic only and does not undo a migration, so a migration must stay compatible for the length of one rollback window.
- Migrations are additive. A change that drops a column, narrows a type or adds `not null` to an existing one splits in two: the additive half now, the destructive half in a later migration, once the deployment that needed the old shape is no longer a rollback target. `supabase migration down` is not an escape — it resets rather than reverts, and takes the data with it.
- `npm run db:status` is the drift check between the repository and the hosted project. Manual apply makes drift possible; this is what detects it.
- Do not set `auto_expose_new_tables` in `supabase/config.toml`. It governs only the local stack, so it would hide a forgotten `revoke` exactly where mistakes are cheap and expose it where they are not. The `revoke` in the migration behaves the same in both places.

## Local stack

- `npm run dev`, a local `next build` + `next start` and every script loading `.env.local` run against the local Supabase stack on Docker. Vercel, `collect.yml`, `npm run db:push`, `db:status`, `db:check`, `npm run dev:hosted` and `npm run extract:report:hosted` use the hosted project.
- `npm run local:start` (`scripts/local/start.mts`) runs `supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor`; `predev` runs it before every `npm run dev`. `npm run local:stop` stops the stack and keeps its volume. `npm run local:up` (`supabase migration up --local`) applies new migrations to it. `npm run local:reset` (`scripts/local/reset.mts`) is `supabase db reset --local`, loading `supabase/snapshot.sql` when it exists, then `supabase/seed.sql`.
- The wrappers never echo the CLI's stdout: `local:start` prints the API and Studio URLs, and both `local:start` and `local:reset` end with a count of any lines held back as possible credentials, harmless ones included.
- `.github/workflows/ci.yml`'s `e2e` job runs `npm run local:start` and `npm run local:reset` inside the runner; CI has no snapshot, so that stack holds the migrations and `supabase/seed.sql` only. The job writes its `.env.local` from `supabase status -o env`, filtered to `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
- `supabase/seed.sql` is committed fixture data. `supabase/snapshot.sql` is gitignored and holds production post text; Tomasz makes it with `npx supabase db dump --linked --data-only -s public -x public.watchlist_entries -f supabase/snapshot.sql` — not `--use-copy`: the reset's seed loader cannot run `COPY … FROM stdin`.
- `[db.seed]` in `supabase/config.toml` stays disabled; `local:reset` passes both files with `--sql-paths`.
- Agents run `npm run local:start`, `npm run local:stop` and `npm run local:up` themselves, and ask before `npm run local:reset`: it wipes local data and local accounts.
- Agents never run bare `supabase start` or `supabase status`: both print the local keys.
- A local `npm run extract` calls OpenRouter for every pending post in the local database.

## Directories

- The current PRD is `context/foundation/prd.md`; `prd_old.md` is stale.

## Verification

- `npm run lint` runs `eslint --max-warnings 0` (flat config) — the flag is deliberate, do not drop it. `npm run format:check` runs Prettier. With `npm test` they make up the `verify` gate in `.github/workflows/ci.yml`; `deploy` does not start until all three pass.
- `ci.yml`'s `e2e` job runs `npx playwright test` (`tests/e2e/`) beside `verify`, against a local Supabase stack started inside the runner; `deploy` needs both `verify` and `e2e`. In CI a test that passes only on a retry fails the run (`failOnFlakyTests` in `playwright.config.ts`). How to run and extend it: `context/foundation/test-plan.md` §6.5.
- `npm test` runs Vitest (`vitest.config.mts`) in three projects, all in the `node` environment: `unit` collects `tests/unit/**/*.test.ts`; `db` collects `tests/db/**/*.test.ts`, which run against PGlite built from `supabase/migrations/` behind the Supabase stub in `tests/db/stub/`; `hooks` collects `tests/hooks/**/*.test.ts`, which run the agent hooks in throwaway git repositories with stubbed tools. A test file outside those patterns is never run.
- Run Vitest through `npm test`, passing options after `--` (`npm test -- --project unit`), not through `npx vitest`. `scripts/test.mts` starts it from the canonical path of the working directory; started from `c:\…` with a lowercase drive letter, Vitest 5.0.4 fails every test file.
- Agent hooks, registered in `.claude/settings.json`, local only and not a gate. After an agent's Edit or Write, `.claude/hooks/lint-edited-file.mjs` runs ESLint (`--max-warnings 0`) and `prettier --check` on that file, and `.claude/hooks/post-edit-tests.mjs` runs the unit or hooks project (synchronously) or the db project (in the background) for the paths it maps in `SUITE_PATHS`. When the agent stops, `.claude/hooks/end-of-turn.mjs` runs ESLint and Prettier on the changed files, all of `npm test` and `tsc --noEmit`, and sends failures back once. Each hook works in the edited file's checkout, a worktree included; `tests/hooks/agent-hooks.test.ts` proves them.

## Commits

- Do not add `Co-Authored-By` trailers, "Generated with" lines, or any other attribution to commit messages or pull request descriptions.
- Keep the subject line short and imperative. Add a body only when the change needs a reason the diff does not show.

## Secrets

- Never read `.env.local`, `.env.hosted.local`, or any other file holding credentials, by any route: not with the Read tool, and not indirectly through `cat`, `node -e`, a script, or any other shell command. The `Read(.env.local)` and `Read(.env.hosted.local)` deny rules in `.claude/settings.json` only cover the Read tool — this rule covers every path to the file, because a permission pattern cannot constrain an interpreter.
- The one sanctioned exception is the credential-loading commands: `npm run collect`, `npm run collect:import`, `npm run catalog:probe`, `npm run extract`, `npm run extract:eval`, `npm run extract:report` and `npm run e2e:account` pass `--env-file-if-exists=.env.local` to node, `npx playwright test` loads `.env.local` through `process.loadEnvFile` in `playwright.config.ts`, and `npm run dev:hosted` and `npm run extract:report:hosted` pass `--env-file=.env.hosted.local`, so the process loads the file while nothing reads or prints its contents. Running those commands is not a breach of the rule above; opening the file to see what is in it still is.
- Of those, `npx playwright test` writes values out: everything the tests type lands in `playwright-report/` and `test-results/` (step titles, `error-context.md`, traces), `E2E_USERNAME` and `E2E_PASSWORD` included, along with the main-flow test's throwaway passwords. They sign in to local-stack test accounts only and are not secrets, so agents may open both folders. Of the other values in `.env.local`, only the public `NEXT_PUBLIC_*` ones reach them.
- To learn whether a variable is set, ask the user. Do not read the file to find out.
- Never print a secret, or any part of one, into the conversation — that includes prefixes, lengths and fragments.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the two M3L4 skills in this order:**

1. **`/10x-e2e-setup`** — one-time setup: Playwright config (`webServer`,
   auth `setup` project, `storageState`), a green seed test, and `context/foundation/test-stack.md`.
2. **`/10x-e2e`** — the per-risk loop: risk → explore the running app with
   `playwright-cli` → generate → review against the five anti-patterns →
   re-prompt by name → verify with a deliberate break.

The skills' `references/` carry the full rules, anti-patterns, seed pattern, and
prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toHaveScreenshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **A red test is a signal, not a chore.** A changed selector → update the
  locator in a reviewed diff. A changed business behavior → the test caught a
  bug; never edit the assertion to match it. Fixing failing tests is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
