# Collector into the repository and into the database — Implementation Plan

## Overview

Move the RSS collector out of the gitignored `_incoming/cron-collector/` staging directory into `scripts/collector/`, swap its output from an appended JSONL file to `public.collected_posts`, import the posts gathered so far, and run it on its existing four-hourly schedule from this repository's GitHub Actions. This is roadmap item F-02. The code already works and the data already exists, so the work is in the move: keeping the identifier hash byte-identical so nothing duplicates, and switching schedules without losing collection days against feeds that retain roughly two days.

## Current State Analysis

The destination is further prepared than the source. `public.collected_posts` was created by `schema-migrations-and-rls-baseline` as a field-for-field mirror of the collector's nine-key record, with row-level security on, no policy and no grants for `anon` or `authenticated` (`supabase/migrations/20260921133305_create_collected_posts.sql:16-20`). That change stated outright that the table name and its nine columns are load-bearing because this change's loader is written against them (`context/changes/schema-migrations-and-rls-baseline/plan.md:145`), and deferred both the data import and any index to here.

The source is a single 179-line file with one runtime dependency (`_incoming/cron-collector/src/collect.ts`, `package.json:15-21`). It resolves `feeds.json` and `data/raw.jsonl` relative to its own location, deduplicates by loading every known id into a `Set` before collecting, appends new records as JSON lines, and pushes the file back to its repository from a workflow. Its staged snapshot holds 659 well-formed records, 1,067,785 bytes, newest `first_seen_at` 2026-09-18T04:35:36.450Z.

Four constraints shape the move:

- **The dedupe strategy does not port unchanged.** `loadExistingIds()` (`collect.ts:52-77`) becomes a `select('id')` over the whole table, and the Data API returns at most 1,000 rows by default (`supabase/config.toml:18`) against a table that starts at 659. A truncated read is silent — no error, just a short list, and then re-inserted rows.
- **The collector exits 0 when every feed fails.** `failedFeeds` is counted and printed but never reaches the exit code (`collect.ts:155-158`, `collect.ts:176-179`), so a run in which all 15 feeds time out is a green run. This is the failure shape `context/foundation/lessons.md` already names.
- **Leaving `_incoming/` subjects the code to three gates.** The staging directory is excluded from `tsconfig.json:33` and `.prettierignore:10` but is already linted. `scripts/` is inside all three, including the `next build` type-check that runs inside `vercel build` in the deploy job.
- **The old collector is still running** in its original repository (user, 2026-09-22), and `SUPABASE_SECRET_KEY` does not exist yet in GitHub Secrets (user, 2026-09-22, matching `context/deployment/deploy-plan.md:83`).

## Desired End State

`scripts/collector/collect.mts` runs every four hours from `.github/workflows/collect.yml`, writing rows into `public.collected_posts` with the secret key, and exits non-zero when no feed succeeded. Everything the old collector ever gathered is in the table, imported by `scripts/collector/import-jsonl.mts`. The old cron is off, its repository's file is no longer the record of anything, and `_incoming/cron-collector/` is gone. `collected_posts` carries a `processed_at` column so S-01's extractor can tell an unprocessed post from a processed one and work through a backlog. `CLAUDE.md` says plainly which database writes may come from a workflow and which may not.

Verify by: a scheduled workflow run finishing green with rows written; `select max(first_seen_at) from collected_posts` inside one cron interval of now; `select count(distinct source)` returning 15; and re-running the import on the same export inserting nothing.

### Key Discoveries:

- The id is `sha1("<feed.id>|<key>")` truncated to 16 hex characters, key `item.guid || item.link || item.title` (`_incoming/cron-collector/src/collect.ts:79-81`, `:127`). Because the feed id is inside the hash, idempotence lives in the id rather than in the loader — which is what makes overlapping the two collectors and re-importing safe, and what makes any re-hash during the move catastrophic rather than merely wasteful.
- `ignoreDuplicates: true` sends `Prefer: resolution=ignore-duplicates`, which PostgREST renders as `on conflict do nothing` — exactly the semantics inherited from `schema-migrations-and-rls-baseline/plan.md:270`. Chaining `.select('id')` adds `Prefer: return=representation`, so the response carries the rows actually inserted (verified in `postgrest-js` source and the `ignoreDuplicates upsert` test, which covers the single-conflict case returning `data: []`).
- `@supabase/supabase-js` is already a dependency at 2.116.0 (`package.json:23`). Neither `pg` nor `postgres` is installed, and none is needed.
- Node 24 — pinned by `.nvmrc` and `engines.node` — executes `.mts` directly with no flag and no `tsx`. A `.ts` file with ESM imports under a `package.json` with no `"type"` field prints `MODULE_TYPELESS_PACKAGE_JSON ... Reparsing as ES module` on every run; the same file as `.mts` runs clean, and `**/*.mts` is already in `tsconfig.json:31`.
- `ci.yml`'s two `paths-ignore` lists cover no data file (`ci.yml:24-31`), so the staged workflow's commit-and-push step would have triggered `verify` plus a production deploy six times a day. Writing to Supabase removes the step and the problem together.
- Three column comments in the migration are claims about the data, and all three hold against the 659 staged records: `categories` 0–30 entries and always empty for the cenograj feeds, `content` capped at exactly 4000, `first_seen_at` collector time rather than publication time.

## What We're NOT Doing

- **No ingestion-run table.** `context/foundation/infrastructure.md:129` asks for run outcomes in a Supabase table, reasoning from Vercel's one-hour runtime log retention. The collector runs on GitHub Actions, whose workflow logs are retained far longer, and what matters operationally is whether rows landed — which the table itself answers. This is a deliberate narrowing of that infrastructure rule for this workflow, not an oversight.
- **No index.** At 659 rows the planner will not use one, and S-01's access pattern does not exist yet. Adding one later is purely additive.
- **No attempts counter or status enum.** A poison post is identified by `processed_at is null` paired with the age of `first_seen_at` — entries older than roughly seven days are treated as stale rather than retried forever. That is S-01's query, recorded here because it is why no extra column is needed.
- **No rewrite.** The collector is restructured where that removes a real failure, but `makeId`, the feed identifiers, the nine field values and the 4000-character cap stay byte-identical. The roadmap sequenced this as "a move rather than a rewrite".
- **No change to the schedule.** `7 */4 * * *` carries over unchanged. See Performance Considerations for the margin this leaves against the PRD.
- **No `DATABASE_URL` write path**, no new database driver, and no dedicated Postgres role for the collector.
- **No committed data file.** The `.jsonl` exports stay outside version control; the database is the record.
- **No extraction, parsing, normalisation or deduplication across feeds.** That is S-01.
- **No change to `ci.yml`.** A collector-only commit will run `verify` and then redeploy an identical artifact; that cost is accepted so the collector stays inside all three gates.

## Implementation Approach

The move is a transport swap wrapped in a cutover. Four phases, ordered so that nothing irreversible happens before the thing it depends on has been observed working:

1. **Database and credential first**, because nothing can be written until the key exists, and because the additive column is harmless to apply early and awkward to apply once bulk data is landing.
2. **The collector second**, proven locally against the hosted project. This is also what satisfies `context/foundation/lessons.md`'s requirement to run the pipeline's own command against a credential before it reaches CI.
3. **Import and workflow third**, once the write path is known good. The staged 659-row snapshot serves as a rehearsal of the cutover's real import — safe to load early precisely because the ids make it idempotent.
4. **Cutover last**, as a human-coordinated window across two repositories: overlap both collectors, re-export after the old cron's final run, import, then switch the old one off. No moment exists in which neither is running.

Domain logic is separated from I/O as `context/foundation/lessons.md` requires: a pure function maps `(feed, item)` to a row, and fetching and writing call it. There is no test runner in this repository, so that separation buys reviewability now and testability later, not tests today.

## Critical Implementation Details

**The hash is the invariant.** `makeId` and every `id` in `feeds.json` must survive the move unchanged. If either moves, every past entry from the affected feed gets a new identifier, and both the import and the next scheduled run duplicate all of it. Verify `feeds.json` by content hash against the staging copy rather than by reading it — the failure is a single character and it is silent until the row count doubles.

