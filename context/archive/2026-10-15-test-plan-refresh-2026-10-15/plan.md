# Test Plan Refresh 2026-10-15 Implementation Plan

## Overview

Bring `context/foundation/test-plan.md` back in line with the repository. §1–§5, §7 and §8 date from 2026-10-12/13. Since then rollout Phases 1, 2 and 5 shipped, the local Supabase stack landed (`local-supabase-stack`), and CI gained an `e2e` job. The content follows Tomasz's direction recorded in `change.md` (the `--refresh` brief of 2026-10-15). Nine facts in that brief disagree with the repository, and this plan corrects them without changing any decision (see Current State Analysis). One file changes. There are no tests and no code.

## Current State Analysis

The guide's strategy sections still describe the repository as of 2026-10-12:
- §4 says "Test base at writing: none" and lists PGlite as undecided, the post-edit hook and e2e as "none yet".
- §5 places typecheck in `deploy` only, lists the eval as "after §3 Phase 2" and e2e in an "environment chosen in §3 Phase 5".
- §2's guidance for #2 says the database carries no expiry condition and the eval finishes clean on leaks.
- §7 holds only the exclusions of 2026-10-12.
- §8 dates are 2026-10-12.

§3 statuses and §6 are current: `c4ef68b` marked Phase 5 complete, and each phase wrote its own cookbook section.

**Verified against the repository on 2026-10-15 (three research tasks, plus local checks):**
- Test base: 25 test files. That is unit 14, db 7, hooks 1 and e2e 3 (`tests/e2e/auth.setup.ts`, `seed.spec.ts`, `main-flow.spec.ts`). No unit test covers `src/lib/auth/`, `scripts/collector/` or `src/lib/catalog/`.
- Versions, from installed packages:
  - Vitest 5.0.4 (`^5.0.4`)
  - `@electric-sql/pglite` 0.5.9 (exact pin)
  - `@playwright/test` 1.64.1
  - Supabase CLI 2.117.0
  - Node `24.x`
- Hot-spots, same scope as §1:
  - 59 commits in 30 days: `.github/workflows` 16, `supabase/migrations` 12, `scripts/extract` 11, `src/lib/deals` 6, `src/lib/auth` 5, `src/lib/watchlist` 5, `supabase/checks` 5, `scripts/collector` 5, `src/utils/supabase` 4.
  - 31 commits in 14 days: `scripts/extract` 10, `supabase/migrations` 9, `.github/workflows` 8, `src/lib/watchlist` 5, `src/lib/deals` 5, `supabase/checks` 5, `src/lib/auth` 3.
  - 10 commits on 2026-10-14 and 2026-10-15.
  - One of the 10 `scripts/extract` commits touched the link rule (`88d721c`, 2026-10-13).

**Corrections to the brief, applied in this plan:**
1. Unit test files are 14, not 15. The total of 25 holds.
2. The window "since 2026-10-13: 10 commits" holds only if 2026-10-13 itself is left out. Counted from 2026-10-13 00:00, it is 16. The guide says "on 2026-10-14 and 2026-10-15: 10".
3. Hooks: the per-edit hooks match `Edit|Write` only. `end-of-turn.mjs` checks whatever is uncommitted in the checkout when the agent stops, Bash and hand edits included. It does not see changes committed during the turn, and no hook runs outside an agent session (`.claude/settings.json:34`, `.claude/hooks/end-of-turn.mjs:15-16`, `:144-157`).
4. #3: the extractor checks the prompt fingerprint only (`scripts/extract/extract.mts:209-217`). A prompt, schema, `MODELS`, temperature or max-tokens change without a new record stops it. A labels-only change fails `npm test` but does not stop the cron. The refused step exits 1, so the scheduled Actions run turns red. In the app, only the freshness line shows it.
5. #2: 2026-10-26 is the Monday after the change-over Sunday (2026-10-25), not part of a "DST weekend". The record (`testing-extraction-and-listing-guard/change.md:41`) treats it as a wrong weekday and does not link it to DST. The guide states the dates without claiming DST as the cause.
6. #5: links to the collected aggregators' sites (`pepper.pl`, `lowcygier.pl`, `cenograj.pl`) are rejected as shops. Lookalikes and uncollected aggregators are kept (`testing-extraction-and-listing-guard/plan.md:121`, `:160`).
7. #7 / Phase 3: the e2e server's blank RAWG key sends the browser through the catalogue-unavailable path, but no spec asserts the message. The test proves only that the phrase path works.
8. Phase 3: the db harness proves the pipeline's grants on `collected_posts` only (`tests/db/collected-posts-grants.test.ts`). `post_extractions`, `deals` and `pipeline_runs` carry grants in their migrations, but no test checks them.
9. #2: "the labels … carry no expiry, no physical set and no link" is stale. The 8 synthetic posts carry 3 expiries, 4 set items and 8 shop links. The 55 real posts still carry none.

