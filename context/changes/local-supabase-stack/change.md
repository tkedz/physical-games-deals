---
change_id: local-supabase-stack
title: Local supabase stack
status: implementing
created: 2026-10-14
updated: 2026-10-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-10-14 — Phase 1

- **Deliberate break (criterion 1.2).** With the `grant` line removed from `20261014111929_grant_collected_posts_to_service_role.sql`, `tests/db/collected-posts-grants.test.ts` failed 8 of 16 cases with `42501 permission denied for table collected_posts`. Those are the four allowed operations, in both models. The plan names only the revoke-by-default case. The hosted case fails too, because the kept `revoke all … from service_role` also strips the default grant. Restored, all 16 passed.
- **Additions to the harness contract** (`tests/db/harness/database.ts`):
  - `NO_DEFAULT_PRIVILEGES = "00000000000000"` names the "before every migration" value;
  - `buildDatabase` refuses a `defaultPrivilegesEnd` that is not 14 digits, because versions are compared as text;
  - the self-test in `tests/db/harness.test.ts` also asserts that a table dated before 2026-10-30 reaches no API role under the option.
- **Migration comment.** It names the call sites by function (`insertPosts`, `loadPending`, `saveExtraction`, …), not by line. `collect` and `collect:import` share `insertPosts`, so the test's on-conflict case covers both.

### 2026-10-14 — Phase 2

- **A third wrapper file, `scripts/local/cli.mts`.** The plan lists `commands.mts`, `start.mts` and `reset.mts`. The spawn, which both wrappers share, sits in `cli.mts`. It runs `node node_modules/supabase/dist/supabase.js`, with no shell on Windows, and keeps the CLI's stdout out of the terminal.
- **The CLI's output has two shapes.** CLI 2.117.0 printed one line of JSON when its stdout was piped. With `-o json` added, it printed a box table. Both carry the keys, so the wrappers never echo stdout. A start prints only the API and Studio URLs, picked out of either shape. stderr streams line by line through a screen that drops every line which may carry a credential.
- **The screen also drops harmless lines.** The first live reset hid `Applying migration 20261012130317_bound_game_match_key.sql…` because of the word "key". The migration was applied (15 of 15 in `supabase_migrations.schema_migrations`). So a successful start or reset now ends with the count of held-back lines, as a failure already did (`withheldNote` in `commands.mts`).
- **Seed times are relative to `now()`.** The seed deals are 1 h, 2 h, 3 h and 2 days old, so they sort above a snapshot's deals. `post_extractions.output` follows the item shape of `scripts/extract/schema.mts`.
- **`tests/db/seed.test.ts` checks more than the contract.** The owner sees all four seed deals. The snapshot fixture starts with the empty `search_path` that a pg_dump sets.
- **`db reset` runs with stdin closed and without `--yes`.** In the CLI 2.117.0 binary, the local reset path does not prompt.
- **The snapshot dump asked for no database password.** Criterion 2.8 expected a prompt. When a `--linked` command has neither `--password` nor `SUPABASE_DB_PASSWORD`, the CLI mints a temporary login role through the Management API (`POST /v1/projects/{ref}/cli/login-role`), using the access token from `supabase login` (Context7 `/supabase/cli`, `db-config.layer.ts`). `db:push`, `db:status` and `db:check` connect the same way. No code or workflow uses the database password. The snapshot of 2026-10-14 holds 3975 `collected_posts`, 2694 `post_extractions`, 3116 `deals` and 32 `pipeline_runs` rows, plus two `setval` lines, and nothing from `auth` or `watchlist_entries`.
- **The snapshot is dumped without `--use-copy`.** The plan's command (criterion 2.8) passed `--use-copy`. `local:reset` then failed loading that file with `COPY from stdin failed: No source stream defined (SQLSTATE 57014)`. The CLI's seed loader sends each file as SQL batches, with no data stream for `COPY … FROM stdin`. The command is therefore `npx supabase db dump --linked --data-only -s public -x public.watchlist_entries -f supabase/snapshot.sql`, which writes `INSERT` statements. That is the shape `tests/db/seed.test.ts` covers. Phase 4's docs name this command. The redone dump loaded in a 32 s `local:reset`. Anon then counted 1680 listed deals: the snapshot's 1678 plus D1 and D2. The seed's deals start at id 3308, past the snapshot's `setval` of 3307.