**Chunk at 500.** The Data API caps a response at 1,000 rows by default. The upsert's returned representation is subject to that cap, so chunks of 500 keep the "rows inserted" count exact for both the four-hourly run and the 659-row import.

**Cutover ordering is not negotiable.** Export from the old repository only after its last scheduled run has finished, and disable its schedule only after that export has been imported. Reversing either step opens a window against feeds that retain roughly two days, and what falls out of a feed in that window is unrecoverable.

## Phase 1: The processing column and a proven credential

### Overview

Add the one column S-01 needs, create the secret key, and settle the rule that currently forbids the workflow this change is about to create. Nothing in this phase writes a row.

### Changes Required:

#### 1. Migration adding `processed_at`

**File**: `supabase/migrations/<timestamp>_add_processed_at_to_collected_posts.sql` (generated by `npm run db:new -- add_processed_at_to_collected_posts`)

**Intent**: Give S-01 a way to distinguish a raw post that has been through extraction from one that has not, so an extractor that could not run when the cron collected can work through the backlog afterwards instead of those posts being lost. Nullable with no default, so the change is purely additive and the collector's insert never mentions the column.

**Contract**: `alter table public.collected_posts add column processed_at timestamptz;` plus a `comment on column` recording that null means not yet processed, that neither the collector nor the import script ever writes it, and that the backlog query pairs it with the age of `first_seen_at`. The two header lines this repository requires: `-- Revert: alter table public.collected_posts drop column processed_at;` and a backward-compatibility statement — yes, nothing deployed reads the table. No index.

#### 2. Create the secret key locally

**Intent**: `SUPABASE_SECRET_KEY` does not exist. It is created now and kept local; it reaches GitHub Secrets only in Phase 3, after Phase 2 has run the real command against it. `context/foundation/lessons.md` requires exactly that ordering, because an authentication error that names the identity rather than the resource sends you re-creating the value instead of widening its scope.

**Contract**: human-only, no repository file changes. Create the secret key in Supabase → Project Settings → API and place it in local `.env.local`. It is never pasted into this conversation, never read back by an agent, and never committed. A one-line connectivity check with it is enough here; the real proof is Phase 2's `npm run collect`.

#### 3. Amend the credential rule

**File**: `CLAUDE.md`

**Intent**: The rule "No credential that can write the database belongs in a workflow" sits in the **Database migrations** section and was reasoned about `db push`, yet read literally it forbids the workflow this change creates — while `context/deployment/deploy-plan.md:83` simultaneously plans `SUPABASE_SECRET_KEY` into GitHub Secrets for it. Make the distinction the rule actually means explicit where the rule lives, so it cannot be quoted against the collector later.

**Contract**: the sentence becomes a statement restricted to schema — `npm run db:push` and every DDL path stay human-only, and no credential that can change the schema belongs in a workflow. The collector's row writes are named as the deliberate exception, performed by `.github/workflows/collect.yml` under `SUPABASE_SECRET_KEY`, which never reaches Vercel or the browser. The existing **Secrets** section is untouched.

#### 4. Correct `.env.example`

**File**: `.env.example`

**Intent**: `DATABASE_URL`'s comment claims it is "For migrations and collector writes". The second half is now false, and a file naming two mutually exclusive write credentials is what made this a question in the first place.

**Contract**: `DATABASE_URL` is described as serving migrations only. `SUPABASE_SECRET_KEY` keeps its "GitHub Actions secrets (the collector)" destination and gains that it is the collector's only write path.

### Success Criteria:

#### Automated Verification:

- `npm run db:push -- --dry-run` lists exactly one pending migration
- `npm run db:status` after `npm run db:push` shows no drift between the repository and the hosted project
- `npm run db:check` exits 0
- The `information_schema.columns` query for `collected_posts` returns ten columns, with `processed_at` nullable and `timestamp with time zone`

#### Manual Verification:

- `CLAUDE.md`'s migrations section distinguishes schema writes from row writes and names the workflow and secret that perform the latter
- `.env.example` no longer describes `DATABASE_URL` as a collector write path
- `SUPABASE_SECRET_KEY` exists in the Supabase dashboard and in local `.env.local`, and its value has not appeared in this conversation or in any tracked file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: The collector in the repository, writing to the database

### Overview

Port the collector into `scripts/collector/`, move deduplication from an in-process `Set` to the table's primary key, fix the exit code, and prove the whole path with a real local run against the hosted project.

### Changes Required:

#### 1. Dependency and script

**File**: `package.json`

**Intent**: `rss-parser` is the collector's one genuine runtime dependency and is not in this repository. No runner needs adding: Node 24, pinned in `.nvmrc` and `engines.node`, executes `.mts` directly, so `tsx` does not come along from the staging directory.

**Contract**: `rss-parser` at `^3.13.0` in `dependencies`; a `collect` script running `node scripts/collector/collect.mts`. The `.mts` extension is load-bearing — under a `package.json` with no `"type"` field, a `.ts` file containing ESM imports prints `MODULE_TYPELESS_PACKAGE_JSON ... Reparsing as ES module` on every run, while `.mts` runs clean and is already in `tsconfig.json:31`'s include list.

#### 2. Feed definitions, copied verbatim

**File**: `scripts/collector/feeds.json`

**Intent**: Carry the 15 feed definitions across unchanged. Each `id` sits inside the record's hash, so one altered character re-hashes every past entry from that feed and duplicates it at the next run and at the import.

**Contract**: byte-for-byte identical to `_incoming/cron-collector/feeds.json` — 15 objects, all `enabled: true`, same `id`, `url` and `platform` values. Confirmed by content hash, not by reading.

#### 3. The collector, ported

**File**: `scripts/collector/collect.mts`

**Intent**: Swap the output from an appended JSONL file to `public.collected_posts`, and move deduplication from the in-process `Set` to the table's primary key. `loadExistingIds()` cannot survive the move: the equivalent `select('id')` is capped at 1,000 rows by default against a table that starts at 659, and the truncation is silent. The port also makes total ingestion failure visible and separates the record mapping from the fetching and the writing, per `context/foundation/lessons.md`.

**Contract**:

- `makeId` unchanged — `sha1("<feedId>|<key>")` truncated to 16 hex characters, key `item.guid || item.link || item.title`. This is the invariant the import, the overlap and every re-run rest on.
- The nine record fields keep their names, their sources and the 4000-character content cap, mapping one-to-one onto the migration's nine columns. `processed_at` is never written; the insert names nine columns and the tenth defaults to null.
- A pure function maps `(feed, item)` to a row with no I/O, so the one piece of domain logic here can be called with data once a test runner exists.
- `categories` is coerced to strings before reaching a `text[]` column. All 1,154 observed values are strings today, but `collect.ts:144` types them `unknown[]`, so a future non-string category would otherwise be rejected by Postgres and take its whole chunk with it.
- Writes go through `upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id')` in chunks of 500 — below the 1,000-row default so the returned representation is never truncated — and the run's "new entries" count comes from the returned ids.
- Rows are de-duplicated by `id` in memory before chunking. The old `Set` provided this as a side effect of `ids.add(id)`, and deleting `loadExistingIds()` removes it: a feed returning two items with the same `guid` in one response would otherwise put two identical ids into one batch, and PostgREST's behaviour in that case is unverified. A `Map` keyed on `id` closes the case without depending on the answer.
- Exit code: non-zero when zero enabled feeds succeeded. A run with some feeds failing stays green, as the collector's own README already treats it.
- A missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SECRET_KEY` aborts before any feed is fetched, with a message naming the variable, so a missing secret cannot present as a quiet "0 new entries".
- `loadExistingIds()`, the `data/` path constants and the `appendFileSync` write are gone.

#### 4. The collector's Supabase client

**File**: `scripts/collector/supabase.mts`

**Intent**: The collector authenticates with the secret key, which bypasses row-level security — a different posture from all three clients under `src/utils/supabase/`, none of which may ever hold this key. Keeping the factory beside the collector, outside `src/`, makes it unreachable from a Server Component by import.

**Contract**: `createClient` from `@supabase/supabase-js`, not `@supabase/ssr` (which exists for cookie-bearing sessions), reading `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`, with session persistence off since there is no session to keep. It must not live under `src/utils/supabase/`, and nothing in `src/` may import it.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0 — the collector is now inside ESLint's scope under `--max-warnings 0`
- `npm run format:check` exits 0 — `scripts/` is not in `.prettierignore`
- `npm run build` completes — `next build` type-checks the whole `tsconfig` project, so a collector type error would otherwise surface as a failed production deploy
- The content hash of `scripts/collector/feeds.json` equals that of `_incoming/cron-collector/feeds.json`
- `npm run collect` against the hosted project completes and exits 0, and `select count(*) from collected_posts` is greater than 0
- A second consecutive `npm run collect` reports 0 new entries and leaves the row count unchanged

#### Manual Verification:

- The run summary's "new entries" figure matches the row-count delta, confirming that `ignoreDuplicates` plus `.select('id')` returns only inserted rows for a mixed batch — the case the client's own tests do not cover
- With `SUPABASE_SECRET_KEY` temporarily unset, `npm run collect` fails naming that variable, before any feed is fetched
- With every feed URL temporarily pointed at an unreachable host, the run exits non-zero
- Nothing under `src/` imports from `scripts/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Backfill and the workflow