## Desired End State

`context/foundation/test-plan.md` describes the repository as of 2026-10-15:
- §1 keeps the 2026-10-12 record and adds the 2026-10-15 interview and hot-spot scan.
- §2 keeps every Impact and Likelihood rating. Its Source cells carry the 2026-10-15 evidence beside the old. Its Risk Response Guidance for #2–#7 states what is wired and decided today, with no file:line anchor added.
- §3 keeps every Status and Change folder cell. It narrows the goals of Phases 3 and 4 to what Phase 5 does not already prove.
- §4 rewrites the stale rows, adds "Test base at refresh: meaningful", and updates the grounding note and constraints.
- §5 lists each gate where it actually runs.
- §7 has seven bullets, three of them new and grouped by rollout phase.
- §8 is dated 2026-10-15 and names the two dated events before the deadline.

Verify with the mechanical checks in Success Criteria, then Tomasz's read of the diff.

### Key Discoveries:

- The skill allows this edit only through a refresh change, and §1/§2 only on explicit user direction (`.claude/skills/10x-test-plan/SKILL.md:575-580`; `references/test-plan-schema.md:5`, `:357`). The direction is in `change.md`.
- The schema rules this plan must respect:
  - Risk numbers stay stable and the Source column carries evidence, not file anchors (`test-plan-schema.md:106-127`).
  - §3 Status values and column order are parsed (`:8`, `:168-177`).
  - §7 should stay at 5–6 bullets (`:314`); the grouping brings it to 7.
  - §8 dates bump when tools are re-verified (`:354-356`).
- §7 sources, with their decisions:
  - `testing-matching-rule-protection/plan.md:71-72` (2026-10-13)
  - `testing-extraction-and-listing-guard/plan.md:118`, `:121`, `:125` (2026-10-13)
  - `testing-main-flow-end-to-end/plan.md:75-76`, `:83` (2026-10-15)
  - None states a re-evaluate condition.
- The listing predicate holds the expiry term in the policy and the view (`supabase/migrations/20261013145356_hide_expired_deals.sql:14-16`, `:25-37`). It is checked by `supabase/checks/listed-expiry.sql` through `tests/db/listed-expiry.test.ts`.
- Unreadable dates other than `H:MM` stay undated, by decision 2026-10-13 (`testing-extraction-and-listing-guard/plan.md:126`, `:159`).
- The PGlite harness grants default privileges by migration version, before `20261030000000` (`tests/db/harness/database.ts:8-12`, `:200`). The repository nowhere says that the hosted project grants by creation time. That point is Tomasz's direction, consistent with the changelog note "new `public` tables on existing projects get no automatic grants" (`physical-deals-from-real-posts/plan.md:85`).
- The local stack is no grants oracle under CLI 2.117.0, and sequences carry no explicit grants (`local-supabase-stack/research.md:46`, `:135`, `:159`).
- `typecheck` runs in the `e2e` job's `next build`: `next.config.ts` sets no `typescript.ignoreBuildErrors`. It also runs in `deploy`'s `vercel build` (`ci.yml:201-202`) and in the end-of-turn hook (`end-of-turn.mjs:105-108`). No step runs `tsc` on its own.
- `collect.yml` triggers on `schedule` and `workflow_dispatch` only, with no dependency on CI (`collect.yml:10-16`, `:42`).
- The deadline is `hard_deadline: 2026-11-04` (`context/foundation/prd.md:14`). EU summer time ends on 2026-10-25.
- `context/` is Prettier-ignored (`.prettierignore:25`), and the end-of-turn hook skips a checkout whose changes are all `.md` (`end-of-turn.mjs:62`). No formatter or gate checks this file.

