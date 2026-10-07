<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Physical Deals from Real Posts

- **Plan**: context/changes/physical-deals-from-real-posts/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Only F1 and F2 are warnings. Every other dimension's verdict comes from observations alone.

### Evidence gathered

- **Automated criteria of every phase, re-run on 2026-10-06:**
  - `npm run lint`, `npm run format:check` and `npm run build` pass. In the build, `/` is dynamic and `/kitchen-sink` is prerendered with status 404.
  - Without credentials, `node scripts/extract/eval.mts` exits 1 naming `OPENROUTER_API_KEY`, and `node scripts/extract/extract.mts` exits 1 naming `NEXT_PUBLIC_SUPABASE_URL`.
  - With placeholder credentials, `EXTRACT_SINCE=not-a-date` exits 1 naming the variable.
  - `scripts/extract/eval/posts.json` is ignored, and `labels.json` is not.
  - `npx supabase gen types typescript --linked --schema public` shows the three new tables, the two new `collected_posts` columns, and `deals.set_with: string[]`.
  - `curl` against the local server and against production returns:
    - 200 with 30 cards for `/` and for `/?page=abc`;
    - 200 with the past-the-end state for `/?page=999`;
    - 404 for production `/kitchen-sink`.
- **Testing Strategy cases:** the drift reviewer ran the plan's cases against the pure functions from a scratch script outside the repository. All 66 pass, the DST rows of `expiryInstant` included.
- **Manual check 4.6:** checked independently against a crawl of all 39 pages of `/` (1,162 listed deals). Two show an expiry, both after the crawl, so no expired deal is listed.
- **Guardrails in "What We're NOT Doing":** all respected. There is no SDK, no RAWG call, no index, no `cacheComponents` or segment config, and no outline or destructive button variant in the view.

## Findings

### F1 — A later sighting of an extracted link re-extracts it automatically

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/extract/pipeline.mts:87-114, scripts/extract/store.mts:118-139 and :174-203
- **Detail**:
  - **The plan's promise.** It says "Rows that share a link are extracted once" (plan.md:108), and that re-extraction is a deliberate reset (:115, :929). Its mechanism, closing rows by link, only covers the rows that exist when the link is extracted.
  - **How a late sighting gets in.** A collected_posts id is a hash of the feed id and the entry key (scripts/collector/posts.mts:107). A link sighted later in another feed therefore arrives as a new pending row. `planRun` groups only pending rows and never consults post_extractions.
  - **What happens to the link.** It goes through the model again, built from the late row alone, and `saveExtraction` replaces its post_extractions row and its deals. Three effects follow:
    - **A second paid call** for the same link.
    - **The earlier feed's hint is lost.** prompt.mts:61 takes a `boxed` hint as support for "physical", so a lowcygier excerpt first filed under `promocje-pudelkowe`, then under `polecane` (hint `mixed`), can flip to `unclear` and leave `/`.
    - **The deal can move to the top of `/`.** `published_at` can move to the late row's `first_seen_at` when that feed gives no date (deals.mts:275).
  - **Frequency** is unmeasured.
- **Fix A ⭐ Recommended**: Close a late sighting without a call. Before extracting, read `post_extractions.extracted_at` for the run's links. Pending rows first seen after their link's extraction are closed the way linkless rows are. Rows first seen before it, a deliberate reset or a crash before step 3, are still extracted.
  - Strength: restores "extracted once" and "no automatic re-extraction" as the plan states them, keeps the reset and crash-recovery paths working, and saves the call. The decision is one pure function in pipeline.mts, and the cost is one extra read per run.
  - Tradeoff: a post edited after extraction is not re-read when another feed carries it. The change touches store.mts, pipeline.mts and extract.mts, and needs a proving run.
  - Confidence: MED — the `first_seen_at` against `extracted_at` rule separates the cases by construction, but it is untested on live data.
  - Blind spot: how often late sightings happen and whether any changed a verdict. A SQL count of links whose rows span more than one collection run would show it.
- **Fix B**: Measure first. Record the behaviour in change.md, count the late sightings with SQL, and decide afterwards.
  - Strength: no code change now, and the data comes before the design.
  - Tradeoff: extra calls and possible verdict flips continue in the meantime, and the plan's wording stays contradicted.
  - Confidence: HIGH that deferring is cheap (about $0.0002 a call); LOW on the quality impact.
  - Blind spot: the flip rate is unknown until measured.