### Overview

Add the import command, rehearse it on the staged snapshot, and put the collector on its schedule in this repository. At the end of this phase both collectors are running and nothing has been switched off.

### Changes Required:

#### 1. The import script

**File**: `scripts/collector/import-jsonl.mts`

**Intent**: Load a JSONL export produced by the old collector into `collected_posts`. It is a repeatable command rather than a one-off because the cutover runs it twice — once as a rehearsal on the staged snapshot, once on a fresh export taken after the old cron's last run.

**Contract**: takes the file path as its single argument. Reads line by line; blank and unparseable lines are skipped and counted, as the original loader did. Rows go through the same mapping and the same chunked `upsert(..., { ignoreDuplicates: true })` path as the collector, so an id already present is a no-op. Prints lines read, rows inserted and lines skipped. Exposed as `npm run collect:import -- <path>`. The `.jsonl` file itself is never committed.

#### 2. The collector workflow

**File**: `.github/workflows/collect.yml`

**Intent**: Run the collector on its four-hourly schedule from this repository. The staged workflow's commit-and-push step goes away with the file it was pushing — and with it the problem that each such push would have triggered `verify` plus a production deploy six times a day, since no `paths-ignore` pattern in `ci.yml` covers a data file.

**Contract**:

- `cron: '7 */4 * * *'` and `workflow_dispatch`, unchanged from the staged workflow.
- `permissions: contents: read` — the write permission existed only for the push step.
- `node-version-file: .nvmrc` rather than the staged `node-version: 22`, matching both CI jobs and this repository's Node 24 pin. On Node 22, native type stripping would need `--experimental-strip-types`.
- `concurrency: group: collect`, a different group from `ci.yml`'s `${{ github.workflow }}-${{ github.ref }}`, so the two workflows never cancel each other.
- `npm ci`, then `npm run collect`, with `SUPABASE_SECRET_KEY` from repository secrets and `NEXT_PUBLIC_SUPABASE_URL` from a repository variable, both supplied through `env:` rather than on a command line — the pattern `ci.yml:70-74` already uses for the Vercel token.
- No `git` configuration, no commit step, no data file.

#### 3. Create the GitHub secret and variable

**Intent**: `context/foundation/lessons.md` requires the pipeline's own command to have been run against a credential locally before it reaches CI. Phase 2 did exactly that with `npm run collect`, so the secret can now be created knowing the value works against the real command.