## What We're NOT Doing

- No tests, code, configuration or workflow changes.
- No edits outside `context/foundation/test-plan.md` and this change folder.
- No change to any Impact or Likelihood rating, risk number or §2 Risk (failure scenario) cell.
- No change to §3 Status or Change folder cells, and no new rollout phase.
- No change to §6. It was written phase by phase and is current. This refresh ships no new pattern, and §6.6 is for rollout phases.
- No re-query of Context7 or web search. The 2026-10-12 doc checks are three days old, and versions were read from installed packages.
- Stale text found outside the guide, noted and not fixed:
  - `context/foundation/infrastructure.md:109`, `:115`, `:149` leave `npm test` and `e2e` out of the gate.
  - The `ci.yml:199-200` comment says type errors fail at `deploy`, but `e2e` builds too.
  - `watchlist-from-catalog` F8, which called previews writing to production "harmless", was skipped.
- No prompt fix for the "do niedzieli" misread. It is a prompt change and needs its own eval run and record.
- The two challenger findings stay out of §2, as the brief decided:
  - "local work reaches production"
  - "a local extract re-bills posts"

## Implementation Approach

Edit the guide section by section, in document order, in one pass. Each change below names the cell or paragraph and the facts it must carry. The implementer writes the prose in the guide's existing voice: short sentences, risks as scenarios, sources as evidence. Dated additions sit beside the 2026-10-12 record instead of replacing it, except where a statement is now false. There the current fact replaces it.

## Critical Implementation Details

**Markdown tables.** §2, §3, §4 and §5 are tables whose rows sit on one line each. A cell must not contain a literal `|` or a line break, or the row breaks silently. Nothing formats or lints this file. `/10x-test-plan` parses §3, so keep its column order and the Status vocabulary exactly.

**Committing.** Another session may stage files in this checkout. Commit with `git commit -- <paths>`, naming the guide and this change folder only.

## Phase 1: Refresh the guide

### Overview

Rewrite the stale parts of §1–§5, §7 and §8 per the direction and the corrections above, then prove mechanically that ratings, statuses and anchors held.

### Changes Required:

#### 1. §1 Strategy

**File**: `context/foundation/test-plan.md`

**Intent**: Record the 2026-10-15 refresh inputs beside the 2026-10-12 ones, so §2's dated evidence has its source in §1.

**Contract**:
- **The hot-spot paragraph** keeps its 2026-10-12 sentence. It adds the 2026-10-15 scan of the same scope, with the figures in Current State Analysis:
  - 59 commits in 30 days, and the directories with 5 or more;
  - 31 in 14 days, with `scripts/extract` 10, `supabase/migrations` 9, `.github/workflows` 8;
  - 10 commits on 2026-10-14 and 2026-10-15.
- **A new block "Interview, 2026-10-15 (refresh; test base meaningful, so Q4 was asked):"** goes after the 2026-10-12 block.
  - Q1 unchanged.
  - Q2 unchanged, with no incident.
  - Q3 changed: the new tests calmed him, so the SQL matching rule and the extraction prompt are no longer changed without confidence.
  - Q4, asked for the first time: nothing in particular.
  - Q5 unchanged (§7).
- The three principles and the 2026-10-12 block stay verbatim.

#### 2. §2 Risk Map — Source cells

**File**: `context/foundation/test-plan.md`

**Intent**: Add the evidence gathered since 2026-10-12 to each risk's Source cell, dated, beside the old evidence. The old hot-spot counts become "(2026-10-12)". Ratings do not move, because the rubric still gives the same values.

**Contract**: Append only. No file names or line anchors: slice names, CLAUDE.md, `infrastructure.md` and directory hot-spots, as the column already uses.

- **#1**
  - Mark the existing hot-spot counts as 2026-10-12. Add "on 2026-10-15: `supabase/migrations/` 9 commits/14d, `src/lib/watchlist/` 5".
  - Qualify "interview … Q3" with "eased on 2026-10-15".