- **Decision**: FIXED (Fix A).
  - `loadExtractionTimes` in store.mts and the pure `setAsideLateSightings` in pipeline.mts, wired in extract.mts. Late sightings are closed with the linkless rows, and the summary counts them.
  - Verified by an 11-case scratch harness covering a late-only link, a reset alongside a late row, a never-extracted link, linkless and blank links, an unparsable time and an equal instant. `npm run lint`, `npm run format:check` and `npm run build` pass, and checks 3.2 and 3.11 behave as before.
  - The new read against the live database awaits Tomasz's `npm run extract -- --limit 3`.

### F2 — A failure tied to one link can stop every run and is never counted

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/extract/openrouter.mts:206-236, scripts/extract/pipeline.mts:229-234 and :252-266, scripts/extract/extract.mts:136-139
- **Detail**:
  - **Classification.** After one retry, a timeout, a 408 or any 5xx is systemic. `stopsRun` then stops the run, and `failuresToCount` counts only per-post failures.
  - **The loop.** A link whose reply runs past 180 s twice, or whose input makes the provider answer 5xx, is never counted or given up. Each run extracts the newer posts and then reaches that link. It stops there and records `failed`, and the workflow turns red every four hours.
  - **Effects.**
    - Older links behind it wait indefinitely.
    - The select policy hides failed runs, so the freshness line goes stale and stays stale.
  - **Bad-data writes.** A store write that Postgres rejects for that link's data does the same through `status: "error"`, for example a `\u0000` that jsonb refuses with 22P05.
  - **History.** The 2026-10-05 incident (config.mts:33-41) was this loop at 60 s. Raising the limit to 180 s narrows it to endpoints slower than about 23 tokens a second.
- **Fix**: Count the failure against the link when the run has extracted at least one other link. This covers the link whose call failed systemically after its retry (timeout, 408 or 5xx), and a write rejected with a data-class SQLSTATE (22xxx or 23xxx). `MAX_ATTEMPTS` then gives it up. A run in which nothing succeeded still counts nothing, as `shouldCountFailures` already decides.
  - Strength: reuses the plan's own reasoning: a run with a success proves the service works, so what failed belongs to the post. The loop ends after three runs.
  - Tradeoff: a partial outage could spend an attempt on an innocent link. Counting only the one link that stopped the run keeps that to one attempt per run.
  - Confidence: MED — the classification change is small, but its interaction with concurrent in-flight failures needs care.
  - Blind spot: whether this morning's stale period (03:17 to 13:12 Warsaw time) came from such a loop. `pipeline_runs.failure_reason`, read with the owner role, would show it.
- **Decision**: FIXED.
  - **What changed.**
    - `failed()` in store.mts carries the SQLSTATE as `code`, which `storeErrorCode` reads.
    - Error outcomes record it.
    - In a run that extracted another link, `failuresToCount` now counts the one link that stopped the run when `canBeTheLinks` holds: `timeout` or `unavailable` after the retry, or a write refused with SQLSTATE class 22 or 23.
    - Other extractor errors still block all counting, and the run still stops and is recorded `failed`.
    - The summary's "Stopped:" lines no longer claim nothing counts, and `countingLine` says when the stopping link was counted.
  - **Plan deviation.** This departs from the plan's "Outages stop the run at once and never count" for that one link, by Tomasz's decision in this triage.
  - **Verification.** A 26-case scratch harness passes. It covers a timeout or 5xx after a success, timeouts and 429, 402 not counted, 22P05 and 23505 writes, 42501 and a bug blocking everything, two stops in flight, `countingLine`, `toRunRow` and `storeErrorCode`. Lint, format and build pass; format needed one Prettier rewrap. Checks 3.2 and 3.11 behave as before.

### F3 — Deals are replaced by delete-then-insert outside a transaction

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/extract/store.mts:187-194
- **Detail**:
  - **The window.** The link's deals are deleted, then the new ones inserted, in two requests. On a re-extraction, a crash or a failed insert after the delete removes the link's listed deals from `/` until a later run extracts it again. A re-extraction is a deliberate reset today, or routine through F1.
  - **Recovery.** It holds in the common case, because `processed_at` is still null. It fails when the rows fall out of reach: `EXTRACT_SINCE` later than their `first_seen_at`, or more than 1,000 newer pending rows.
  - **The plan** specified this order and its recovery argument.
