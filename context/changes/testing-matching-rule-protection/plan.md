# Matching Rule Protection Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` ("Matching rule protection", Risk #1). It brings in the project's first test runner and a disposable Postgres built from `supabase/migrations/`. On top of them it adds three layers of protection for the matching rule:

- what `/my-deals` lists;
- what a rule change leaves behind (stale stored keys, a stale index, unsettled phrases);
- whether the TypeScript pre-check folds as the database does.

`npm test` becomes part of the CI `verify` gate and of the local migration loop. A push that touches only `supabase/**` gets its own test workflow, without a deploy.

One product change rides in this phase by decision of 2026-10-13: review F5 is fixed. Both fold twins normalise to NFC first, so an accent typed as a separate character no longer splits a word. It lands last among the code phases, so the layers above verify it.

## Current State Analysis

- **No tests and no runner.** `package.json` has no `test` script, and CLAUDE.md states "There is no test runner and no tests" (`CLAUDE.md:69`). The only `*.test.mjs` files belong to `.claude/skills/` and use `node:test`.
- **The rule runs entirely in Postgres, in three places.**
  - Stored deal keys: the generated `deals.match_keys`/`match_text` (`supabase/migrations/20261012070050_match_deals_to_watchlist.sql:129-133`).
  - Entry keys computed on every read, as the caller, inside `matched_deals` (`:169-186`).
  - The folded unique phrase index (`:159-161`).
  - The TS fold (`src/lib/watchlist/rules.ts:156-168`) only predicts phrase duplicates for `isPhraseOnList` (`:200-214`). Its sole consumer is the "Obserwuj frazę" button (`src/components/watchlist/phrase-offer.tsx:49-52`).
- **The truth table is hand-run.** `supabase/checks/matching.sql` holds 80 checks. It always ends in a deliberate exception whose message is the report: "Rolled back on purpose. All checks passed." or "N check(s) failed.", then one `ok`/`FAIL` line per check (`:563-565`).
  - Research ran it unmodified in PGlite 0.5.9 against all 11 migrations, with a non-superuser owner and a Supabase-grants stub: 80/80.
  - It has gaps: no `switch-2` deal against a `switch` pin, no year-numbered or Remastered/HD siblings at view level, no `ł` or `&` at view level, no pinned phrase, no NFD input, no stale-key check (research, *Coverage gaps*).
- **A rule change can silently split the two sides.** `create or replace function` recomputes neither stored keys nor an expression index (`20261012070050:14-19`). A forgotten `update public.deals set title = title` leaves deal keys on the old rule while entry keys use the new one. A forgotten `reindex` leaves the folded index stale. Research reproduced both, and showed both are detectable (*Stale stored keys: the experiment*).
- **CI ignores `supabase/**`** (`.github/workflows/ci.yml:24-40`), so a migration-only push runs nothing. `verify` runs `npm ci`, lint and `format:check` (`:53-65`); `deploy` needs it and deploys `--prod` on main (`:68,114`).
- **F5 is live in both twins.** The translate table holds precomposed letters only, so `Poke\u0301mon` folds to `poke mon` (`context/changes/deals-matched-to-watchlist/reviews/impl-review.md:145-158`). It was skipped then and is decided now: fix it.

## Desired End State

- `npm test` runs Vitest with two projects:
  - `unit` (`tests/unit/`): pure rules, under a second.
  - `db` (`tests/db/`): PGlite 0.5.9 built from `supabase/migrations/` behind a Supabase stub, about 10–15 s.
- CI `verify` runs `npm test` before `deploy`. A push touching only `supabase/**` runs the suite in `.github/workflows/database-tests.yml` without deploying. CLAUDE.md's migration loop runs `npm test` before `db:push`.
- `supabase/checks/matching.sql` runs in `npm test` and still runs unchanged in the hosted SQL editor. It covers every view-level example the PRD, roadmap S-04, review F2 and the acceptance families give, both "shown" and "hidden".
- A migration that changes a matching function without the recompute, without the reindex, or without settling phrases fails `npm test`.
- The TS and SQL folds are compared over a shared corpus of curated inputs and generated code-point probes. The comparison asserts agreement only; correctness is asserted elsewhere.
- F5 is fixed: an NFD title or phrase matches as its precomposed form, in both twins and on production.
- `context/foundation/test-plan.md` §6.1 and §6.2 describe how to add a unit test and a database test, citing the reference tests shipped here.

Verify it by running `npm test`, the hosted `matching.sql` run ("All checks passed."), and the Actions history: a `supabase/`-only push shows "Database tests" and no "CI".

### Key Discoveries:

- **The rule is locale-independent by construction:**
  - the fold uses `translate`, not `lower()` (`20261012070050:21-25`);
  - regex classes are spelled in ASCII (`20261012130317_bound_game_match_key.sql:15-16`);
  - keys sort `collate "C"` (`20261012070050:89-98`).

  So PGlite's C collation does not distort matching or fold parity. The only locale-dependent piece is the older `lower(phrase)` index (`20261007141021_create_watchlist_entries.sql:37-38`). It decides only for phrases that fold to `''`, and PGlite lowers ASCII only there.