- **#2**
  - Annotate the research note "the eval finishes clean on leaks" as fixed in the same change.
  - Add the `testing-extraction-and-listing-guard` change log. The first passing eval record accepted a known model error: Mistral reads "do niedzieli" in a post of Wednesday 2026-10-21 as Monday 2026-10-26 instead of Sunday 2026-10-25, the day the clocks change. Such a deal stays listed 24 hours too long.
  - Add "Q3 eased on 2026-10-15".
  - Add hot-spots on 2026-10-15: `scripts/extract/` 10 commits/14d, `src/lib/deals/` 5.
- **#3**
  - Add `testing-extraction-and-listing-guard`: the extractor refuses a prompt, schema or model change that has no new passing eval record. This is a new stall path.
  - Add that `collect.yml` runs the default branch on a schedule without waiting for CI.
  - Add CLAUDE.md: from 2026-10-30 a new table without explicit grants fails at write time with `42501`.
  - Add hot-spots on 2026-10-15: `scripts/extract/` 10 commits/14d, `.github/workflows/` 16 commits/30d.
- **#4**
  - Add CLAUDE.md: functions stay executable by `PUBLIC` unless revoked.
  - Add the `local-supabase-stack` research: sequences carry no explicit grants, and the local CLI grants new objects automatically.
  - Add hot-spot on 2026-10-15: `supabase/migrations/` 12 commits/30d.
- **#5**
  - Add the `testing-extraction-and-listing-guard` plan: decision 2026-10-13, no shop allow-list and no lookalike detection.
  - The hot-spot clause "none of them to the link rule" is marked 2026-10-12. Add "on 2026-10-15: 10 commits/14d, one of them to the link rule (Phase 2's fix)". The clause's conclusion, that likelihood rests on untrusted input rather than churn, stays.
- **#6**
  - Add `testing-main-flow-end-to-end`: the browser round trip shipped, and the guest redirect and server-side sign-out revocation gate deploy.
  - Add that `infrastructure.md`'s session-check switch (`getClaims`) is still open on 2026-10-15.
  - Add hot-spots unchanged on 2026-10-15: `src/lib/auth/` 5 commits/30d, `src/utils/supabase/` 4.
- **#7**
  - Add `testing-main-flow-end-to-end`: the server under the e2e test runs with a blank RAWG key.

#### 3. §2 Risk Response Guidance — #2 to #7

**File**: `context/foundation/test-plan.md`

**Intent**: Make each guidance row state what is wired and decided today, so Phases 3 and 4 research starts from the current repository. Row #1 is unchanged. Keep each row's "Grounded on …" note.

**Contract**: Cells per column. Text not named here stays.

- **#2**
  - **What would prove protection:**
    - The database's listing predicate hides an expired deal on both deals pages, and an undated one stays.
    - A stated date the pipeline cannot read, other than `H:MM`, stays undated, by decision (2026-10-13). This replaces "a decided rule, not an accident".
  - **Must challenge:**
    - Keep "passed the eval once" (prompt v3) and "a recorded model reply is ground truth".
    - Replace "The labels still match the rules". It becomes: only the 8 synthetic posts carry an expiry, a physical set or a shop link. The 55 real posts carry none, so those rules are measured on tidy invented posts only.
    - Replace "The eval gates the change". It becomes: the eval exits 1 on a breach and judges the production model list. Its record binds a pass to the prompt and labels fingerprints. A mismatch fails `npm test`. A prompt mismatch also stops the extractor; a labels-only change does not.
    - Replace "Hiding expired deals is a listing rule a unit test covers" with "A green eval means expiry is right". The baseline accepts the failures it first recorded, the "do niedzieli" misread among them. Only recorded failures can shrink, and a newly labelled item enters with whatever it fails.
  - **Context /10x-research must ground:** the post texts are not committed, but they can be re-exported (replaces "not reproducible from the recorded export").
  - **Likely cheapest layer:**
    - The eval is the wired gate on prompt, schema or model changes (AI-native).
    - Hiding an expired deal is covered by database integration on the listing predicate. This replaces "has no cheap layer as written".
    - Unit and sample review stay.
- **#3**
  - **Must challenge:** add "A red `verify` stops a bad pipeline change". It stops the deploy only; the cron runs whatever is on `main`.
  - **Context:**
    - Add the refusal path: the extractor refuses before it reads a credential and writes no run record. The scheduled run turns red in Actions, and the app shows only the freshness line.
    - Add which pipeline writes depend on explicit grants once Supabase's default privileges end on 2026-10-30.