**Contract**: human-only. Repository secret `SUPABASE_SECRET_KEY` holding the value proven in Phase 2, and repository variable `NEXT_PUBLIC_SUPABASE_URL` (public — it is already inlined into the browser bundle). Record beside the secret that the collector needs this project-level key because it bypasses row-level security, so the next rotation does not repeat the diagnosis. The value is typed into GitHub by the human and appears in no conversation, no file and no workflow log.

#### 4. Rehearse the import

**Intent**: Load the staged 659-row snapshot as a rehearsal of the cutover's real import. It is four days stale by design, and loading it early is safe precisely because the ids make it idempotent — Phase 4's fresh export re-imports it as a no-op for everything already present.

**Contract**: `npm run collect:import -- _incoming/cron-collector/data/raw.jsonl`. Expected: 659 lines read, 0 unparseable, and rows inserted equal to 659 minus whatever Phase 2's live runs already collected. A second invocation must insert nothing.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm run build` all pass with the new scripts present
- `npm run collect:import -- _incoming/cron-collector/data/raw.jsonl` reports 659 lines read and 0 unparseable
- A second run of the same command reports 0 rows inserted
- `select count(*) from collected_posts` is at least 659
- `select count(distinct source) from collected_posts` returns 15
- `select count(*) from collected_posts where processed_at is not null` returns 0 — neither script writes that column

#### Manual Verification:

- A `workflow_dispatch` run of `collect` finishes green, its log shows rows written, and no credential value is visible anywhere in it
- `.github/workflows/collect.yml` contains no `git` command and no `contents: write`
- A `collect` run and a CI run overlapping in time neither cancel each other

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Cutover

### Overview

Switch collection from the old repository to this one without a gap. Human-coordinated across two repositories; the only phase whose success criteria depend on a window of real time passing.

### Changes Required:

#### 1. Let both collectors run

**Intent**: The old cron is still live. Running the new workflow alongside it costs nothing and loses nothing — the id hash encodes the feed, so both produce identical ids for the same entry, and the two write to different places. The overlap is what removes the gap the roadmap names as this change's second risk.

**Contract**: no repository change. Observe at least two scheduled `collect` runs in this repository writing rows before anything is switched off.

#### 2. Final export and import

**Intent**: Bring across everything the old collector gathered between the staged snapshot and its last run. These feeds retain roughly two days, so anything in neither system by then is unrecoverable.

**Contract**: human-run, strictly in this order — wait for the old cron's last scheduled run to finish, export its current `data/raw.jsonl` from the original repository, then `npm run collect:import -- <path to the fresh export>`. The newest `first_seen_at` in that file must be later than the staged snapshot's `2026-09-18T04:35:36.450Z`; if it is not, the wrong file was exported.

#### 3. Disable the old cron

**Intent**: Only after the fresh export has been imported, so no window exists in which neither collector is running.

**Contract**: human-run in the original repository — disable the `collect` workflow's schedule. No change here.

#### 4. Retire the staging copy

**File**: `_incoming/README.md`

**Intent**: Remove the second copy of the collector so nobody edits the one that no longer runs. `_incoming/` is gitignored, so this is a working-tree action rather than a commit.

**Contract**: delete `_incoming/cron-collector/` once the row counts are confirmed, keeping the fresh export outside the repository. `_incoming/README.md` records that the collector now lives at `scripts/collector/`.

#### 5. Correct the roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: F-01 still shows `in-progress` in both the `## At a glance` row and the item body although it closed with commit `2665942`. Open question 8 — whether the old collector was still running — was answered during research and the answer belongs on the record.

**Contract**: F-01's `Status` set to `done` in both places. Open question 8 records that the old collector ran throughout, so no collection days were lost. F-02's own status is moved by the planning and implementation skills, not by hand here.

### Success Criteria:

#### Automated Verification:

- `select count(*) from collected_posts` after the final import is at least the fresh export's line count
- `select max(first_seen_at) from collected_posts` is later than `2026-09-18T04:35:36.450Z` and within one cron interval of now
- `select count(distinct source) from collected_posts` is still 15
- Re-running `npm run collect:import` on the same export reports 0 rows inserted
- `npm run db:status` shows no drift

#### Manual Verification:

- Two consecutive scheduled `collect` runs in this repository have finished green, each writing rows or reporting 0 new against a plausible feed count
- The old repository's schedule is disabled, and its final run is accounted for in the imported export
- `_incoming/cron-collector/` is gone and `_incoming/README.md` points at `scripts/collector/`
- The roadmap no longer shows F-01 as in-progress, and open question 8 carries its answer

---

## Testing Strategy

This repository has no test runner and no tests, and this change does not add one. Verification is the three existing gates plus direct queries against the table.

### Unit Tests:

None. The port separates the `(feed, item)` to row mapping into a pure function so that it becomes testable the day a runner arrives — `context/foundation/lessons.md` asks for that separation before tests exist, precisely so adding them later is not a rewrite.

### Integration Tests:

None automated. The equivalents are run by hand and listed per phase: a local `npm run collect` writing rows, the same command run twice reporting 0 new the second time, and the import reporting 0 inserted on a repeat.

### Manual Testing Steps:

1. Run `npm run collect` locally, note the row count before and after, and check that the summary's "new entries" matches the delta.
2. Run it again immediately; expect 0 new entries and an unchanged row count.
3. Unset `SUPABASE_SECRET_KEY` and run again; expect a failure naming the variable before any feed is fetched.
4. Point every feed URL at an unreachable host in a scratch copy of `feeds.json` and run; expect a non-zero exit.
5. Run `npm run collect:import` on the staged snapshot, then again; expect 659 lines read the first time and 0 rows inserted the second.
6. Trigger the workflow with `workflow_dispatch` and read its log for rows written and for any leaked credential.
7. After the cutover, confirm `max(first_seen_at)` keeps advancing across two scheduled runs.

## Performance Considerations

The four-hourly schedule carries over unchanged, and it is tight against the PRD. The non-functional requirement is that a published deal becomes visible within six hours; collection every four hours leaves roughly two for everything downstream, and GitHub Actions' `schedule` can be delayed a good fifteen minutes under load, which eats into that. Nothing is violated today because extraction does not exist yet, but S-01 has to be sized against what is left rather than against six hours. Tightening the cron is a one-line change if that margin proves too thin.

Volume is not a concern at this scale: 659 rows at roughly 1.6 kB each, growing by tens of records per run. Chunks of 500 keep every write under the Data API's default response cap, so the import is two requests and a scheduled run is one.

## Migration Notes

One migration, additive: a nullable `processed_at` on an existing table, with no default and no backfill, so it is compatible in both directions for the length of a rollback window. Nothing deployed reads the table.

The data migration is the import script, and it is idempotent by construction — the primary key is the collector's own hash, so re-running it on the same file, or on an overlapping newer export, inserts only what is missing. That property is what makes the cutover safe, and it is also the thing that breaks catastrophically if a feed identifier or `makeId` changes during the move. There is no rollback for the import: the rows are correct or the hash was wrong, and in the second case the recovery is to delete by `source` and re-import, not to revert a migration.

## References

- Research: `context/changes/collector-into-repo-and-database/research.md`
- Inherited contract — the nine column names and `on conflict (id) do nothing`: `context/changes/schema-migrations-and-rls-baseline/plan.md:145`, `:270`
- Table and posture: `supabase/migrations/20260921133305_create_collected_posts.sql:4-20`
- Source collector: `_incoming/cron-collector/src/collect.ts:79-81` (hash), `:52-77` (the dedupe that does not port), `:155-179` (the exit code)
- Staged workflow this one replaces: `_incoming/cron-collector/.github/workflows/collect.yml`
- Pipeline pattern for secrets via `env:`: `.github/workflows/ci.yml:70-74`
- Gate scope: `tsconfig.json:26-33`, `.prettierignore:10`, `eslint.config.mjs:13-19`
- Roadmap item F-02: `context/foundation/roadmap.md:106-117`
- Rules applied: `context/foundation/lessons.md` (separation of logic from I/O; proving a credential before CI; a gate that exits 0 is not a gate)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The processing column and a proven credential

#### Automated