- **`isPhraseOnList` predicts both unique indexes:** the fold plus `toLowerCase()` (`rules.ts:79-81,205-212`). Its `lower()` half cannot be compared against PGlite (see What We're NOT Doing).
- **`matching.sql` constraints:**
  - It inserts two fixture users into `auth.users` and acts as each role through `set local role` and `request.jwt.claims` (`:59-81,185-186,286-288`).
  - Each fixture deal may be matched by at most one of A's entries, so a broken case cannot hide behind another entry (`:23-26`).
  - The fixture-count check hard-codes 20 (`:241`).
- **Stub fidelity (research, *Bootstrap*):**
  - The migrations need `anon`, `authenticated`, `service_role`, Supabase's default privileges, `auth.uid()`, and `auth.users` as an FK target. No migration creates an extension or names the role `postgres`.
  - A superuser owner hides grant gaps. Run as a non-superuser, the FK to `auth.users` needed REFERENCES.
  - PGlite's `username` option only issues `SET ROLE`; `SET SESSION AUTHORIZATION` works. `clone()` reconnects as `postgres` (subagent read of the 0.5.9 build).
- **`amcheck`** ships as `@electric-sql/pglite/contrib/amcheck`. Its functions are revoked from PUBLIC, so call `bt_index_check(index, true)` as the superuser.
- **Vitest 5.0.4 with `@types/node ^24`** installs cleanly. `tsc --noEmit` and `npm run lint` give 0 errors (exported-copy probe, 2026-10-13). In Vitest 5, inline projects inherit the root config, `resolve.alias` included.
  - Without an explicit `include`, Vitest would collect `.claude/skills/**/*.test.mjs`.
  - `next build` type-checks `tests/**` and `vitest.config.mts` (`tsconfig.json:31-38`).
  - Lint is `--max-warnings 0` over every `.ts`/`.mts`.
- **Every test package stays in `devDependencies`,** because `collect.yml:57` runs `npm ci --omit=dev`.
- **A starting point for the stub exists:** research's stub files (`supabase-prelude.sql`, `default-privileges-until-2026-10-30.sql`) and the stale-key probes. They sit in the earlier session's temporary scratchpad, `%TEMP%\claude\c--Users-tomasz-kedziora-Desktop-10x-physical-games-deals\d6c2f307-4232-4ee7-80db-a5ed65ca751b\scratchpad\` (`pglite-probe/stub/`, `stale-probe/`). Use them if they still exist; do not depend on them.

## What We're NOT Doing

- **The acceptance sample's four misses** (Dark Arisen ×3, the Fortnite bundle) are an accepted cost, with no test (decision 2026-10-13). The PRD Non-Goal says the product does not promise completeness, and the measurement met the threshold (39/43, `prd.md:126`).
- **No normalisation beyond NFC.** NFKC would widen the rule (e.g. "Ⅶ" → "VII", fullwidth letters), which is a product decision of its own. Review F5's fix names NFC.
- **No DB comparison for the `lower(phrase)` half of `isPhraseOnList`.** PGlite's C collation lowers ASCII only, while the hosted database lowers by `en_US.UTF-8`. It matters only for phrases that fold to `''`.
- **Expiry and the listed predicate of `/my-deals`** belong to Risk #2, rollout Phase 2.
- **Cross-user isolation and grants beyond the four matching functions and `matched_deals`** belong to Risk #4, rollout Phase 4. `isolation.sql` and `grants.sql` stay in `context/changes/watchlist-from-catalog/checks/`.
- **`public.collected_posts` relying on default privileges** (research Open Question 9) is left for `/10x-test-plan --refresh`.
- **Edits to test-plan §1–§5,** including research's corrections to §2 and the §3 status flips, are left to `/10x-test-plan`. This plan edits §6 only.
- **No local Supabase stack with pgTAP** (needs Docker, which is not running here), and no hunt for a PG 17 build of PGlite.
- **No caching of a migrated dump across test files** (`globalSetup` + `dumpDataDir`). Revisit if the `db` project passes about 30 s.
- **The new workflow is not a required status check.** A path-filtered workflow leaves a required check "Pending" on pull requests it skips (`ci.yml:15-17`).
- **No new assertions on exact key strings.** New cases assert shown or hidden. The existing key rows in `matching.sql` stay as they are.
- **No AI-native layer in this phase** (checked: 2026-10-13). The rule is deterministic SQL and a pure function; the post-edit hook is rollout Phase 2's.

## Implementation Approach

Bootstrap first, then the protection layers by signal for `/my-deals`, then the rule change they protect.

1. **Phase 1:** the runner and the cheap unit layer (the TS fold and `isPhraseOnList`).
2. **Phase 2:** the disposable database and the existing truth table, automated as is.
3. **Phase 3:** the view-level cases the truth table lacks.
4. **Phase 4:** the detectors for what a rule change leaves behind.
5. **Phase 5:** fold parity. It is last among the layers because it protects only the add-phrase check.
6. **Phase 6:** the F5 fix, written test-first against all of the above.
7. **Phase 7:** the cookbook.

Expected values come from the PRD (US-01 AC1, FR-010, Business Logic), roadmap S-04, review F2/F4/F5 and the acceptance labels (`acceptance.md:30-33,61-68`). They never come from running today's functions:

- view cases assert shown or hidden;
- unit tests assert which spellings fold alike, each paired with a near miss that must stay apart, so a constant function cannot pass;
- the detectors assert consistency properties (stored = fresh, index = heap), not values;
- parity asserts agreement only.

Decisions taken in planning (2026-10-13):

| Question (research) | Decision | Basis |
|---|---|---|
| OQ1 F5 | Fix now: NFC first in both twins | User |
| OQ2 acceptance misses | Accepted cost, no tests | User |
| OQ3 suite shape | Extend `matching.sql`; one generic Vitest wrapper runs it | User; CLAUDE.md calls it the truth table, and the hosted run gains every case |
| OQ4 Vitest | `vitest ^5.0.4` with `@types/node ^24` | Clean install, `tsc` and lint in the exported-copy probe; `engines` is 24.x |
| OQ5 CI | `npm test` in `verify` + `.github/workflows/database-tests.yml` on `supabase/**`, no deploy | User; `ci.yml:3-5` |
| OQ6 PGlite | Pin exactly `0.5.9` (PG 18.6); accept the gap to hosted 17.6 | The rule is locale-independent by construction. PG-18-only syntax fails loudly at `db:push`, and the hosted `matching.sql` run stays the PG 17.6 authority |
| OQ7 default privileges | The stub mirrors what Tomasz's read-only `pg_default_acl` query returns; it uses `grant all` until then | One query; the stub is shared with rollout Phase 4 |
| OQ8 local loop | CLAUDE.md: `npm test` before `npm run db:push -- --dry-run` | CI cannot gate a hand-applied migration |

## Critical Implementation Details

- **Timing & lifecycle:**
  - The rule-change seed must be inserted immediately before `20261012070050`, the first matching migration, or it never meets the migrations that recompute keys. The harness throws if that checkpoint is missing, so a renamed file fails loudly.
  - For F5 on production, `db:push` comes before the code push. Between the two, the deployed `rules.ts` without NFC disagrees with the database for phrases holding combining sequences, in either direction. Keep the window to minutes.
- **State sequencing:**
  - The F5 migration runs in this order: replace `fold_for_matching` → settle the phrases that newly fold alike → `reindex index public.watchlist_entries_active_phrase_folded` → `update public.deals set title = title`.
  - Reindexing before the settle fails on duplicates.
  - `amcheck` and the default-privilege switch run as the PGlite superuser. Migrations and check files run as the non-superuser owner.

## Phase 1: Runner and Unit Tests for the Fold

### Overview

Install Vitest, configure a `unit` project, and cover the TS fold and `isPhraseOnList` with expected values from the PRD and roadmap. `npm test` joins CI `verify`.

### Test specification

- **Behaviour asserted:**
  - `foldForMatching` makes spellings fold alike that the PRD and roadmap call equal: letter case; Polish diacritics with `ł`/`Ł` mapped explicitly; other Latin diacritics ("pokemon" finds "Pokémon"); the six apostrophes removed; "&" read as "and"; every other run of punctuation one space.
  - It keeps near misses apart: "Z-A" ≠ "ZA", "Mario & Luigi" ≠ "Mario Luigi", "Wiedźmin 3" ≠ "Wiedźmin".
  - `isPhraseOnList` refuses exactly what the two unique indexes refuse. The same phrase folded alike on the same platform is on the list. Another platform, null ≠ `ps5`, is not. "!!!" against "!!!" is on the list through the `lower(phrase)` rule; "???" against "!!!" is not. A game entry never blocks a phrase.
- **Regression caught:**
  - A table edit that drops or misplaces a letter (e.g. `ł`).
  - A changed step order ("&" before the table).
  - A pre-check that disables "Obserwuj frazę" for a phrase the database would accept (the silent direction).
  - A degenerate fold, caught by the near misses.
- **Research source:** *What the PRD and the roadmap settle* (`prd.md:75,100,102`; `roadmap.md:186-187`); roadmap S-04 F4 decision ("duplicates are judged on the same normalisation"); `matching.sql:525-533`, the database's half of the same scenarios.
- **Edge cases:** an uppercase `Ł` and the full Polish set in both cases (pangram "Zażółć gęślą jaźń"); all six apostrophes; a phrase that folds to `''`; a pinned against an unpinned duplicate.
- **Anti-pattern avoided:** expected strings produced by running `foldForMatching`, and ASCII-only fixtures. Every class carries non-ASCII input, and the classes are asserted as equalities between spellings plus near misses.

### Changes Required:

#### 1. Dependencies and script

**File**: `package.json`

**Intent**: Add the runner and align the Node types with `engines` 24.x. Add `npm test`.

**Contract**: `devDependencies`: `"vitest": "^5.0.4"`; `"@types/node": "^20"` → `"^24"` (write the range by hand; `npm install` would write `^24.19.2`). `scripts.test`: `"vitest run"`. No test package goes in `dependencies`.

#### 2. Vitest configuration

**File**: `vitest.config.mts` (new)

**Intent**: Explicit discovery, the `@` alias, and a `unit` project.

**Contract**:
- `export default defineConfig({...})` from `vitest/config`. A call expression satisfies `import/no-anonymous-default-export`.
- `resolve.alias`: `@` → `fileURLToPath(new URL("./src", import.meta.url))`. Use no `vite-tsconfig-paths`, and not `.pathname`, which yields `/C:/…` on Windows.
- `test.projects`: one inline project named `unit`, with `include: ["tests/unit/**/*.test.ts"]` and environment `node`. Phase 2 adds `db`.
- Prettier style: double quotes, semicolons.

#### 3. Fold unit tests

**File**: `tests/unit/watchlist/fold.test.ts` (new)

**Intent**: The equivalence classes and near misses from the test specification, table-driven: each row is a list of spellings that must fold alike, or a pair that must differ.

**Contract**:
- Imports `foldForMatching` from `@/lib/watchlist/rules`. A class asserts that every spelling folds to the same non-empty string; a near-miss row asserts inequality.
- Each row cites its source in its name, e.g. `"roadmap S-04: apostrophes removed"`.
- One row asserts "!!!" folds to `''` (S-04 plan: a phrase that folds to nothing matches nothing).

#### 4. Phrase pre-check unit tests

**File**: `tests/unit/watchlist/phrase-on-list.test.ts` (new)

**Intent**: `isPhraseOnList` scenarios from the test specification, with `WatchlistEntry` literals built from `src/lib/watchlist/types.ts`.

**Contract**: one row per (list, phrase, platform) → boolean. It includes "Mario & Luigi" against "mario and luigi" and "Dragon’s Dogma" against "dragons dogma", both on the list.

#### 5. CI gate

**File**: `.github/workflows/ci.yml`

**Intent**: Make the tests part of the gate that `deploy` waits for.

**Contract**: in `verify`, add `- run: npm test` after `npm run format:check`. Nothing else changes in this phase.

#### 6. Rules file

**File**: `CLAUDE.md`

**Intent**: Replace the "no test runner" fact.

**Contract**: the bullet at `CLAUDE.md:69` becomes a fact about `npm test`: Vitest, the `unit` project in `tests/unit/`, part of the CI `verify` gate. Facts only, no rationale (lessons.md holds that).

### Success Criteria:

#### Automated Verification:

- `node --version` prints v24.x before any install
- `npm ci` completes without ERESOLVE after the dependency changes
- `npm test` passes and collects only `tests/unit/**` files
- `npm run lint` passes
- `npm run format:check` passes
- `npm run build` passes, type-checking `tests/` and `vitest.config.mts`

#### Manual Verification:

- Gate proof: a throwaway pull request carrying one deliberately failing unit test shows `verify` failing and `deploy` never starting; the pull request is then closed and its branch deleted

The gate proof follows lessons.md, "A gate that exits 0 on warnings is not a gate".

**Implementation Note**: After each phase's automated verification passes, pause for the human to confirm its manual items before the next phase. Record any departure from this plan in `change.md` in the commit that makes it (lessons.md).

---

## Phase 2: Disposable Postgres and matching.sql as a Test

### Overview

Build PGlite from the repository's migrations behind an honest Supabase stub, and run `supabase/checks/matching.sql` unmodified inside `npm test`. Wire the `supabase/**` workflow and the local migration loop.

### Test specification

- **Behaviour asserted:** all 80 existing checks pass against the repository's migrations, applied by a non-superuser owner under Supabase's default privileges. They cover:
  - fold and key cases;
  - keys stored by `service_role`;
  - A's and B's views, including PRD US-01 AC1: "Silent Hill 2" pinned to PS5 shows only the PS5 deal, unpinned it also shows the Xbox one;
  - anon refused;
  - the EXECUTE matrix;
  - phrase duplicates.
- **Harness self-tests assert:** the session user is not a superuser; a synthetic migration dated before 2026-10-30 leaves a new table granted to the three API roles, and one dated after leaves it granted to none.
- **Regression caught:** any migration that flips a truth-table case, or drops an EXECUTE grant (42501 at insert or read, not at push). Also a stub that silently turns superuser or models the wrong default privileges.
- **Research source:** *Bootstrap: a disposable Postgres* (stub, non-superuser owner, timings, fidelity); Summary 2; *Default privileges and the 2026-10-30 change*.
- **Edge cases:** the 42501 on the `auth.users` FK under a non-superuser owner; migrations dated on either side of 20261030; a check file that errors before its final report.
- **Anti-pattern avoided:** a superuser stub that hides grant gaps; testing with the secret key; re-deriving the file's expected values.

### Changes Required:

#### 1. PGlite dependency and the db project

**File**: `package.json`, `vitest.config.mts`

**Intent**: Add the database and a project for its slower tests.

**Contract**:
- `devDependencies`: `"@electric-sql/pglite": "0.5.9"`, exact.
- A second inline project named `db`: `include: ["tests/db/**/*.test.ts"]`, environment `node`, `testTimeout` 30 000 ms, `hookTimeout` 60 000 ms.

#### 2. Supabase stub

**File**: `tests/db/stub/supabase-prelude.sql`, `tests/db/stub/default-privileges.sql` (new)

**Intent**: What a hosted project gives the migrations, and nothing more.

**Contract**:
- **Prelude**, run by the PGlite superuser:
  - roles `anon`, `authenticated` and `service_role` (nologin, noinherit; `service_role` bypassrls) and `authenticator`;
  - a non-superuser owner, `migrator`, that stands in for hosted `postgres`. It is a member of the three API roles, so `set local role` works as in the SQL editor, and may create in `public`;
  - usage on `public` for the API roles;
  - schema `auth` with `auth.users` (at least `id uuid primary key`, `created_at timestamptz default now()`) and select, insert and references on it for `migrator`;
  - `auth.uid()`, `auth.role()` and `auth.jwt()` reading `request.jwt.claim.*`, then `request.jwt.claims` (Supabase's definition).
- **Default privileges**: what `migrator` creates in `public` is granted to the three API roles as hosted `pg_default_acl` shows for `postgres`. Tomasz runs, read-only, `select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl where defaclnamespace = 'public'::regnamespace;`. Until he does, use `grant all` on tables, sequences and functions.
- The header of each file says what it imitates and where it came from.

#### 3. Migration harness

**File**: `tests/db/harness/database.ts` (new)

**Intent**: One function that returns a migrated database, with the hooks the later phases need.

**Contract**: an exported async builder (name and option shape are the implementer's) that:
- creates an in-memory `PGlite` with the `amcheck` extension loaded;
- runs the prelude as superuser, then `SET SESSION AUTHORIZATION migrator`. Use neither the `username` option nor `clone()`;
- before each migration, applies the default privileges if the migration's version is below `20261030000000`, and revokes them before the first version at or above it;
- applies `supabase/migrations/*.sql` in filename order, one `exec` per file. A failure names the file and the SQLSTATE;
- accepts a seed hook that runs immediately before a named migration version, and throws if that version does not exist;
- accepts synthetic extra migrations appended after the real chain, under the same date rule;
- exposes a way to run one statement as the superuser (for `amcheck`), returning to `migrator` afterwards.

#### 4. Check-file runner

**File**: `tests/db/harness/check-file.ts` (new)

**Intent**: Run any `supabase/checks/*.sql` that follows `matching.sql`'s report convention, and turn its report into a result.

**Contract**:
- `runCheckFile(db, path)` returns `{ passed, summary, failures: string[], lines: string[] }`.
- It runs the file as `migrator` and expects the deliberate exception whose message starts with "Rolled back on purpose.".
- Any other error is rethrown, prefixed with the file name. Rollout Phase 4 reuses it for the isolation and grants checks.

#### 5. Tests

**File**: `tests/db/matching.test.ts`, `tests/db/harness.test.ts` (new)

**Intent**: `matching.sql` as one test, and the harness self-tests from the test specification.

**Contract**: the matching test asserts `passed`, with a failure message listing every `FAIL` line. The self-tests use synthetic migrations dated `20261029…` and `20261031…` that each create one table, and check `has_table_privilege` for the three roles.

#### 6. Migration-only workflow

**File**: `.github/workflows/database-tests.yml` (new); `.github/workflows/ci.yml`

**Intent**: A push touching only `supabase/**` runs the suite without a build or a deploy.

**Contract**:
- `on.push.branches: [main]` and `on.pull_request`, both with `paths: ["supabase/**"]`.
- One job: `actions/checkout@v5`, `actions/setup-node@v5` (`node-version-file: .nvmrc`, `cache: npm`), `npm ci`, `npm test`.
- `permissions: contents: read`, and concurrency as in `ci.yml`.
- The header comment says that `ci.yml` ignores `supabase/**` so unchanged code is not redeployed, that a mixed push runs the suite in both workflows, and that this check must not become a required status check.
- `ci.yml`'s header paragraph on `supabase/**` (`:7-10`) points to this workflow.

#### 7. Rules file

**File**: `CLAUDE.md`

**Intent**: The local loop is the real migration gate, because `db:push` is human-only.

**Contract**:
- *Database migrations*: the loop becomes `npm run db:new -- <name>` → `npm test` → `npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`.
- *Deal matching*: the `matching.sql` bullet adds that `npm test` runs it in PGlite against the migrations; the hosted SQL-editor rerun stays.
- *Verification*: `npm test` also has a `db` project in `tests/db/`, with PGlite built from `supabase/migrations/`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, with `tests/db/matching.test.ts` reporting matching.sql's "All checks passed."
- The harness self-tests pass: the owner is not a superuser, and the default privileges follow the migration date
- `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual Verification:

- Proof by breaking, locally and reverted: a migration edit that stops folding `ł` and a removed `authenticated` EXECUTE grant each make `npm test` fail with FAIL lines naming the affected checks
- Tomasz runs the read-only `pg_default_acl` query in the SQL editor, and the stub's default privileges match the hosted `postgres` rows, with any difference recorded in change.md

---

## Phase 3: View-Level Cases in matching.sql

### Overview

Add the view-level cases the truth table lacks, each with a "shown" side and a "hidden" side, so the hosted run and `npm test` both gain them.

### Test specification

- **Behaviour asserted**: the cases below. Titles are suggestions; the characters, platforms and pairings are the contract. "A" and "B" are the file's two fixture users. The cases are spread across them so that each fixture deal is matched by at most one of A's entries (`matching.sql:23-26`).

| # | Entry (user, kind, text, pin) | Deal (title, platform) | Expected | Oracle |
|---|---|---|---|---|
| V1 | A, game "The Legend of Zelda: Tears of the Kingdom", `switch` | "… – Nintendo Switch 2 Edition" on `switch-2`; plain title on `switch` | hidden; shown | PRD US-01 AC1 (a pin narrows to that platform); `switch-2` is its own platform (`deals-matched-to-watchlist/plan.md:102`, `change.md:53`) |
| V2 | B, same game, `switch-2` | the same two deals | shown on `switch-2`; hidden on `switch` | as V1 |
| V3 | A, game "Just Dance 2025 Edition" (as the catalogue names it), unpinned | "Just Dance 2025 Edition"; "Just Dance 2024 Edition" | shown; hidden | review F2 (`impl-review.md:94-99`): before the fix both keyed to "just dance", so the 2024 deal showed |
| V4 | A, game "Dark Souls"; A, game "Shadow of the Colossus"; B, game "Dark Souls Remastered" | "Dark Souls Remastered"; "Shadow of the Colossus HD Edition" | hidden for A, "Dark Souls Remastered" shown for B | `roadmap.md:186` (Remake, Remastered and HD stay); `acceptance.md:30-33` |
| V5 | A, phrase in ASCII ("lowcy"); B, phrase with `ł`/`ó`/`ż` | a title spelled with `Ł`; a title typed in ASCII | each phrase shown its deal | `roadmap.md:187` (`ł` mapped explicitly); FR-010 |
| V6 | A, phrase "Mario & Luigi"; B, phrase "mario and luigi" | "Mario and Luigi: Brothership"; "Mario & Luigi: Brothership" | both shown to both users | `roadmap.md:187` ("&" reads "and") |
| V7 | A, phrase "silksong", `switch` | "Hollow Knight: Silksong" on `switch`; the same on `ps5` | shown; hidden | `prd.md:102` (a pin applies to phrases as to games) |
| V8 | A or B, catalogue names from `acceptance.md:61-68` | "Little Nightmares II" vs "Little Nightmares"; "Borderlands 3" vs "Borderlands Legendary Collection"; "Final Fantasy VII Remake Intergrade" and "Crisis Core –Final Fantasy VII– Reunion" vs "Final Fantasy VII Rebirth"; "Atari 50" vs "Atari Mania"; "Dragon's Dogma: Dark Arisen" vs "Dragon’s Dogma 2" (on B: A's phrase "Dragon's Dogma" would show it); "Daemon X Machina" vs "Daemon X Machina: Titanic Scion" | hidden | acceptance labels, "kept apart, rightly" |
| V9 | A, games "Pokkén Tournament DX", "Assassin’s Creed The Ezio Collection", "Mighty Morphin Power Rangers: Rita's Rewind" | "Pokken Tournament DX"; "Assassin's Creed: The Ezio Collection"; "… Rita’s Rewind" | shown | PRD Business Logic (case, diacritics and punctuation ignored); names from `acceptance.md:37-58` as inputs |

- **Regression caught:**
  - `switch` and `switch-2` merged, or the pin ignored.
  - F2 returning at view level (it escaped both the truth table and acceptance).
  - A kept word such as Remastered or HD stripped.
  - `ł`, "&" or an apostrophe lost between phrase and title.
  - A pinned phrase treated as unpinned.
  - A sibling game admitted, against the PRD Guardrail: "Fałszywe trafienie niszczy zaufanie…" (`prd.md:40`).
- **Research source:** *Coverage gaps in `supabase/checks/matching.sql`*; *What the PRD and the roadmap settle*; *The acceptance sample, as an oracle*.
- **Edge cases:** the same deal hidden for A and shown for B (V2, V4); both directions of every fold mapping (V5, V6); a sibling whose title contains the watched name as a prefix (V8).
- **Anti-pattern avoided:**
  - Loading the acceptance sample as fixtures: only names and families are reused, and the four misses are left out.
  - Expected keys from running functions: no new key-string rows.
  - ASCII-only fixtures: V5, V6 and V9 carry `ł`, `Ł`, `ó`, `ż`, `é`, `’`, `&`.

### Changes Required:

#### 1. Truth table

**File**: `supabase/checks/matching.sql`

**Intent**: Add the deals, entries and cases V1–V9 in the file's existing tables.

**Contract**:
- New fixture rows in section 2's VALUES, labelled.
- New entries in A's and B's inserts.
- New cases in the sections 3/4 VALUES, each with `shown` and `hidden` arrays.
- A's and B's whole-view expected arrays updated.
- The fixture-count check counts the new total, or `cardinality(ids)`, instead of 20.
- The header's description of users and sections stays accurate.
- The file still runs unchanged in the hosted SQL editor and still ends in the deliberate exception.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with every new case reported `ok`

#### Manual Verification:

- Proof: with `20261012130317_bound_game_match_key.sql` moved out of `supabase/migrations/` locally, `npm test` names V3 and V4 as FAIL; the file is then restored
- Tomasz runs the extended matching.sql in the hosted SQL editor and gets "All checks passed."
- The push of this phase (only `supabase/` and `context/` files) shows a "Database tests" run and no "CI" run in GitHub Actions

---

## Phase 4: Rule-Change Detectors

### Overview

Seed rows before the first matching migration, apply the whole chain, and assert that nothing the chain changed was left behind: stored keys, the folded index, and phrases that fold alike. Prove the detectors with a synthetic future migration.

### Test specification

- **Behaviour asserted, after the real chain:**
  - D1: every deal's stored `match_keys`/`match_text` equals `deal_match_keys`/`deal_match_text` computed now.
  - D2: every btree index in schema `public` passes `bt_index_check(index, true)`.
  - D3: no two active phrase entries of one user and platform fold alike to a non-empty text under the current fold. The seeded pair "Wiedźmin" (older) and "wiedzmin" (newer) leaves "Wiedźmin" active and "wiedzmin" removed.
- **D4, the synthetic proof:** the chain plus a synthetic migration that redefines `fold_for_matching` so that `ł` is no longer folded.
  - Without recompute and reindex, D1 lists the seeded rows containing `ł`/`Ł` and not the control "Silent Hill 2", and D2 fails on `watchlist_entries_active_phrase_folded`.
  - With `update public.deals set title = title` and the reindex, both are clean.
- **Regression caught:** a migration that changes a matching function and forgets the recompute (deals keep old keys, so watched games silently drop from `/my-deals`), forgets the reindex (the index is wrong), or forgets the settle. Also a seed corpus that stops exercising the rule.
- **Research source:** *Stale stored keys: the experiment*; Summary 6 (detectable only if the seed precedes the first matching migration and holds affected rows); `20261012070050:135-152` (the settle rule: the oldest stays, by `created_at`, then `id`); roadmap S-04 F4 decision.
- **Edge cases:** rows that `20261012130317` changed ("Just Dance 2025 Edition", "Shadow of the Colossus HD Edition", a title of 1001 characters, which now keys to `''`); `ł`, "&" and apostrophe titles; NFD and NFC "Pokémon" titles and phrases, for Phase 6; a control row no change affects.
- **Anti-pattern avoided:** expected keys from running functions. D1–D3 are consistency properties, and D4's expectation names seeded rows by their characters, not by computed keys. The detectors are proven by breaking, not assumed (lessons.md).

### Changes Required:

#### 1. Seed corpus

**File**: `tests/db/fixtures/rule-change-seed.ts` (new)

**Intent**: The rows inserted at the checkpoint, against the schema as it stands before `20261012070050`.

**Contract**:
- One fixture user in `auth.users`, and a fixture post with its extraction (as `matching.sql:83-88` does).
- Deals covering the edge cases above, including `Poke\u0301mon Legends: Z-A` (NFD) and its NFC twin.
- Phrase entries for the fixture user: "Wiedźmin" then "wiedzmin" (`created_at` ordered), a phrase with `ł`, NFC "Pokémon" then NFD `Poke\u0301mon`, and a control phrase.
- Exported as the seed hook for the harness, checkpoint `20261012070050`.

#### 2. Detector tests

**File**: `tests/db/rule-change.test.ts` (new)

**Intent**: D1–D4.

**Contract**:
- D1's failure lists title, stored and fresh values.
- D2 enumerates `pg_index` joined to `pg_class` for btree indexes in `public` and runs as the superuser.
- D4 builds two extra databases, with the synthetic migration (dated after the last real one) without and with the recompute and reindex. The synthetic fold body is a fixture copy of the current one with `Ł`/`ł` removed from both translate strings.

### Success Criteria:

#### Automated Verification:

- `npm test` passes D1–D3 on the real migration chain
- `npm test` passes D4: without recompute and reindex both detectors fire, with them both are clean
- `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual Verification:

- Proof: with `update public.deals set title = title;` removed from `20261012130317_bound_game_match_key.sql` locally, D1 lists the Just Dance 2025, Shadow of the Colossus HD and 1001-character seeded deals and not the control; the line is then restored

---

## Phase 5: TS/SQL Fold Parity

### Overview

Compare `foldForMatching` with `public.fold_for_matching` over one shared corpus, so the add-phrase check never refuses a phrase the database treats as new.

### Test specification

- **Behaviour asserted**: for every probe in the corpus, the TS fold and the SQL fold return the same string. This is agreement only; correctness lives in Phases 1 and 3.
- **Regression caught**: a character added to or removed from one twin's table; a changed step order; a normalisation added to one twin only (Phase 6 must change both); regex differences between JS (`u` flag) and Postgres on any probed code point.
- **Research source**: Summary 1 and *Where each part of the rule runs* (parity protects the add-phrase flow, not `/my-deals`); *Historical Context* (1,238 comparisons, 2 mismatches when `ʼ` was dropped); review F5 (parity held over a shared defect).
- **Edge cases:**
  - every code point in U+0001–U+036F, U+1E00–U+1EFF, U+2000–U+206F, U+2100–U+214F and U+FF00–U+FF5E, each alone and between "a" and "b";
  - each ASCII letter followed by each combining mark U+0300–U+036F.
  - U+0000 is excluded, because Postgres text cannot hold NUL. Lone surrogates are outside these ranges.
- **Anti-pattern avoided**: treating parity as correctness. The test holds no expected values, and its name and failure message say it asserts agreement only.

### Changes Required:

#### 1. Corpus

**File**: `tests/db/fixtures/fold-corpus.ts` (new)

**Intent**: Curated inputs plus generated probes, built deterministically.

**Contract**:
- Curated inputs: `matching.sql`'s section 1 fold inputs (inputs only), the PRD and roadmap examples, the 20 catalogue names of `acceptance.md:37-58`, and the Polish pangram.
- Generated probes as listed under edge cases.
- Exports one `readonly string[]`.

#### 2. Parity test

**File**: `tests/db/fold-parity.test.ts` (new)

**Intent**: One query folds the whole corpus in SQL; compare row by row with TS.

**Contract**:
- `select … from unnest($1::text[]) with ordinality`, with the corpus as the parameter.
- On mismatch, list up to 20 probes as code points with both outputs.
- Assert the corpus size is above a floor, so an empty corpus cannot pass.

#### 3. Rules file

**File**: `CLAUDE.md`

**Intent**: Name the test that keeps the twins identical.

**Contract**: the *Deal matching* bullet on `foldForMatching` adds that `tests/db/fold-parity.test.ts` compares the two.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with the parity test comparing a corpus above its floor
- `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual Verification:

- Proof: with `ʼ` removed from `FOLD_FROM` in `rules.ts` locally, the parity test fails naming U+02BC; the change is then reverted

---

## Phase 6: Fix F5 — NFC First in Both Twins

### Overview

Write the failing tests first, then a migration that normalises to NFC before the translate table, settles, reindexes and recomputes, and the same step in `rules.ts`. Tomasz pushes the migration before the code.

### Test specification

- **Behaviour asserted:**
  - Unit: `Poke\u0301mon` ≡ "Pokémon" ≡ "pokemon", and `Wiedz\u0301min` ≡ "Wiedźmin" ("pokemon" finds "Pokémon", `roadmap.md:187`; review F5).
  - `isPhraseOnList`: NFD `Poke\u0301mon` is on a list holding "Pokémon".
  - `matching.sql`: a fold row turns NFD input into `pokemon`. A's game "Pokémon Legends: Z-A" (NFC, as the catalogue sends it) and B's phrase "pokemon" are both shown a deal titled in NFD.
  - D3: the seeded NFC "Pokémon" (older) stays active and the NFD one (newer) is removed.
  - D1, D2 and parity stay green.
- **Regression caught**: the defect itself; a fold change that forgets to settle, reindex or recompute; a change to one twin only.
- **Research source**: review F5 (`impl-review.md:145-158`, fix: NFC in both twins with settle and reindex); Open Question 1; CLAUDE.md *Deal matching*, the migration duties.
- **Edge cases:**
  - `ł` has no decomposition and must not change.
  - NFC also composes canonical singletons (U+212A KELVIN SIGN → "K", U+212B → "Å"), and the parity probes cover them.
  - A combining mark with no precomposed form ("q\u0303") still becomes a space. That is out of scope, and no test asserts otherwise.
- **Anti-pattern avoided**: fixing without a red test; parity as proof of the fix (the unit and view rows carry the expected values).

### Changes Required:

#### 1. Red tests

**File**: `tests/unit/watchlist/fold.test.ts`, `tests/unit/watchlist/phrase-on-list.test.ts`, `supabase/checks/matching.sql`, `tests/db/rule-change.test.ts`

**Intent**: The behaviour above, added before the fix and observed failing.

**Contract**:
- New unit rows and a D3 assertion for the seeded Pokémon pair.
- `matching.sql` gains the fold row, an NFD deal, A's game entry and B's phrase, and names the new migration in its header.
- Spell the NFD inputs with escapes (`\u0301` in TS, `E'…\u0301…'` in SQL), so an editor cannot normalise them away.

#### 2. Migration

**File**: `supabase/migrations/<timestamp>_fold_nfc_first.sql` (new, via `npm run db:new -- fold_nfc_first`)

**Intent**: The fold's first step becomes NFC normalisation, with the migration duties CLAUDE.md lists for a fold change.

**Contract**:
- **Header lines:**
  - `-- Revert:` create or replace `public.fold_for_matching` and its comment as `20261012070050` defines them, settle the phrases that fold alike again, reindex `public.watchlist_entries_active_phrase_folded`, then `update public.deals set title = title`.
  - Backward-compatible: yes. Name, signature, volatility and grants are unchanged, and the folded text changes only where NFC changes the input. Until the code deploy, the deployed `rules.ts` can disagree only on such phrases. When the database refuses, `addEntry` answers 23505 as `"duplicate"`.
- **Body, in order:**
  1. `create or replace function public.fold_for_matching(value text)`, with the same attributes (`immutable`, `parallel safe`, `set search_path = ''`). NFC normalisation wraps `value` before `translate`.
  2. The settle statement in the shape of `20261012070050:141-152`.
  3. `reindex index public.watchlist_entries_active_phrase_folded;`
  4. `update public.deals set title = title;`
  5. An updated `comment on function` that names the NFC step.
- `normalize(value, NFC)` is special syntax. With `search_path = ''`, check in PGlite whether `pg_catalog.normalize(value, NFC)` parses, or use `pg_catalog.normalize(value, 'NFC')`. It needs a UTF8 database, which both hosted and PGlite are.

#### 3. TS twin

**File**: `src/lib/watchlist/rules.ts`

**Intent**: The same first step.

**Contract**: `foldForMatching` normalises with `value.normalize("NFC")` before the table. The doc comment lists the steps with NFC first and names the new migration as the SQL twin. `phraseKey` stays as it is, because the `lower(phrase)` index it predicts does not normalise.

#### 4. Rules file

**File**: `CLAUDE.md`

**Intent**: Keep the pointer to the current function bodies true.

**Contract**: the *Deal matching* bullet names the new migration as holding `fold_for_matching`'s current body, next to `game_match_key`'s.

#### 5. Pre-push query

**File**: none committed; the text goes into `change.md` with its result

**Intent**: Predict, on production, what the migration will change, and answer F5's open question of whether any source sends NFD at all.

**Contract**: one read-only `select` returning two counts. Dry-run it first in PGlite, on the chain without the new migration and with the Phase 4 seed: it must count the seeded NFD deals and the Pokémon phrase pair. Before the migration, `fold_for_matching` is still the old one, so normalising its input first gives the new fold:

```sql
select
  (select count(*) from public.deals d
   where d.title is distinct from normalize(d.title, NFC)
      or d.english_title is distinct from normalize(d.english_title, NFC)
      or exists (select 1 from unnest(d.alternative_titles) a(t) where a.t is distinct from normalize(a.t, NFC)))
    as deals_not_nfc,
  (select count(*) from (
     select 1 from public.watchlist_entries
     where kind = 'phrase' and removed_at is null
       and public.fold_for_matching(normalize(phrase, NFC)) <> ''
     group by user_id, public.fold_for_matching(normalize(phrase, NFC)), platform
     having count(*) > 1) g)
    as phrase_groups_to_settle;
```

### Success Criteria:

#### Automated Verification:

- Before the fix, the new NFD rows fail (unit, matching.sql and D3) while every other test passes
- After the fix, `npm test` passes, parity included
- `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual Verification:

- Proof: the migration written first without the settle, reindex and recompute makes D1, D2 and D3 fail, and the completed migration makes them pass
- Before the push, Tomasz runs one read-only query in the SQL editor — the number of deals with a title, english_title or alternative title not in NFC, and the active phrase groups that would newly fold alike under NFC — and the counts are recorded in change.md
- Tomasz runs `npm run db:push -- --dry-run` (listing only the new migration), `npm run db:push`, `npm run db:check` and `npm run db:status`, all clean
- Tomasz runs matching.sql in the hosted SQL editor and gets "All checks passed."
- The code push follows the migration push, and both the "Database tests" and "CI" runs are green with the deploy done

---

## Phase 7: Cookbook

### Overview

Fill §6.1 and §6.2 of `context/foundation/test-plan.md` with the patterns this phase shipped, and add the §6.6 note.

### Changes Required:

#### 1. Test plan cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Make §6 the answer to "how do I add a test for X". Leave §1–§5 untouched.

**Contract**:
- **§6.1, "Adding a unit test for a pure rule":**
  - Location `tests/unit/<area>/<rule>.test.ts`; reference `tests/unit/watchlist/fold.test.ts`; run `npm test` or `npx vitest run --project unit`.
  - Rules:
    - expected values come from the PRD, roadmap or a review, never from running the code;
    - an equivalence class needs a near miss;
    - fixtures carry the non-ASCII inputs real posts carry;
    - import from `@/…`;
    - test files are type-checked by `next build` and linted with `--max-warnings 0`.
  - Keep the existing pointer that rollout Phases 2 and 4 extend this section.
- **§6.2, "Adding a database test against the migrations", two patterns:**
  - **(a) A matching case** (entry × deal → shown or hidden) is a row in `supabase/checks/matching.sql`:
    - the fixture deal, the entry and the case;
    - the expected arrays updated;
    - one entry of A's per deal;
    - `npm test`, then the hosted SQL-editor run after the push.
  - **(b) A property of the migration chain** is a Vitest test in `tests/db/` using the harness:
    - the seed checkpoint;
    - synthetic migrations to prove a detector;
    - `amcheck` as superuser;
    - references `tests/db/rule-change.test.ts` and `tests/db/fold-parity.test.ts`.
  - **Stub rules:** a non-superuser owner, default privileges by migration date, PGlite pinned at 0.5.9.
  - **Known gaps:**
    - PG 18.6 against hosted 17.6;
    - collation C, under which `lower()` lowers ASCII only;
    - no PostgREST.
  - **The local loop:** `npm test` before `db:push`.
  - Keep the pointer to rollout Phase 4 (isolation through `runCheckFile`).
- **§6.6:** a 2–3 line dated note on what this phase taught. For example: the detector only sees rows seeded before the first matching migration, and the F5 fix was the first real rule change it checked.

### Success Criteria:

#### Automated Verification:

- Every path cited in §6.1 and §6.2 exists in the repository

#### Manual Verification:

- Tomasz reads §6.1 and §6.2 and confirms that a new matching case and a new rule unit test could be added from them alone

---

## Testing Strategy

### Unit Tests:

- **Fold:** which spellings fold alike, each class paired with a near miss: case, Polish letters with `ł`, other Latin diacritics, apostrophes, "&", punctuation, NFD (Phase 6).
- **`isPhraseOnList`:** the two unique indexes, the platform as part of identity, and the kind.

### Integration Tests:

- **`matching.sql` (80 checks plus V1–V9 and the F5 rows):** fold and key, stored keys, views as A and B, anon, the EXECUTE matrix, phrase duplicates.
- **Detectors D1–D4:** stored = fresh, index = heap, settle, and a synthetic proof.
- **Fold parity** over the curated corpus and the generated probes.
- **Harness self-tests:** a non-superuser owner, and default privileges by migration date.

### Manual Testing Steps:

1. Each phase's proof by breaking, done locally and reverted.
2. The hosted `matching.sql` run after Phases 3 and 6.
3. The `pg_default_acl` query (Phase 2) and the pre-push NFC query (Phase 6).
4. The Actions history: "Database tests" alone on a `supabase/`-only push; `verify` blocking `deploy` on a failing test.

## Performance Considerations

- **Per database:** about 1–2 s to build and about 400 MB RSS. The `db` project builds about five databases (matching, harness self-tests, the real chain and the two synthetic ones, parity), so the suite should stay around 10–15 s locally.
- **CI:** forks run files in parallel, well within an `ubuntu-latest` runner's memory.
- **Cost of the F5 migration:** it rewrites every deal row once (`update … set title = title`) and reindexes a small index. That is the same cost `20261012130317` paid.

## Migration Notes

- The F5 migration is the only schema change. It keeps every grant (`create or replace`), and its settle marks phrases removed rather than deleting them (FR-004).
- The pre-push query predicts its effect on production. On 2026-10-12 the earlier settle removed no rows (`impl-review.md` F4).
- Production order: local `npm test` → `db:push --dry-run` → `db:push` → `db:check` → hosted `matching.sql` → code push.

## References

- Research: `context/changes/testing-matching-rule-protection/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risk #1, §3 Phase 1, §5, §6)
- Rule: `supabase/migrations/20261012070050_match_deals_to_watchlist.sql`, `supabase/migrations/20261012130317_bound_game_match_key.sql`
- Truth table: `supabase/checks/matching.sql`
- TS twin: `src/lib/watchlist/rules.ts:83-214`
- Review findings: `context/changes/deals-matched-to-watchlist/reviews/impl-review.md` (F2 `:87-109`, F5 `:145-158`)
- Acceptance: `context/changes/deals-matched-to-watchlist/acceptance.md:30-82`
- CI: `.github/workflows/ci.yml`, `.github/workflows/collect.yml:52-57`
- Next 16 Vitest guide: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- Lessons: `context/foundation/lessons.md` (logic apart from I/O; a gate proven by breaking it; departures recorded in change.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner and Unit Tests for the Fold

#### Automated

- [x] 1.1 `node --version` prints v24.x before any install — 61710d9
- [x] 1.2 `npm ci` completes without ERESOLVE after the dependency changes — 61710d9
- [x] 1.3 `npm test` passes and collects only `tests/unit/**` files — 61710d9
- [x] 1.4 `npm run lint` passes — 61710d9
- [x] 1.5 `npm run format:check` passes — 61710d9
- [x] 1.6 `npm run build` passes, type-checking `tests/` and `vitest.config.mts` — 61710d9

#### Manual

- [x] 1.7 Gate proof: a throwaway pull request carrying one deliberately failing unit test shows `verify` failing and `deploy` never starting; the pull request is then closed and its branch deleted

### Phase 2: Disposable Postgres and matching.sql as a Test

#### Automated

- [x] 2.1 `npm test` passes, with `tests/db/matching.test.ts` reporting matching.sql's "All checks passed." — 2b4c55e
- [x] 2.2 The harness self-tests pass: the owner is not a superuser, and the default privileges follow the migration date — 2b4c55e
- [x] 2.3 `npm run lint`, `npm run format:check` and `npm run build` pass — 2b4c55e

#### Manual

- [x] 2.4 Proof by breaking, locally and reverted: a migration edit that stops folding `ł` and a removed `authenticated` EXECUTE grant each make `npm test` fail with FAIL lines naming the affected checks — 2b4c55e
- [x] 2.5 Tomasz runs the read-only `pg_default_acl` query in the SQL editor, and the stub's default privileges match the hosted `postgres` rows, with any difference recorded in change.md — 2b4c55e

### Phase 3: View-Level Cases in matching.sql

#### Automated

- [x] 3.1 `npm test` passes with every new case reported `ok`

#### Manual

- [x] 3.2 Proof: with `20261012130317_bound_game_match_key.sql` moved out of `supabase/migrations/` locally, `npm test` names V3 and V4 as FAIL; the file is then restored
- [x] 3.3 Tomasz runs the extended matching.sql in the hosted SQL editor and gets "All checks passed."
- [ ] 3.4 The push of this phase (only `supabase/` and `context/` files) shows a "Database tests" run and no "CI" run in GitHub Actions

### Phase 4: Rule-Change Detectors

#### Automated

- [ ] 4.1 `npm test` passes D1–D3 on the real migration chain
- [ ] 4.2 `npm test` passes D4: without recompute and reindex both detectors fire, with them both are clean
- [ ] 4.3 `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual

- [ ] 4.4 Proof: with `update public.deals set title = title;` removed from `20261012130317_bound_game_match_key.sql` locally, D1 lists the Just Dance 2025, Shadow of the Colossus HD and 1001-character seeded deals and not the control; the line is then restored

### Phase 5: TS/SQL Fold Parity

#### Automated

- [ ] 5.1 `npm test` passes with the parity test comparing a corpus above its floor
- [ ] 5.2 `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual

- [ ] 5.3 Proof: with `ʼ` removed from `FOLD_FROM` in `rules.ts` locally, the parity test fails naming U+02BC; the change is then reverted

### Phase 6: Fix F5 — NFC First in Both Twins

#### Automated

- [ ] 6.1 Before the fix, the new NFD rows fail (unit, matching.sql and D3) while every other test passes
- [ ] 6.2 After the fix, `npm test` passes, parity included
- [ ] 6.3 `npm run lint`, `npm run format:check` and `npm run build` pass

#### Manual

- [ ] 6.4 Proof: the migration written first without the settle, reindex and recompute makes D1, D2 and D3 fail, and the completed migration makes them pass
- [ ] 6.5 Before the push, Tomasz runs one read-only query in the SQL editor — the number of deals with a title, english_title or alternative title not in NFC, and the active phrase groups that would newly fold alike under NFC — and the counts are recorded in change.md
- [ ] 6.6 Tomasz runs `npm run db:push -- --dry-run` (listing only the new migration), `npm run db:push`, `npm run db:check` and `npm run db:status`, all clean
- [ ] 6.7 Tomasz runs matching.sql in the hosted SQL editor and gets "All checks passed."
- [ ] 6.8 The code push follows the migration push, and both the "Database tests" and "CI" runs are green with the deploy done

### Phase 7: Cookbook

#### Automated

- [ ] 7.1 Every path cited in §6.1 and §6.2 exists in the repository

#### Manual

- [ ] 7.2 Tomasz reads §6.1 and §6.2 and confirms that a new matching case and a new rule unit test could be added from them alone