- **#4**
  - **Must challenge:** replace "A local stub reproduces Supabase's default privileges" with "The harness's cut-off is production's". The PGlite harness grants defaults by the migration's version, before 2026-10-30. The hosted project grants by when the table is created. So a migration dated before 2026-10-30 and pushed after it gets the default grants in the harness and none in production. Keep the other two challenges.
  - **Context:** add that functions stay executable by `PUBLIC` unless revoked and that sequences carry no explicit grants. Add that the local stack grants new objects automatically under CLI 2.117.0, so it is no grants oracle.
- **#5**
  - **What would prove protection:** replace "Whether another aggregator's or a lookalike site's link counts as a shop is a decided rule." with: a link to a collected aggregator's site is not a shop; a lookalike or an uncollected aggregator stays a kept off-site link, by decision (2026-10-13). There is no shop allow-list and no lookalike detection.
- **#6**
  - **Likely cheapest layer:** replace "the browser round trip belongs to §3 Phase 5" with: the browser round trip shipped with §3 Phase 5, and the guest redirect and server-side sign-out revocation gate deploy.
  - **Context:** the planned session-check switch is still pending on 2026-10-15, and it would touch the session path.
- **#7**
  - **Likely cheapest layer:**
    - The build-output scan runs on the deploy build.
    - The e2e server runs with a blank key: the browser passes through the catalogue-unavailable path, but no test asserts the message.
    - The unit layer is still Phase 3's job.

#### 4. §3 Phased Rollout

**File**: `context/foundation/test-plan.md`

**Intent**: Narrow Phases 3 and 4 to what Phase 5 does not already prove, without touching anything the orchestrator parses.

**Contract**:
- **Table rows 3 and 4.** Only the Goal cell changes, one line each. Status (`not started`), Change folder (`—`), Risks covered and Test types stay.
  - Phase 3's goal adds that the key must not reach "the deploy build".
  - Phase 4's goal becomes per-role isolation through the Data API and Server Actions, plus the access decision, session refresh and private-page caching below the browser. Sign-in and sign-out leave it.
- **A short block after the existing "Status vocabulary" paragraph, "Scope after Phase 5 (2026-10-15):"**
  - **Phase 3:**
    - The e2e test passes through the catalogue-unavailable path without asserting it.
    - The pipeline's grants on `collected_posts` are proven in the db harness. Those on `post_extractions`, `deals` and `pipeline_runs` are not.
    - The build-output scan must scan the deploy job's build. The e2e build has a blank RAWG key and the local `NEXT_PUBLIC_*` values.
  - **Phase 4:**
    - The guest redirects and server-side sign-out revocation are covered by e2e.
    - What remains is isolation per role (`anon`, user A, user B, the pipeline role), plus the access decision, session refresh and caching below the browser.
    - The local stack (PostgreSQL 17 with GoTrue and PostgREST) is a candidate for Data API isolation checks beside PGlite. It is not a grants oracle while CLI 2.117.0 grants new objects automatically. Phase 4 research decides.

#### 5. §4 Stack

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "none yet" and "research picks one" rows with what is installed and wired, record the current test base, and restate the constraints for the local stack.