### 2026-10-14 — Phase 3

- **`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` on more scripts.** It now also sits on `collect`, `collect:import`, `extract`, `extract:report` and `extract:report:hosted`, so `extract:report:hosted` differs from the plan's literal string. Their client now imports `src/lib/env/supabase-target.ts`, and CLAUDE.md's rule gives scripts that import `src/` this flag. `dev:hosted` needs no flag, because Next loads the config itself.
- **Check order in `createCollectorClient()`.** It checks for a missing URL, then the target guard, then a missing key, and only then builds the client. A mismatch is reported even when the key is missing too.
- **What the guard reads, beyond the contract:**
  - a URL whose scheme is neither http nor https is refused, like an unparsable one;
  - `SUPABASE_TARGET` is matched case-sensitively, and an empty value counts as unset;
  - only the three loopback hosts the contract lists pass, so `0.0.0.0` and `127.0.0.2` are refused under `local`;
  - a refusal names the URL's host only, never the raw URL or target value, since either may hold a key pasted into the wrong line.
- **`dev:hosted` runs `scripts/dev-hosted.mts`.** The plan's command, `node --env-file=.env.hosted.local node_modules/next/dist/bin/next dev`, failed check 3.11 with `--env-file= is not allowed in NODE_OPTIONS`. `next dev` forks its server and hands the parent's node flags to the fork through `NODE_OPTIONS` (`getParsedNodeOptions` in `node_modules/next/dist/server/lib/utils.js`). The script is now `node --env-file=.env.hosted.local scripts/dev-hosted.mts`. The wrapper starts `next dev` as a fresh node process with no flags, and that process inherits the hosted environment. The file still loads through `--env-file`, and a missing file still fails closed.
- **Checks 3.9–3.12, run by the agent after the owner's swap.**
  - `npm run dev` showed the seed's Elden Ring card with "Przejdź do sklepu" to `sklep.example`, followed by snapshot deals.
  - A sign-up on it went through without email confirmation, and the account is the one row in the local `auth.users`.
  - `dev:hosted` showed production's first deals and freshness time, and no seed row; after it, `npm run dev` showed the seed again.
  - `extract:report:hosted --sample 5` drew from production's 2694 links.
  - `db:status` listed all 15 migrations on both sides.
- **Observation, outside this change.** Twice after `npm run dev` sessions, Next's generated `.next/dev/types/validator.ts` held a stray tail, which fails `tsc --noEmit`. A single `next dev` session with a page load and a kill left it intact, so the cause is not pinned down. Deleting the file fixes it, because `next dev` writes it again.

### 2026-10-14 — Phase 4

- **The docs state what shipped, not the plan's wording.** That means the snapshot command without `--use-copy`, `dev:hosted` through `scripts/dev-hosted.mts`, and `--linked` commands that need no database password because the CLI mints a temporary login role. CLAUDE.md's claim that `supabase link` asks for the password stays as it was, because it was not re-tested.
- **Additions to `.env.example` beyond the contract:**
  - a note that `vercel env pull` writes `.env.local` unless given a file name, so pulls go into another file;
  - the hosted section kept as comments only, so that copying the file as `.env.local` never sets `SUPABASE_TARGET=hosted`;
  - the swap in three steps.
- **Additions to CLAUDE.md beyond the contract:**
  - under `npm run dev:hosted`, Next still reads `.env.local` for every name `.env.hosted.local` does not set;
  - `next build` and `next start` are unguarded;
  - a first "Local stack" bullet on which runs reach which project, and one on the wrappers' held-back-lines count.
- **`context/foundation/test-plan.md` §6.3** also notes that `npm run extract:report` now reads the local stack.
