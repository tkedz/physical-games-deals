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