**Contract**:
- **Paragraphs.** Keep the "Test base at writing: **none**" paragraph as history. Add "Test base at refresh (2026-10-15): **meaningful**": Vitest and Playwright are configured, with 25 test files (unit 14, db 7, hooks 1, e2e 3). No unit test covers auth, the collector or the catalogue.
- **Rows.** Every row with a version or tool carries `checked: 2026-10-15`.
  - **unit + integration:** Vitest `^5.0.4` (5.0.4 installed). Notes unchanged.
  - **database:**
    - PGlite `0.5.9`, an exact pin, chosen in Phase 1. It is built from `supabase/migrations/`, and its stub roles model Supabase's default privileges on both sides of 2026-10-30 (§6.2).
    - The local Supabase stack (Docker; PostgreSQL 17, GoTrue, PostgREST) exists for dev and e2e. It is no grants oracle under CLI 2.117.0.
    - Drop "Phase 1 research picks one".
  - **boundary stubs:**
    - Still "none yet — see Phase 3". No automated test calls live feeds, the model or RAWG.
    - The only stub is a `fetch` tripwire in the e2e account tests, which proves that a refused target sends nothing.
    - The e2e server's RAWG key is blank.
  - **LLM regression (AI-native):**
    - `npm run extract:eval` over 55 real and 8 synthetic labelled posts, running each candidate model twice. It is wired (§5).
    - The post texts are uncommitted but re-exportable with `export-posts.sql` (§6.3).
    - Keep the "When NOT to use" text.
  - **post-edit hook (AI-native):**
    - Three hook scripts are wired. After each Edit or Write: lint and the fast suites. At the end of the turn: lint, `npm test` and `tsc`.
    - Blind spots:
      - the per-edit hooks see only Edit and Write;
      - the end-of-turn hook sees whatever is uncommitted when the agent stops, Bash and hand edits included, but not changes committed during the turn;
      - nothing runs outside an agent session.
    - Keep "When NOT to use".
  - **e2e:**
    - Playwright 1.64.1, three tests (the auth setup, the seed, the main flow) and the CI `e2e` job.
    - The `playwright-cli` skill for exploration.
    - Notes stay: one flow, behaviour not layout.
  - **agent browser:** Chrome DevTools MCP, `checked: 2026-10-15`, notes unchanged.
  - **accessibility:** unchanged.
- **The grounding note.** Rewrite it for the 2026-10-15 session in the schema's four lines, each ending `checked: 2026-10-15`:
  - **Docs:** Context7 available. It was not re-queried, because the 2026-10-12 checks are three days old. Name what those covered, with their date. Playwright 1.64.1 and Supabase CLI 2.117.0 were read from the installed packages.
  - **Search:** WebSearch available, not used. Exa.ai not available.
  - **Runtime/browser:** Chrome DevTools MCP and the `playwright-cli` skill available. Playwright MCP not available.
  - **Provider/platform:** no GitHub, Supabase or Vercel MCP.
- **The constraints paragraph.**
  - Keep Node 24 and `--omit=dev`.
  - Replace the shared-project sentence and its "Phase 5 research decides" clause with:
    - dev and E2E run on the local stack;
    - previews and `npm run dev:hosted` reach the production project;
    - `next build` and `next start` are unguarded, because the target guard runs under `next dev`, in the e2e config and in the scripts;
    - agents ask before `npm run local:reset`, which wipes local data and accounts, the E2E user included.

#### 6. §5 Quality Gates

**File**: `context/foundation/test-plan.md`

**Intent**: List each gate where it actually runs and with what it actually catches today.

**Contract**: Rows in the existing order. The lint and format row and the security advisors row stay as they are.

- **typecheck**
  - Where: CI `e2e` job's `next build` (beside `verify`, before `deploy`) and `deploy`'s `vercel build`; locally the end-of-turn hook's `tsc --noEmit`.
  - Required: required (wired). Note that it has never been proven red.
- **`npm test`**
  - Catches: matching, listing and link regressions, and an eval record that no longer matches the prompt or labels.
  - Pipeline and access regressions are named as after §3 Phases 3 and 4.
- **migration-only changes**
  - Such pushes skip `ci.yml`, E2E included.
  - `database-tests.yml` runs `npm test` for them.
  - Locally, `npm test` and then `npm run local:up` apply the migration before `db:push`.
- **extraction eval**
  - Required (wired).
  - `npm test` fails on a fingerprint mismatch, and the extract step refuses a prompt mismatch.
  - It is still human-run, because it needs the OpenRouter key and the uncommitted post texts.
- **post-edit hook:** local (agent loop), wired, not a gate.
- **build-output secret scan:** Where becomes "CI, on the `deploy` job's build"; required after §3 Phase 3.
- **e2e on the main flow**
  - Where: CI `e2e` job, on a local stack with seed data, beside `verify`; `deploy` needs it.
  - Required: required (wired, proven red 2026-10-15); not a required status check in branch protection.

#### 7. §7 What We Deliberately Don't Test

**File**: `context/foundation/test-plan.md`

**Intent**: Add the exclusions decided in the rollout phases' plans, grouped by phase, each with its reason, a re-evaluate condition and its source. Without them a later contributor would add a test that was declined.

