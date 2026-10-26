# Test Plan Refresh 2026-10-15 — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-10-15/plan.md`
> Direction and discovery: `context/changes/test-plan-refresh-2026-10-15/change.md`

## What & Why

`context/foundation/test-plan.md` still describes the repository of 2026-10-12. Since then rollout Phases 1, 2 and 5 shipped, the local Supabase stack landed, and CI gained an `e2e` job. Every later phase's research reads this guide first. This refresh brings it back in line, following Tomasz's direction from the `--refresh` brief.

## Starting Point

§4 still says "Test base: none" and lists PGlite, the hooks and e2e as "none yet". §5 places typecheck in `deploy` only. §2 says the database carries no expiry condition and the eval finishes clean on leaks. §7 holds only the exclusions of 2026-10-12. §3 statuses and §6 are already current.

## Desired End State

The guide matches the repository as of 2026-10-15:
- §1 records the 2026-10-15 interview and hot-spots beside the 2026-10-12 ones.
- §2 keeps every rating and gains dated evidence and current guidance for #2–#7.
- §3 narrows Phases 3 and 4 to what e2e does not already prove.
- §4 and §5 list what is installed and wired, and where.
- §7 carries the exclusions decided since 2026-10-12.
- §8 is dated 2026-10-15.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Impact and Likelihood | Unchanged for all seven risks | The rubric still gives the same values. | Direction (change.md) |
| §2 cells the direction names | Source and Risk Response Guidance for #2–#7, as directed | Only those cells went stale. | Direction |
| Hot-spot counts and Q3 in §2 Source | Add the 2026-10-15 state beside the old, dated, #1 included | §2 must not contradict §1, and the 2026-10-12 evidence behind the ratings stays visible. | Plan |
| §7 layout | Three new bullets grouped by rollout phase (7 in total) | The schema recommends 5–6. Grouping keeps each source and date once. | Plan |
| §7 re-evaluate conditions | Derived from each exclusion's stated reason | No source states one, and the existing entries all carry one. | Plan |
| No E2E against hosted | Kept. The trigger names a read-only guest smoke check after deploy as the next step | The hosted project is production, and the test creates accounts with a key that bypasses RLS. | Plan, from the Phase 5 plan |
| Brief facts the repository contradicts | Nine corrected, decisions untouched | The guide is the ground truth other skills quote. | Plan research |
| Phases | One | One file, one review. | Plan |

The nine corrections:
1. Unit test files: 14, not 15.
2. The "10 commits" window is 2026-10-14–15.
3. The end-of-turn hook does see Bash and hand edits; it misses commits made during the turn.
4. A labels-only change does not stop the extractor, and a refused extract turns the scheduled run red.
5. 2026-10-26 is the Monday after the DST Sunday, and nothing links the misread to DST.
6. The collected aggregators are rejected as shops; lookalikes stay.
7. e2e does not assert the catalogue message.
8. Only the grants on `collected_posts` are proven.
9. The synthetic posts do carry expiry, set and link labels; the real posts do not.

## Scope

**In scope:** `context/foundation/test-plan.md` §1, §2, §3 (Goal cells of Phases 3 and 4, plus a scope note), §4, §5, §7, §8.

**Out of scope:**
- Tests, code, configuration and workflows.
- §6 and §3 Status cells.
- Any rating or risk number.
- `infrastructure.md` and the `ci.yml` comment, which are both stale.
- The "do niedzieli" prompt fix, which needs its own eval.
- The challenger findings.

## Architecture / Approach

One pass through the guide in document order. Dated additions sit beside the 2026-10-12 record, and a current fact replaces only a statement that is now false. Mechanical checks against `c4ef68b` prove that ratings, §3 statuses, the "no anchors in §2" rule and §7's size held, and that every known-stale phrase is gone.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Refresh the guide | §1–§5, §7, §8 rewritten per direction and corrections, with mechanical checks | A broken Markdown table row: nothing formats or lints `context/` |

**Prerequisites:** none. Commit with `git commit -- <paths>`, because another session may share the index.
**Estimated effort:** one session.

## Open Risks & Assumptions

- That the hosted project grants defaults by creation time is Tomasz's direction, consistent with Supabase's changelog. The repository does not document it.
- The §7 re-evaluate conditions are written at refresh time, not taken from the phase plans. Tomasz reviews them.
- §7 has 7 top-level bullets, one above the schema's 5–6.

## Success Criteria (Summary)

- A reader of the guide learns what is tested, wired and excluded today, without consulting the change folders.
- The next `/10x-test-plan` run picks Phase 3 and hands its research guidance that matches the repository.
- No rating, status or risk number moved.
