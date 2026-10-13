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
- **2026-10-13 — Phase 3 departures from the plan.**
  - V8 reads the table's pairs as acceptance.md does. The watched catalogue names are entries on B: Little Nightmares, Borderlands Legendary Collection, Final Fantasy VII Rebirth, Atari Mania, Dragon’s Dogma 2 and Daemon X Machina: Titanic Scion. The siblings kept apart are deals: Little Nightmares II, Borderlands 3, Remake Intergrade, Crisis Core, Atari 50, Dark Arisen and Daemon X Machina.
  - Each V8 case also has a shown side, the watched game's own deal, so a sibling case cannot pass by an entry that matches nothing. The oracle is acceptance.md's "On /my-deals" column.
  - "Dragon’s Dogma 2" reuses the existing `dogma-curly-apostrophe` deal. The Final Fantasy VII Rebirth case also hides the existing `ff7-switch` deal ("FINAL FANTASY VII", acceptance.md:66).
  - V8 has an A-side case as well: A's phrase "Dragon's Dogma" shows the Dark Arisen deal that B's game does not.
  - V5 uses A's phrase "lowcy" against the deal "Łowcy Gier", and B's phrase "żółwie ninja" against "Wojownicze Zolwie Ninja". Each case hides the other user's deal.
  - V9 is three cases, one per catalogue name, so a FAIL line names the spelling that broke.
  - Case 19 ("none of the deals only A's entries match", now step 29) drops `dogma-curly-apostrophe`, which B's "Dragon’s Dogma 2" now matches, and adds the new deals only A matches.
  - The header states the invariant per user ("one entry of each user's at most"), because B holds entries of its own now.
  - The fixture-count check uses `cardinality(ids)` and fails on 0.
  - The fixture extraction's `item_count` stays 20. Nothing reads it.
  - The file now has 100 checks: 47 fixture deals; A holds 16 games and 8 phrases, B 9 games and 2 phrases.
  - V4's deal is "Dark Souls Remastered" without "Edition", as the table gives it. Without `20261012130317`, it still keys apart, so V4 fails there through the "Shadow of the Colossus HD Edition" deal alone.
- **2026-10-13 — Phase 3 verified.**
  - 3.2: with `20261012130317_bound_game_match_key.sql` moved out, `npm test` failed with "10 check(s) failed.": the seven key rows that migration settled, V3 (the 2024 deal shown), V4 (the HD Edition deal shown) and A's whole view. The file was moved back, and Tomasz accepted the report. A second break, the view ignoring the pin, failed V1, V2 and V7 with the older pinned cases.
  - 3.3: Tomasz ran the extended `supabase/checks/matching.sql` in the hosted SQL editor: "Rolled back on purpose. All checks passed.", on PostgreSQL 17.6 with collation `en_US.UTF-8`, the two fixture users inserted into `auth.users`.
  - 3.4: the earlier commits went to `main` first (`81374d5..2b4c55e`): "CI" ran, `verify` and the production `deploy` green, and no "Database tests" run. The Phase 3 commit alone followed (`2b4c55e..adb9bb7`, only `supabase/` and `context/`): "Database tests" ran green, and "CI" did not run. Tomasz confirmed both in GitHub Actions.
- **2026-10-13 — Phase 4 departures from the plan.**
  - The synthetic fold lives in its own fixture, `tests/db/fixtures/fold-without-l-stroke.ts`. It is the body of `20261012070050` with `create or replace`, `Ł`/`ł` taken out of the first translate string and the matching `l` out of both `acelnoszz` segments. When a migration replaces `fold_for_matching`, this copy takes the new body with the same edits (its header says so).
  - The detectors are functions in `tests/db/rule-change.test.ts` (`staleDeals`, `publicBtreeIndexes`/`brokenIndexes`, `unsettledPhrases`), so D4 runs exactly the code D1 and D2 run on the real chain.
  - D1's report cuts titles at 60 characters and values at 160, each with its length, so the 1001-character title cannot flood it. The long name sits in both `title` and `english_title`, because `deals.title` has no length check.
  - D4 without the recompute asserts that the only failing index is `watchlist_entries_active_phrase_folded`, stricter than "fails on it". It also asserts that the seed holds deals and a phrase with `ł`, so D4 cannot pass on an empty corpus. The real-chain tests assert that every seeded row is in the database and that D2's list holds the folded index and `deals_pkey`.
  - The seed adds `ł` in a title only („… Płyta Blu-ray”) and in an alternative title only („Dying Light 2: Edycja Pełna”), besides „Łowcy Gier”, and „Assassin's Creed: The Ezio Collection” for the straight apostrophe.
  - The seed inserts the newer „wiedzmin” before the older „Wiedźmin”, so the newer gets the lower id. D3's named assertion then tells the settle's "by `created_at`, then `id`" from "by `id`".
  - The NFD and NFC Pokémon spellings are written as `\u0301` and `\u00e9` escapes. The seed throws if an NFD spelling equals its NFC form.