**Contract**: The intro sentence also names the rollout phases' plans (2026-10-13 to 2026-10-15). The four existing bullets stay. Three new top-level bullets in the existing `- **Name** — …` form follow, each with one sub-bullet per exclusion and one `(Source: <slice> plan, <date>.)`. §7 ends with 7 top-level bullets.

The re-evaluate conditions are derived at refresh time from each exclusion's stated reason, because no source states one:
- **Decided in Phase 1, matching rule protection** (Source: `testing-matching-rule-protection` plan, 2026-10-13):
  - **The acceptance sample's four misses** (Dragon's Dogma 2 Dark Arisen ×3, the Fortnite bundle) are an accepted cost. The PRD promises no completeness, and 39 of 43 met the 80% bar. Re-evaluate if an acceptance measurement falls below the PRD's 80%.
  - **No normalisation beyond NFC.** NFKC widens the rule (Roman numerals, fullwidth letters), which is a product decision. Re-evaluate if the product decides to fold compatibility forms alike.
- **Decided in Phase 2, extraction and listing guard** (Source: `testing-extraction-and-listing-guard` plan, 2026-10-13):
  - **No real posts added to the labelled set.** It grew by synthetic posts reviewed by Tomasz, and they prove less about messy input. Re-evaluate if the sample review finds a model error on real posts that the eval did not catch.
  - **No lookalike detection and no shop allow-list.** Code cannot tell a lookalike from a real shop. Re-evaluate if production data shows a lookalike or an uncollected aggregator stored as a shop link.
  - **No test of the page query's `.or()` filter.** The database's predicate is the tested layer, and asserting the filter text would mirror the implementation. Re-evaluate if the page ever reads deals with a key that bypasses RLS.
- **Decided in Phase 5, main flow end to end** (Source: `testing-main-flow-end-to-end` plan, 2026-10-15):
  - **No E2E against the hosted project.** It is production, and the test creates accounts through the admin API. Re-evaluate if a failure only the shipped build or the hosted project shows reaches users. A read-only guest smoke check after deploy is the cheapest next step.
  - **No catalogue path and no RAWG mock in E2E.** Risk #7 belongs to Phase 3, below the browser. Re-evaluate when Phase 3 ships, if it leaves a gap only a browser shows.
  - **No E2E on pushes touching only `supabase/**`.** `database-tests.yml` runs `npm test` for them, and E2E runs on the next push that runs `ci.yml`. Re-evaluate if a migration breaks the main flow in a way `npm test` misses.

#### 8. §8 Freshness Ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Date the refresh and flag the two dated events that can invalidate the guide before the deadline.

