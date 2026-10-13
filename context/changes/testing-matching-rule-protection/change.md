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