- **2026-10-13 — Phase 4 verified locally (4.4).** With `update public.deals set title = title;` removed from `20261012130317_bound_game_match_key.sql`, D1 on the real chain listed „Just Dance 2025 Edition”, „Shadow of the Colossus HD Edition” and the 1001-character title, and not the control „Silent Hill 2”. The line was restored, and Tomasz accepted the report.
  - Two more breaks, both restored, were caught:
    - a settle ordered by `id` alone failed D3's named assertion;
    - with no settle at all, the build failed at `20261012070050` with 23505 on `watchlist_entries_active_phrase_folded`.
- **2026-10-13 — Phase 5 departures from the plan.**
  - `tests/db/fixtures/fold-corpus.ts` holds 8,713 inputs: 45 curated and 8,668 generated. The curated ones are matching.sql's 15 fold inputs, 8 PRD and roadmap examples, the 20 catalogue names without RAWG's year, and the pangram in both cases. The parity test's floor is 8,000.
  - The test folds the whole corpus in one `unnest($1::text[]) with ordinality` query as `migrator`. A failure lists up to 20 inputs as code points, with both outputs.
  - The CLAUDE.md bullet also names the corpus file.
- **2026-10-13 — Phase 5 verified locally (5.3).** With `ʼ` removed from `FOLD_FROM` in `rules.ts`, the parity test failed on 2 of 8,713 inputs, both holding U+02BC (`a ʼ b`: TS "a b", SQL "ab"), as the earlier change measured. With `ő`/`Ő` removed from the SQL table instead, it failed on 41. Both files were restored, and Tomasz accepted the report.
- **2026-10-13 — Phase 6 departures from the plan.**
  - The migration is `20261013115104_fold_nfc_first.sql`. Its fold body is 20261012070050's, copied byte for byte by script, with `pg_catalog.normalize(value, 'NFC')` in place of `value` as `translate`'s input. The plan's open point is settled: `pg_catalog.normalize(value, NFC)` fails with 42703, and the quoted `'NFC'` works under `search_path = ''`. `normalize(text, text)` is immutable and parallel safe in PGlite's `pg_proc`. The settle statement is 20261012070050's, and a diff confirms it.
  - `tests/db/fixtures/fold-without-l-stroke.ts`, D4's synthetic fold, now copies the new body with the same two `ł` edits; a script confirms it. The plan's Changes Required does not name the file, but without the refresh D4 would also report the NFD deal. Its header says a fold change must refresh it.
  - The red tests:
    - two unit classes, Pokémon and Wiedźmin in NFD, each with a near miss that keeps the accent from becoming a space ("Poke mon", "Wiedz min");
    - one `isPhraseOnList` row;
    - in `matching.sql`: fold row 37 (`E'Poke\u0301mon'` → `pokemon`), the deal `pokemon-nfd-title`, A's game "Pokémon Legends: Z-A" (990018, NFC), B's phrase "pokemon", cases 40 and 41, and both whole views. The header names the new migration.
    - D3's named assertion on the seeded Pokémon pair. The seed now exports `POKEMON_NFC` and `POKEMON_NFD`, and both named D3 tests share `activeAndRemoved`.
  - The Edit tool used for this phase turned `\u0301` escapes into raw combining marks. Every NFD input was rewritten as an escape by script, `\u0301` in TS and `E'…\u0301…'` in SQL, and each touched file was checked to hold no raw combining mark. `matching.sql` and the migration are entirely NFC.
  - Before the fix, the plan's pre-push query was dry-run in PGlite, on the chain with the new migration still empty and with the Phase 4 seed. It returned `deals_not_nfc` 1 (the seeded NFD deal) and `phrase_groups_to_settle` 1 (the seeded Pokémon pair). The Wiedźmin pair was already settled and did not count.
  - Residual: parity runs Node's NFC against PG 18.6's. Hosted 17.6 may carry an older Unicode table. That changes nothing for Latin letters and their accents, but could for code points assigned since.
- **2026-10-13 — Phase 6 verified before the push.**
  - 6.4: with `20261013115104_fold_nfc_first.sql` holding only the new function, D1 listed the seeded NFD deal (stored "poke mon legends z a", fresh "pokemon legends z a"). D2 failed on `watchlist_entries_active_phrase_folded` (XX001), D3 found the Pokémon pair active and folding alike to "pokemon", and the named D3 test failed. With the settle, the reindex and the recompute, all passed. Tomasz accepted the report.
  - Break checks, both restored: NFC taken out of the TS twin alone failed the NFD unit rows and parity (337 of 8,713 inputs). Taken out of the SQL twin alone, it failed `matching.sql`, parity, D3 and D4.
  - 6.5: Tomasz ran the read-only pre-push query in the SQL editor and got `deals_not_nfc` 0 and `phrase_groups_to_settle` 0. No production deal holds a title outside NFC, and no phrase is settled. The migration rewrites every deal row through `update public.deals set title = title` but changes no key, and it marks no phrase removed. This also answers F5's open question: none of the sources has sent NFD so far.