**Contract**:
- The three dates become 2026-10-15.
- Add one sentence before the refresh triggers: two dated events fall before the 2026-11-04 deadline.
  - The DST change on 2026-10-25 (§2 #2).
  - Supabase's default-privileges change on 2026-10-30 (§2 #3, #4).
- The four refresh triggers stay.
- The header's "Last updated: 2026-10-15" already holds.

### Success Criteria:

#### Automated Verification:

- Only the guide and this change folder changed: `git status --short` lists `context/foundation/test-plan.md` and `context/changes/test-plan-refresh-2026-10-15/` only.
- §2 ratings unchanged against `c4ef68b`. The command prints nothing: `sec2() { awk '/^## 2\. /,/^### Risk Response Guidance/' | awk -F'|' '/^\| [1-7] \|/{print $2"|"$4"|"$5}'; }; diff <(git show c4ef68b:context/foundation/test-plan.md | sec2) <(sec2 < context/foundation/test-plan.md)`
- §3 Status and Change folder unchanged against `c4ef68b`. The command prints nothing: `sec3() { awk '/^## 3\. /,/^## 4\. /' | awk -F'|' '/^\| [1-5] \|/{print $2"|"$7"|"$8}'; }; diff <(git show c4ef68b:context/foundation/test-plan.md | sec3) <(sec3 < context/foundation/test-plan.md)`
- No file anchor in §2: `awk '/^## 2\. /,/^## 3\. /' context/foundation/test-plan.md | grep -cE '\.(ts|tsx|mts|mjs|sql|yml|json)\b'` prints `0`.
- Stale phrases gone: each of these returns `0` from `grep -cF` on the guide:
  - "the database carries no expiry condition"
  - "today it finishes clean on leaks"
  - "not reproducible from the recorded export"
  - "they predate the set rule"
  - "A local stub reproduces"
  - "belongs to §3 Phase 5"
  - "none yet — see Phase 5"
  - "none yet — see Phase 2"
  - "decides where the e2e test runs"
  - "environment chosen in §3 Phase 5"
  - "Phase 1 research picks one"
  - "is a decided rule"
- §7 has seven top-level bullets: `awk '/^## 7\. /,/^## 8\. /' context/foundation/test-plan.md | grep -c '^- \*\*'` prints `7`.
- §8 is dated: `grep -cE '^- (Strategy|Stack versions|AI-native).*2026-10-15$' context/foundation/test-plan.md` prints `3`.
- §4's counts match the repository: `git ls-files 'tests/unit/*.test.ts' | wc -l` gives 14, `tests/db/*.test.ts` 7, `tests/hooks/*.test.ts` 1, `tests/e2e/*.ts` 3.

#### Manual Verification:

- Tomasz reads the §1–§2 diff and confirms it matches his direction in `change.md`, with the nine corrections.
- Tomasz reads the §3–§5, §7 and §8 diff and confirms that the Phase 3 and 4 notes, the gate rows and the derived re-evaluate conditions say what he means.
- Every table in §2–§5 renders as a table in the editor preview, with no broken row.

**Implementation Note**: After all automated verification passes, pause for Tomasz's confirmation of the manual checks before committing. Phase blocks use plain bullets. The corresponding `- [ ]` checkboxes live in `## Progress`.

---

## Testing Strategy

There are no product tests: this is a documentation change. The automated criteria are the test. They prove that the four things the direction holds fixed did not move: ratings, §3 statuses, no anchors in §2 and §7's size. They also prove that every phrase known to be stale is gone. The dry run on 2026-10-15 found each stale phrase exactly once (`is a decided rule` twice), and found the anchor check and both diffs clean on the current file. So each check can fail.

## Performance Considerations

None.

## Migration Notes

None. `/10x-test-plan` reads §3 by column, and its rows keep their shape. The next run finds Phase 3 as the first pending row, as before.

## References

- Direction and discovery: `context/changes/test-plan-refresh-2026-10-15/change.md`
- Skill and schema: `.claude/skills/10x-test-plan/SKILL.md:573-580`, `.claude/skills/10x-test-plan/references/test-plan-schema.md`
- §7 sources:
  - `context/changes/testing-matching-rule-protection/plan.md:71-72`
  - `context/changes/testing-extraction-and-listing-guard/plan.md:118-126`, `:159-160`
  - `context/changes/testing-main-flow-end-to-end/plan.md:75-83`
- Evidence:
  - `context/changes/testing-extraction-and-listing-guard/change.md:41-43`
  - `context/changes/local-supabase-stack/research.md:46`, `:135`, `:159`
  - `context/foundation/infrastructure.md:129`
  - `tests/db/harness/database.ts:8-12`
  - `scripts/extract/extract.mts:209-230`
  - `.github/workflows/ci.yml`
  - `.github/workflows/collect.yml`
  - `.claude/settings.json`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Refresh the guide

#### Automated

- [x] 1.1 Only the guide and this change folder changed — 70115b1
- [x] 1.2 §2 ratings unchanged against c4ef68b — 70115b1
- [x] 1.3 §3 Status and Change folder unchanged against c4ef68b — 70115b1
- [x] 1.4 No file anchor in §2 — 70115b1
- [x] 1.5 Stale phrases gone — 70115b1
- [x] 1.6 §7 has seven top-level bullets — 70115b1
- [x] 1.7 §8 is dated 2026-10-15 — 70115b1
- [x] 1.8 §4's counts match the repository — 70115b1

#### Manual

- [x] 1.9 Tomasz confirms the §1–§2 diff matches his direction — 70115b1
- [x] 1.10 Tomasz confirms the §3–§5, §7 and §8 diff — 70115b1
- [x] 1.11 Every table in §2–§5 renders with no broken row — 70115b1