- [x] 1.1 `npm run db:push -- --dry-run` lists exactly one pending migration — a3e3064
- [x] 1.2 `npm run db:status` after `npm run db:push` shows no drift between the repository and the hosted project — a3e3064
- [x] 1.3 `npm run db:check` exits 0 — a3e3064
- [x] 1.4 The `information_schema.columns` query for `collected_posts` returns ten columns, with `processed_at` nullable and `timestamp with time zone` — a3e3064

#### Manual

- [x] 1.5 `CLAUDE.md`'s migrations section distinguishes schema writes from row writes and names the workflow and secret that perform the latter — a3e3064
- [x] 1.6 `.env.example` no longer describes `DATABASE_URL` as a collector write path — a3e3064
- [x] 1.7 `SUPABASE_SECRET_KEY` exists in the Supabase dashboard and in local `.env.local`, and its value has not appeared in this conversation or in any tracked file — a3e3064

### Phase 2: The collector in the repository, writing to the database

#### Automated

- [x] 2.1 `npm run lint` exits 0 with the collector inside ESLint's scope — 66d420d
- [x] 2.2 `npm run format:check` exits 0 — 66d420d
- [x] 2.3 `npm run build` completes — 66d420d
- [x] 2.4 The content hash of `scripts/collector/feeds.json` equals that of `_incoming/cron-collector/feeds.json` — 66d420d
- [x] 2.5 `npm run collect` completes, exits 0, and the row count is greater than 0 — 66d420d
- [x] 2.6 A second consecutive `npm run collect` reports 0 new entries and leaves the row count unchanged — 66d420d

#### Manual

- [x] 2.7 The run summary's "new entries" figure matches the row-count delta for a mixed batch — 66d420d
- [x] 2.8 With `SUPABASE_SECRET_KEY` unset, `npm run collect` fails naming that variable before any feed is fetched — 66d420d
- [x] 2.9 With every feed URL unreachable, the run exits non-zero — 66d420d
- [x] 2.10 Nothing under `src/` imports from `scripts/` — 66d420d

### Phase 3: Backfill and the workflow

#### Automated

- [x] 3.1 `npm run lint`, `npm run format:check` and `npm run build` all pass with the new scripts present — 0971a9a
- [x] 3.2 The import of the staged snapshot reports 659 lines read and 0 unparseable — 0971a9a
- [x] 3.3 A second run of the same import reports 0 rows inserted — 0971a9a
- [x] 3.4 `select count(*) from collected_posts` is at least 659 — 0971a9a
- [x] 3.5 `select count(distinct source) from collected_posts` returns 15 — 0971a9a
- [x] 3.6 `select count(*) from collected_posts where processed_at is not null` returns 0 — 0971a9a

#### Manual

- [x] 3.7 A `workflow_dispatch` run of `collect` finishes green with rows written and no credential visible in the log — 0971a9a
- [x] 3.8 `.github/workflows/collect.yml` contains no `git` command and no `contents: write` — 0971a9a
- [x] 3.9 A `collect` run and a CI run overlapping in time neither cancel each other — 0971a9a

### Phase 4: Cutover

#### Automated

- [x] 4.1 `select count(*) from collected_posts` after the final import is at least the fresh export's line count — 1253612
- [x] 4.2 `select max(first_seen_at) from collected_posts` is later than `2026-09-18T04:35:36.450Z` and within one cron interval of now — 1253612
- [x] 4.3 `select count(distinct source) from collected_posts` is still 15 — 1253612
- [x] 4.4 Re-running the import on the same export reports 0 rows inserted — 1253612
- [x] 4.5 `npm run db:status` shows no drift — 9d20837

#### Manual

- [x] 4.6 Two consecutive scheduled `collect` runs have finished green, each writing rows or reporting 0 new against a plausible feed count — 1253612
- [x] 4.7 The old repository's schedule is disabled and its final run is accounted for in the imported export — 1253612
- [x] 4.8 `_incoming/cron-collector/` is gone and `_incoming/README.md` points at `scripts/collector/` — 1253612
- [x] 4.9 The roadmap no longer shows F-01 as in-progress, and open question 8 carries its answer — 9d20837