- **Fix A**: Replace the rows inside one SQL function, delete and insert in a transaction, called through `.rpc()` with execute granted to `service_role` only.
  - Strength: atomic, so the window disappears.
  - Tradeoff: the schema's first function, with a migration that Tomasz pushes, a grant, and the advisor's function lints to satisfy.
  - Confidence: MED.
  - Blind spot: `db:check` findings for functions, such as a mutable search_path.
- **Fix B ⭐ Recommended**: Accept the window and state it next to the write order in store.mts. With F1 fixed through Fix A, only a deliberate reset ever re-extracts.
  - Strength: no schema change, and consistent with the plan.
  - Tradeoff: a residual window during deliberate resets.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B). The window is stated in `saveExtraction`'s comment in store.mts: step 2 is not a transaction, a crash mid-way hides a re-extracted link's deals until a later run, and recovery fails beyond the cut-off or the 1,000-row window. It is accepted because, with F1 fixed, only deliberate resets re-extract.

### F4 — A future EXTRACT_SINCE gives quiet `ok` runs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/extract/pipeline.mts:165-184
- **Detail**:
  - **The gap.** `readCutoff` accepts any valid date. A typo such as `2026-11-05` makes every pending row ineligible, and each run extracts nothing while recording `ok`. The freshness line then says "fresh" while no deal arrives, the very case it exists to expose.
  - **The constraint.** Check 3.12 relies on a future `--since` in a local run.
- **Fix**: Refuse a cut-off later than the run's start when the run records a pipeline_runs row (`COLLECT_OUTCOME` set). A local `--since` in the future stays allowed for check 3.12.
- **Decision**: FIXED, in code only; Tomasz declined the CLAUDE.md sentence.
  - **What changed.** The pure `checkCutoffNotAhead` in pipeline.mts is called in extract.mts right after `readCutoff`, before any read. A recorded run with a future cut-off aborts naming the variable and exits 1, so the workflow turns red and no `ok` row is written.
  - **Verification.** A 6-case scratch harness passes. A placeholder-credential run with `EXTRACT_SINCE=2099-01-01` and `COLLECT_OUTCOME=success` aborts before any request. Checks 3.2, 3.11 and `--since nonsense` behave as before, and Prettier and lint pass.

### F5 — Read failures on `/` leave no server-side trace

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/deals/queries.ts:82-96
- **Detail**: `readRows` drops the error object. A production 42501 or PGRST error shows only the inline "Nie udało się wczytać okazji", and nothing reaches the Vercel logs to diagnose it with.
- **Fix**: On the server, `console.error` the PostgREST `code` and the table name, without the message or details. The UI copy stays fixed.
- **Decision**: FIXED.
  - **What changed.** `readRows` now takes the table name and logs one of three lines, never the error's message: `Reading <table> failed: <code>`, `Reading <table> threw`, or `… unexpected shape at <column>`. The module comment says so, and the UI copy is unchanged.
  - **Verification.** Lint, format and build pass, and the local `/` still returns 200 with 30 cards.

### F6 — `service_role` keeps an unused `select` on pipeline_runs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260930061820_create_pipeline_runs.sql:19-25
- **Detail**:
  - **The grant.** The comment says the table grants "exactly what the extractor uses … one insert per run", but the grant is `select, insert`.
  - **The only use.** The secret-key client touches the table once, at store.mts:285, with an insert that carries no `.select()`.
  - **The origin.** The plan asked for `select, insert` (plan.md:527), so the plan contradicts CLAUDE.md's "exactly what the writer uses".
- **Fix**: Add a follow-up migration `revoke select on table public.pipeline_runs from service_role;`, with `-- Revert: grant select …`, pushed by Tomasz. Alternatively, record why `select` stays.
- **Decision**: FIXED. Tomasz reported the migration pushed on 2026-10-06.
  - **The migration.** `supabase/migrations/20261006124528_revoke_select_on_pipeline_runs_from_service_role.sql`, created with `npm run db:new`, carries both header lines and revokes `select` from `service_role`.
  - **Remaining steps, all Tomasz's.**
    - `npm run db:push -- --dry-run` should list this migration alone.
    - Then `npm run db:push`, `npm run db:check` and `npm run db:status`.
    - The next `collect` run confirms the insert still works; a missing grant would show as `42501` in the Actions log.
  - **Plan deviation.** It departs from plan.md:527, which asked for `select, insert`, in favour of CLAUDE.md's rule.

