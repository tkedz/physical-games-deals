<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Collector into the repository and into the database

- **Plan**: `context/changes/collector-into-repo-and-database/plan.md`
- **Scope**: Phases 1-3 of 4 (Phase 4 — Cutover — not started)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Commits**: `a3e3064`, `66d420d`, `0971a9a`
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## What was verified, not assumed

The four invariants the plan calls catastrophic to break were checked against the original source rather than against comments:

- `makeId` — identical algorithm, separator and truncation (`collect.mts:49-54` against `_incoming/cron-collector/src/collect.ts:79-81`).
- Key precedence `item.guid || item.link || item.title`, including the falsy-`||` semantics.
- Nine fields to nine columns, same sources, same 4000-character cap.
- `id` taken verbatim by the importer; no hash function is reachable from `import-jsonl.mts`.
- `feeds.json` sha256 `fe1ee226...721cee` on both copies, byte-identical by `cmp`.
- Chunk size 500 against `max_rows = 1000` in `supabase/config.toml:18`.

All nine "What We're NOT Doing" guardrails hold. The plan's prose was never edited to fit the code — the only `plan.md` changes across the three commits are Progress ticks and SHA stamps.

Automated criteria re-run on the committed tree: `db:push --dry-run` (up to date), `db:status` (no drift), `db:check` (no findings), the table's ten columns with `processed_at` nullable, `lint`, `format:check`, `build` — all pass. Criteria 2.5-2.6 and 3.2-3.6 rest on user confirmation; they need `.env.local` and the SQL editor, which the reviewer cannot reach.

## Findings

