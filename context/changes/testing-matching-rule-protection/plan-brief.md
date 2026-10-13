# Matching Rule Protection — Plan Brief

> Full plan: `context/changes/testing-matching-rule-protection/plan.md`
> Research: `context/changes/testing-matching-rule-protection/research.md`

## What & Why

This change is rollout Phase 1 of the test plan, covering Risk #1: a change to the matching rule silently drops a watched game's deals from `/my-deals`, admits a sibling game, or makes the add-phrase check refuse a new phrase. The rule was corrected on the day it shipped (review F2), and the team changes it "without confidence, every time". Yet nothing runs automatically: the 80-check truth table is run by hand in the SQL editor.

## Starting Point

- **No tests yet:** there is no test runner and no test. CI ignores `supabase/**`.
- **Where the rule runs:** entirely in Postgres. Deals carry stored keys, entries are keyed on every read, and a folded unique index judges phrase duplicates. The TypeScript fold only predicts those duplicates for the "Obserwuj frazę" button.
- **What research proved:** `supabase/checks/matching.sql` passes 80/80 in PGlite against all 11 migrations. Stale keys and a stale index are detectable.
- **F5:** an accent typed as a separate character splits a word in both fold twins. It is still live.

## Desired End State

- **`npm test`** runs Vitest: unit tests for the fold and the phrase pre-check, plus database tests on PGlite built from the repository's migrations. It gates CI `verify`, and a push of `supabase/**` alone runs it without a deploy. The local migration loop runs it before `db:push`.
- **The truth table** covers every view-level example the PRD, roadmap and reviews give, both shown and hidden. It still runs unchanged on production.
- **A rule-change migration** that forgets to recompute, reindex or settle fails the suite.
- **F5 is fixed** on production.
- **The cookbook,** §6.1 and §6.2 of the test plan, says how to add the next test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| F5 (NFD accent) | Fix now: NFC first in both twins, with settle, reindex and recompute | The detectors built just before it verify a real rule change, and the defect closes | Plan (user) |
| Acceptance misses (Dark Arisen ×3, Fortnite bundle) | Accepted cost, no tests | PRD Non-Goal: no promise of completeness; 39/43 met the threshold | Plan (user) |
| Where new matching cases live | Extend `matching.sql`, run it through one Vitest wrapper | One truth table; the production SQL-editor run gains every case; Phase 4 reuses the wrapper | Plan (user) |
| CI for migration-only pushes | `npm test` in `verify` + a separate `supabase/**` workflow without a deploy | Follows `ci.yml`'s rule that a change which cannot alter the artifact needs no build | Plan (user) |
| Runner | Vitest `^5.0.4` with `@types/node ^24` | Clean install, `tsc` and lint in a probe; matches `engines` 24.x | Plan (probe) |
| Disposable Postgres | PGlite `0.5.9` exact, with a non-superuser owner and default privileges by migration date | No Docker, ~1–2 s per database; a superuser stub hides grant gaps | Research |
| PG 18.6 vs hosted 17.6 | Accepted | The rule is locale-independent by construction; the production run stays the PG 17 authority | Plan |
| Expected values | From the PRD, roadmap S-04, review findings and the acceptance labels; new cases assert shown or hidden | Running today's functions to get expectations would test nothing | Research |
| Stub default privileges | Mirror Tomasz's read-only `pg_default_acl` query | One query; the stub is shared with rollout Phase 4 | Plan |

## Scope

**In scope:**
- Vitest, PGlite, the Supabase stub and harness, and the check-file runner.
- Unit tests for the fold and `isPhraseOnList`.
- `matching.sql` extended with view-level cases V1–V9.
- Detectors for stale keys, a stale index and unsettled phrases, proven by a synthetic migration.
- TS/SQL fold parity.
- The F5 migration and the matching `rules.ts` change.
- CI `verify` and the new `database-tests.yml`.
- CLAUDE.md facts: the test runner, the migration loop, and where the current function bodies live.
- Test plan §6.1, §6.2 and §6.6.

**Out of scope:**
- Expiry (Risk #2), cross-user isolation (Risk #4) and e2e (rollout Phase 5).
- NFKC.
- A database comparison for the `lower(phrase)` half of the pre-check.
- Test plan §1–§5.
- Docker and pgTAP.
- Caching databases across files.
- A required status check for the new workflow.

## Architecture / Approach

`tests/unit/` holds pure-rule tests. `tests/db/` holds tests that build an in-memory PGlite:

1. A prelude stubs Supabase's roles and `auth`.
2. A non-superuser owner applies `supabase/migrations/*.sql` in order, with default privileges by migration date.
3. Hooks seed rows before a named migration or append synthetic future migrations.

A generic runner executes `supabase/checks/*.sql` files and parses their deliberate-exception report.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runner and unit tests | Vitest, `npm test` in `verify`, and fold and pre-check unit tests | Test files breaking `next build` or lint |
| 2. Disposable Postgres | Stub, harness, `matching.sql` 80/80 in `npm test`, the `supabase/**` workflow, and the migration loop | A stub that is quietly more permissive than production |
| 3. View-level cases | V1–V9 (Switch 2, years, Remastered/HD, `ł`/`&`, pinned phrase, siblings) in `matching.sql` | Fixture interplay, since each deal is matched by at most one of A's entries |
| 4. Rule-change detectors | Stale key, index and settle checks, with a synthetic proof | A seed that stops exercising the rule |
| 5. Fold parity | TS = SQL over curated inputs and about 9,000 generated probes | Being read as correctness, which it is not |
| 6. F5 fix | NFC migration + `rules.ts`, test-first, pushed by Tomasz | Push order between migration and code |
| 7. Cookbook | §6.1, §6.2 and §6.6 of the test plan | — |

**Prerequisites:**
- Node 24 active.
- Tomasz available for:
  - the `pg_default_acl` query;
  - two hosted `matching.sql` runs;
  - the pre-push NFC query;
  - `db:push`;
  - one throwaway pull request.

**Estimated effort:** about 4–6 sessions across 7 phases. Phases 2 and 3 are the largest.

## Open Risks & Assumptions

- **Unverified stub privileges:** the stub's `grant all` default privileges may be wider than production's until the `pg_default_acl` query runs.
- **`normalize` syntax:** `normalize(…, NFC)` must parse with `search_path = ''`. The plan names the fallback, `'NFC'` as a string.
- **The window between the two pushes:** between `db:push` and the code deploy, the old pre-check can disagree with the database on phrases holding combining marks. The window is minutes, and the phrases are rare.
- **Test pace:** about five PGlite databases per run, at roughly 400 MB each. Fine on CI runners; watch the pace if the suite grows.

## Success Criteria (Summary)

- **CI gate:** a failing test blocks the deploy, and a migration-only push runs the suite.
- **Detectors:** a rule-change migration that skips recompute, reindex or settle cannot pass `npm test`.
- **Coverage:** every PRD, roadmap and review matching example has a shown case and a hidden case, both green locally and on production. NFD titles and phrases now match.