### F7 — loading.tsx and error.tsx sit at the root of the `(app)` group

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/app/(app)/loading.tsx, src/app/(app)/error.tsx
- **Detail**:
  - **The shared layout.** `(app)/layout.tsx` is "the header every product view shares".
  - **The effect on later views.** Any view added under `(app)` would inherit the deals heading and skeleton while it loads, and the deals error copy when it fails. S-03's watchlist is the likely first.
  - **The origin.** The plan placed both files there.
- **Fix**: When the next view lands under `(app)`, move `/` into a nested route group such as `src/app/(app)/(deals)/`, with its own page, loading and error files.
- **Decision**: FIXED now, rather than waiting for S-03.
  - **What changed.** `page.tsx`, `loading.tsx` and `error.tsx` moved to `src/app/(app)/(deals)/`, while `(app)/layout.tsx` stays. One path in a deals-section.tsx comment was updated.
  - **Verification.** The build's route table is unchanged: `/` is dynamic and `/kitchen-sink` is prerendered 404. Lint and format pass. On the dev server, `/`, `/?page=abc` and `/?page=999` return 200 with the heading, 30 cards, page 1 and the past-the-end state respectively.

### F8 — OpenRouter knowledge outside openrouter.mts, and duplicated helpers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/extract/evaluation.mts:582-594, scripts/extract/eval.mts:92 and :158
- **Detail**:
  - **Provider knowledge.** `isSameModel` encodes how OpenRouter reports the model it served (`:free` variants, date suffixes). CLAUDE.md makes openrouter.mts the only file that knows OpenRouter.
  - **Duplicates.** eval.mts re-declares `errorMessage`, exported from scripts/collector/posts.mts:214, and `describeFailure`, exported from scripts/extract/pipeline.mts:237.
- **Fix**: Move `isSameModel` into openrouter.mts, and import the two existing helpers in eval.mts.
- **Decision**: FIXED.
  - **What changed.** `isSameModel` moved, unchanged, into openrouter.mts, and evaluation.mts imports it. eval.mts imports `errorMessage` from scripts/collector/posts.mts and `describeFailure` from pipeline.mts instead of its identical copies.
  - **Verification.** Five `isSameModel` cases give the same answers. Check 1.2 still exits 1 naming `OPENROUTER_API_KEY`, which proves the module graph loads, and lint, format and build pass.

### F9 — Phase 4's adaptations are not recorded in change.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/physical-deals-from-real-posts/change.md
- **Detail**: Four adaptations exist only in the code and the implementation session:
  - the shared frame `src/components/deals/deals-page.tsx`, which is not in the plan's file list;
  - the sync `DealsResults`, `DealsEmpty` and `DealsError` exports from deals-section.tsx;
  - `/` as the address of page 1;
  - the "Strona N" label in the pagination.

  change.md records the earlier phases' deviations. None of these four changes a contract.
- **Fix**: Append one dated note to change.md listing the four adaptations.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Record every departure from the plan in change.md, in the commit that makes it.
  - change.md gained two dated notes: Phase 4's four adaptations, and the departures this triage made from the plan (F1, F2, F4, F6, F7), pointing at this report.
  - The rule was appended to context/foundation/lessons.md.

### F10 — Check 3.8 is ticked while change.md calls its second half pending

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/physical-deals-from-real-posts/change.md:20, plan.md Progress 3.8
- **Detail**:
  - **The record.** change.md says the second half of 3.8, "a later run processes the posts it collected", waits for a scheduled run. 3.8 is ticked with `4ccc5ed`, and nothing records when that half was confirmed.
  - **Today's evidence supports it.** Production lists deals published on 6 October, and an `ok` run finished at 13:12 Warsaw time.
- **Fix**: Append to change.md when and how the second half was confirmed.
- **Decision**: FIXED. Tomasz confirmed the second half of 3.8, and change.md records his confirmation with the production evidence of 2026-10-06: deals published that day on `/`, and an `ok` run that finished at 13:12 Warsaw time.