### F1 — An unparseable feed date can poison an entire write chunk

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/collector/collect.mts:85`, `scripts/collector/import-jsonl.mts:88`
- **Detail**: `published_at: item.isoDate ?? item.pubDate ?? null` puts raw feed text into a `timestamptz` column. Verified in `node_modules/rss-parser/lib/parser.js:314-321`: `setISODate` assigns `isoDate` inside a `try`, so it is set only when `new Date(...).toISOString()` succeeds. The `pubDate` fallback therefore fires precisely on the strings JavaScript could not parse, which Postgres will most likely reject too. `insertPosts` throws on the first rejected chunk (`posts.mts:76-78`), so one bad entry loses its whole 500-row chunk and every chunk after it, exits 1, and repeats every four hours until the entry ages out of the feed. This is the same failure `toCategories` (`posts.mts:41-46`) was written to prevent for `categories` — the defence exists in the file and was not applied to this column. The current corpus is clean (0 of 1,375 records), so this is latent, not a live break.
- **Fix**: Normalise in the pure mapper: keep `item.isoDate`; otherwise parse `item.pubDate` and keep it only when `Number.isFinite(d.getTime())`; otherwise null. Mirror it at `import-jsonl.mts:88` for `raw.published_at`.
  - Strength: Reuses the defence pattern already in `posts.mts`; keeps the column's meaning rather than dropping the row.
  - Tradeoff: A record with an unreadable date silently loses it instead of failing loudly — worth a counter in the summary line.
  - Confidence: HIGH — the rss-parser behaviour was read in its source, not inferred.
  - Blind spot: Postgres accepts some strings JavaScript rejects, so the true blast radius may be narrower than the mechanism suggests.
- **Decision**: FIXED — `toTimestamp` added to `posts.mts` and applied in both mappers; `first_seen_at` hardened in the importer (unreadable value skips the line); dropped dates counted in both summaries.

### F2 — The importer reports skipped lines and still exits 0

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `scripts/collector/import-jsonl.mts:136-140`, `:157-173`
- **Detail**: The import fails only when every line is skipped. A run where some lines are skipped prints `SKIP line N — ...` on stderr and returns success. This is the one-shot migration of the whole historical corpus, and Phase 4 runs it again on the final export — the least recoverable moment there is, since these feeds retain roughly two days. `context/foundation/lessons.md` names exactly this shape: a gate that exits 0 while printing the problem it was hired to catch. Criterion 3.2 ("0 unparseable") is currently a human reading a log for something the exit code could assert.
- **Fix**: Set `process.exitCode = 1` when `skipped > 0`, naming the count, with an explicit opt-out flag for a deliberately lossy import.
- **Decision**: SKIPPED — user reads the import log at the moment of running it, so the exit code is not the only signal here.

### F3 — The pure mapper sits in a module that cannot be imported

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `scripts/collector/collect.mts:71` with `:178`; `scripts/collector/import-jsonl.mts:50` with `:178`
- **Detail**: `plan.md:157` requires "a pure function maps `(feed, item)` to a row ... so the one piece of domain logic here can be called with data once a test runner exists", and it is the first rule in `context/foundation/lessons.md`. `toCollectedPost` is pure and exported — but from a file whose last statement is `main().catch(...)`, so importing it starts a live collection. That is the precise hazard `posts.mts:5-8` was created to avoid; the adaptation rescued the write path and left the domain logic behind. `parsePostLine` has the same problem against `import-jsonl.mts:178`. The doc comment claiming testability does not hold today.
- **Fix**: Move `toCollectedPost` (with `makeId` and `pickContent`) and `parsePostLine` into `posts.mts`, or guard both `main()` calls behind an entrypoint check.
- **Decision**: FIXED — `toCollectedPost`, `parsePostLine`, `makeId` and `pickContent` moved into `posts.mts`, which has no top-level side effects. Hash proven unchanged against real data: 1158 of 1375 stored ids reproduce as `sha1(source|link)` through the moved code.

### F4 — Phase 4's freshness guard no longer catches a stale export

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `plan.md` criterion 4.2 and its Progress row
- **Detail**: The plan records the staged snapshot as 659 records with a newest `first_seen_at` of `2026-09-18T04:35:36.450Z`, and makes that timestamp the test that the right file was exported. The snapshot in `_incoming/` has since been refreshed: 1,375 records, newest `2026-09-23T04:38:50.959Z`, all ids unique, 15 sources, 0 unparseable. Everything up to 23 September is therefore already imported, and an export whose newest record is, say, 20 September would still pass 4.2 while being staler than the table. The guard's threshold needs to move with the data it guards.
- **Fix**: Before the cutover import, take `select max(first_seen_at) from collected_posts` and require the fresh export's newest record to beat that value, not the hard-coded September date.
- **Decision**: ACCEPTED — Phase 4 will use `select max(first_seen_at) from collected_posts` as the freshness threshold instead of the hard-coded 2026-09-18 value.

### F5 — Criterion 2.8 cannot be satisfied as literally written

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `plan.md` Progress row 2.8
- **Detail**: The row reads "With `SUPABASE_SECRET_KEY` unset, `npm run collect` fails naming that variable". Under the approved `--env-file-if-exists=.env.local` adaptation, unsetting the shell variable no longer removes the value — node reloads it from the file. What was actually exercised, and reported at the time, was `NEXT_PUBLIC_SUPABASE_URL=... node scripts/collector/collect.mts`, which loads no env file and aborts naming `SUPABASE_SECRET_KEY` before any feed is fetched. The intent is verified; the wording is stale.
- **Fix**: Record the command actually used beside the criterion, so a later reviewer does not read the tick as covering something it cannot cover.
- **Decision**: ACCEPTED — no edit. This report records the command actually run; phase blocks in the plan are read-only anyway.

### F6 — A persistently half-broken collector still shows green

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `scripts/collector/collect.mts:170-173`
- **Detail**: Exit is non-zero only when every feed fails. Fourteen of fifteen failing is a green run. The plan chose this deliberately ("A run with some feeds failing stays green"), and it is right for a flake — but nine `pepper-*` feeds share a host, so one block takes them all out at once, and nobody reads the logs of a green four-hourly cron. `failedFeeds` is counted and used for nothing but a summary line. A red run is the only alarm this workflow has.
- **Fix**: Keep exit 0 for a single flake, but write the failed feed ids to `$GITHUB_STEP_SUMMARY` and fail when a majority failed. This goes beyond the plan's stated scope, so it belongs in a follow-up rather than in this change.
- **Decision**: SKIPPED — the plan chose this threshold deliberately; left as planned.

### F7 — `allowImportingTsExtensions` is project-wide for a scripts-only need

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `tsconfig.json:12`
- **Detail**: The option was required from Phase 2 onward, because the plan specified a two-file collector and Node strips types without rewriting specifiers. `research.md:106` predicted it and authorised it, but the plan's Changes Required never named `tsconfig.json`. It is repo-wide, so `src/` may now import `./foo.ts` specifiers that the bundler may not resolve. Nothing does today.
- **Fix**: Leave as is and record the reason, or give the collector its own `tsconfig` if the scripts directory grows.
- **Decision**: FIXED — reason recorded as a comment above the option in `tsconfig.json`, noting it serves `scripts/collector/*.mts` only.

### F8 — Nothing in the repo records that `npm run collect` reads `.env.local`

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `CLAUDE.md` Secrets section; `package.json:19-20`; `.env.example:13`
- **Detail**: The Secrets rule forbids reading `.env.local` "indirectly through `cat`, `node -e`, a script, or any other shell command", and the `collect` and `collect:import` scripts are scripts that make node read it — by design and with the user's approval. This is the same literal-reading collision that Phase 1.3 resolved for the migrations rule, left unresolved here because the plan was written before the flag existed. It cost two explicit decisions during this implementation.
- **Fix**: One line beside the Secrets rule: the collector scripts hand `.env.local` to node by flag and never print it, which is the sanctioned exception.
- **Decision**: FIXED — the Secrets section of `CLAUDE.md` now names the collector scripts as the sanctioned exception, and draws the line at opening the file to read it.

### F9 — The workflow has no timeout and will auto-disable after 60 quiet days

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/collect.yml:9-12`
- **Detail**: GitHub disables scheduled workflows in repositories with no activity for 60 days, and collection would then stop with no red run to show for it. There is also no `timeout-minutes`, so the default of 360 applies where fifteen feeds at a 20-second parser timeout is a five-minute worst case.
- **Fix**: Add `timeout-minutes: 15` and note the 60-day rule beside the cron.
- **Decision**: FIXED — `timeout-minutes: 15` on the job, and the 60-day auto-disable rule recorded beside the cron.

### F10 — `npm ci` installs the full dev tree in the job that later holds the key

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `.github/workflows/collect.yml:41`
- **Detail**: Scoping the secret to the Collect step already closes the install-time window, and that reasoning is sound. What remains is that the dev tree is installed at all, when the collector needs only `rss-parser` and `@supabase/supabase-js`, both in `dependencies`. The scan proposed the `supabase` CLI's postinstall as the concrete vector; that was checked and does not hold — the package declares no `install`, `postinstall` or `prepare` script, and neither does this repository. The residual concern is generic supply-chain surface, not a known hook.
- **Fix**: `npm ci --omit=dev` in this workflow.
- **Decision**: FIXED — `npm ci --omit=dev`, with the reason in the workflow.

## Dimensions that came back clean

- **Credential handling.** `SUPABASE_SECRET_KEY` appears in three tracked non-documentation places: `.env.example` (empty), the step-scoped `env:` block in `collect.yml`, and `scripts/collector/supabase.mts` reading it from the environment. Never on a command line, never in an error message, no `NEXT_PUBLIC_` prefix, and nothing under `src/` imports from `scripts/`.
- **The Data API surface is still locked.** RLS on, no policy in any migration, `revoke all ... from anon, authenticated` intact, `auto_expose_new_tables` left commented out. `add column` grants nothing, so `processed_at` inherits the lock.
- **Idempotency is real, not assumed.** `postgrest-js` sends `resolution=ignore-duplicates` with `on_conflict=id`, rendering `on conflict (id) do nothing`, and `.select("id")` returns only the rows that landed. The same code sets an explicit column list from the union of row keys, so `processed_at` is genuinely absent from the INSERT and takes its default.
- **Pattern compliance.** `scripts/collector/supabase.mts` is deliberately unlike the three clients under `src/utils/supabase/` and stricter than them — it validates its environment instead of asserting with `!`. `collect.yml` matches `ci.yml` on action versions, node setup and secrets-via-`env:`; every divergence carries its reason in a comment.
- **The CLAUDE.md amendment is sound.** Restricting the absolute prohibition to schema changes and naming the row-write exception is the narrower, more defensible rule, and `.env.example` was corrected in the same commit so the two documents no longer disagree. One residual: the exception is pinned to a named workflow file, so a second row-writing workflow would mean editing the rule rather than reasoning from it.
