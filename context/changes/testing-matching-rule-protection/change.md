---
change_id: testing-matching-rule-protection
title: Protect the matching rule with the first test runner and database tests
status: implementing
created: 2026-10-13
updated: 2026-10-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Matching rule protection".
Risks covered: #1 (a change to the matching rule silently drops watched games' deals from /my-deals, or admits a different game, platform-pinned entries and phrases included). Test types planned: runner bootstrap + database integration + unit + TS/SQL parity.
Risk response intent: #1 - prove that deals for watched entries reach /my-deals and sibling games stay out on the PRD's Silent Hill 2 example (pinned to PS5 vs unpinned), Switch 2 vs Switch, separate releases (Remake, Remastered, HD, year-numbered series) and phrase folding (case, Polish diacritics including ł, apostrophes, "&"); that the TypeScript pre-check folds exactly as the database does; and that a rule change leaves no stale stored keys. Expected values come from the PRD examples and the acceptance sample, never from running today's functions.
Bootstrap scope: the test base is none, so this phase also brings in the project's first test runner and a disposable Postgres built from supabase/migrations/, adds the test command to the CI verify job, and makes migration-only changes run it (test-plan section 5).
After creating the folder, follow the downstream continuation rule.

- **2026-10-13 — Phase 1 departures from the plan.**
  - `CLAUDE.md`, *Verification*: the plan names only the bullet at `:69`. The lint bullet before it also changed, from "Both make up the `verify` gate" to "With `npm test` they make up the `verify` gate … until all three pass", because it would be untrue once `npm test` joins `verify`.
  - `vitest.config.mts` sets no `extends` on the inline `unit` project. Vitest 5.0.4 lets an inline project inherit the root config when `extends` is left out, `resolve.alias` included, and the unit tests resolve `@/` through it.
  - Two fold rows cite the S-04 plan (`context/changes/deals-matched-to-watchlist/plan.md`) rather than the roadmap, which does not state them: the folded text is trimmed at both ends, and a phrase that folds to nothing matches nothing.
- **2026-10-13 — Phase 1 verified on GitHub.**
  - 1.7: the throwaway branch `gate-proof/failing-unit-test` added one test that fails on purpose and passes lint and Prettier. Its pull request ran CI: `verify` failed at `npm test` after lint and `format:check` passed, and `deploy` was skipped. Tomasz closed the pull request unmerged and deleted the branch.
- **2026-10-13 — Phase 2 departures from the plan.**
  - The way back to the superuser is `set session authorization` with the name the session started as (`postgres`, checked to be `rolsuper`). `reset session authorization` does nothing in PGlite's single-user backend, and the harness self-test caught that. `tests/db/harness/database.ts` switches back to `migrator` in a `finally`.
  - The revoke for 2026-10-30 is `REVOKE_DEFAULT_PRIVILEGES` in `tests/db/harness/database.ts`, not a stub file. After it runs, the build checks that `pg_default_acl` holds nothing for `migrator`, so a grant added to `tests/db/stub/default-privileges.sql` without its revoke fails the build.
  - The harness creates `amcheck` as the superuser, in a schema of its own, `extensions`, as Supabase installs extensions. The prelude does not create it.
  - The builder is `buildDatabase({ seed?: { beforeVersion, run }, extraMigrations? })`, returning `{ pg, asSuperuser(sql, params?), close() }`. Migration names must match `<14 digits>_<name>.sql`, and versions must strictly increase.
  - `runCheckFile` also requires at least one `ok` line before it reports `passed`, and checks that the session runs as `migrator`. The error prefix is the file's basename.
  - `tests/db/harness.test.ts` goes beyond the plan's two self-tests:
    - `asSuperuser` returns to `migrator` after both success and failure;
    - `amcheck` runs as the superuser and is refused with 42501 as `migrator`;
    - the seed runs as `migrator` just before `20261012070050`;
    - a seed checkpoint naming no migration throws;
    - a failing synthetic migration is named with its SQLSTATE, which costs a third database;
    - `runCheckFile` reads a failing report as not passed, rethrows an error raised before the report, and refuses a file with no report.
  - `auth.users` also has `email`. The API roles and `migrator` get `usage` on schema `auth`, because the view and the policies call `auth.uid()` as the caller.
  - `ci.yml` gains two comment lines in its `supabase/**` paragraph instead of a reflowed paragraph. In CLAUDE.md, the matching bullet also names `tests/db/matching.test.ts`, and the Verification bullet names `tests/db/stub/`.
  - `npm test` is `node scripts/test.mts run`, not Phase 1's `vitest run` (Tomasz's decision, 2026-10-13). On Windows, Vitest 5.0.4 fails every test file when the process starts in a working directory with a lowercase drive letter (`c:\…`), with "Cannot read properties of undefined (reading 'config')": its worker loads Vitest as `file:///c:/…` while the test files import it as `file:///C:/…`.
    - `scripts/test.mts` changes into `realpathSync.native(process.cwd())`, then imports `node_modules/vitest/vitest.mjs` from that path.
    - A `process.chdir` in `vitest.config.mts` was tried and did not help, because Vitest is already loaded by then.
    - CLAUDE.md, *Verification*, now says to run Vitest through `npm test -- <options>`, never `npx vitest`.
- **2026-10-13 — Phase 2, hosted default privileges (2.5).** Tomasz ran the read-only `pg_default_acl` query in the SQL editor.
  - For `postgres` in `public` it returned `arwdDxtm` on tables, `rwU` on sequences and `X` on functions, each to `anon`, `authenticated` and `service_role`. PGlite's `pg_default_acl` for `migrator` holds exactly these strings for the three roles. The stub's `grant all` matches, so `tests/db/stub/default-privileges.sql` changes only its header.
  - The hosted rows also list `postgres` itself, the owner, which holds those privileges anyway. They also carry the same three rows for `supabase_admin`, which no migration runs as. The stub reproduces neither.
- **2026-10-13 — Phase 2 verified locally (2.4).** The agent broke `20261012070050_match_deals_to_watchlist.sql` twice in the working tree and restored it each time, and Tomasz accepted the reports.
  - With `Ł` and `ł` dropped from the fold's table, `npm test` failed with "5 check(s) failed.": the folds of „ŁOWCY GIER” and of the Polish letter set, and the keys of the three titles holding `ł` (Okładka, Płyta, Pudełkowa). No view case failed, because no fixture deal or entry holds `ł`; V5 in Phase 3 adds one.
  - With the `authenticated` EXECUTE grant removed, it failed with "12 check(s) failed.": 42501 on fold_for_matching or game_match_key when A and B add entries and read `matched_deals`, and in the EXECUTE matrix.
