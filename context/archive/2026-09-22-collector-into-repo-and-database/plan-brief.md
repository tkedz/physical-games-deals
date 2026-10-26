# Collector into the repository and into the database — Plan Brief

> Full plan: `context/changes/collector-into-repo-and-database/plan.md`
> Research: `context/changes/collector-into-repo-and-database/research.md`

## What & Why

Roadmap item F-02. The RSS collector moves out of the gitignored `_incoming/cron-collector/` staging directory into this repository, writes collected posts into `public.collected_posts` instead of appending them to a JSON file, and runs on its existing four-hourly schedule from this repository's GitHub Actions. The 659 posts gathered so far come with it. Nothing downstream can exist until collected posts are queryable — S-01 has nothing to extract deals from otherwise — and the collector currently runs from a repository that is not this one, against a file nobody else can read.

## Starting Point

`public.collected_posts` already exists, created by F-01 as a field-for-field mirror of the collector's nine-key record, locked by default and with its column names declared a contract that this change's loader is written against. The collector itself is a single 179-line file with one dependency, still running in its original repository, whose staged snapshot here is four days stale. `SUPABASE_SECRET_KEY` has not been created. Nothing in `src/` touches the table.

## Desired End State

The collector runs from `scripts/collector/` on GitHub Actions every four hours, writing rows with the secret key and going red when no feed succeeds. Everything the old collector ever gathered is in the table, and the old cron is off with no gap between the two. `collected_posts` carries a `processed_at` column so the extractor that comes next can tell what it has already read and work through a backlog. `CLAUDE.md` says plainly which database writes may come from a workflow and which may not.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Write path | Data API with `SUPABASE_SECRET_KEY` | `@supabase/supabase-js` is already a dependency, the migration's own comment names this as the write path, and the alternative would put the database password into CI. | Plan |
| Credential rule | `CLAUDE.md` amended to schema-vs-rows | The rule was written about `db push` but reads absolutely, so the distinction it means is made explicit where the rule lives rather than left to be quoted against the collector later. | Plan |
| Deduplication | The table's primary key, via `ignoreDuplicates` | `loadExistingIds()` becomes a `select` capped at 1,000 rows against a table starting at 659, and the truncation is silent. | Research |
| Run failure | Red only when no feed succeeds | Single-feed timeouts are routine here, and a workflow that is red most mornings is one nobody reads — the same blindness by another route. | Plan |
| Cutover | Overlap, then a final re-export and import | The id hash encodes the feed, so both collectors produce identical ids and re-importing is a no-op; the overlap removes the gap against feeds that retain two days. | Plan |
| Location | `scripts/collector/`, `ci.yml` untouched | Puts the collector inside lint, Prettier and the `next build` type-check while keeping it unimportable from `src/`; the cost is a redundant deploy on collector-only commits. | Plan |
| Schema | One migration adding `processed_at`, nothing else | Gives the extractor a backlog query for the case where the model is unavailable at collection time; no run table and no index, because nothing reads either yet. | Plan |
| Poison entries | `processed_at is null` plus the age of `first_seen_at` | A seven-day staleness cut-off needs no attempts counter and no extra column. | Plan |
| Backfill | A separate import script, `.jsonl` uncommitted | The cutover runs the import twice, so it has to be a repeatable reviewable command rather than a one-off; the database is the record, not a megabyte of data in git. | Plan |
| Port scope | Transport, exit code and targeted hardening | `makeId` and the feed identifiers stay byte-identical because every idempotence property in this plan rests on them; everything else may be tidied. | Plan |

Two options were considered and rejected. **A dedicated insert-only Postgres role** would have preserved the credential rule without amending it, but the Data API cannot authenticate as a custom role, so it would have forced the `DATABASE_URL` write path and a new dependency with it. **An ingestion-run table** was raised by `infrastructure.md`, whose reasoning is Vercel's one-hour runtime log retention — but the collector runs on GitHub Actions, whose logs are retained far longer, and what matters operationally is whether rows landed, which the table already answers.

## Scope

**In scope:** one additive migration adding `processed_at`; the collector ported to `scripts/collector/` as `.mts` with database-side deduplication and a meaningful exit code; its own Supabase client on the secret key, outside `src/`; `feeds.json` copied byte-for-byte; `rss-parser` as the one added dependency; a repeatable JSONL import script; `.github/workflows/collect.yml`; the `SUPABASE_SECRET_KEY` secret and `NEXT_PUBLIC_SUPABASE_URL` variable in GitHub; the credential-rule amendment in `CLAUDE.md` and the `DATABASE_URL` correction in `.env.example`; the live cutover; F-01's stale roadmap status.

**Out of scope:** any extraction, parsing or normalisation; deduplication across feeds; an ingestion-run table; any index; an attempts counter or status enum; a `DATABASE_URL` write path or new database driver; a dedicated Postgres role; changes to the four-hourly schedule; changes to `ci.yml`; committing any data file; a test runner.

## Architecture / Approach

Feeds are fetched by `rss-parser` exactly as today, a pure function maps each `(feed, item)` pair to a row, and the rows go to `public.collected_posts` through `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` in chunks of 500 — which PostgREST renders as `on conflict do nothing`, the semantics F-01 specified. Deduplication therefore stops being application state and becomes a property of the primary key, which is the collector's own `sha1("<feed.id>|<key>")` hash. That single fact is what makes the backfill, the two collectors running side by side, and every re-import safe: the same entry always produces the same id, so writing it twice changes nothing. The import script shares the mapping and the write path, so the backfill and the four-hourly run cannot drift apart.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. The processing column and a proven credential | `processed_at` applied, the secret key created locally, the `CLAUDE.md` rule and `.env.example` corrected | The credential is created but unproven until Phase 2; putting it into CI before that is what `lessons.md` warns costs two CI runs to diagnose. |
| 2. The collector in the repository, writing to the database | The port, running locally against the hosted project and passing all three gates | A drifted feed identifier or hash re-duplicates every past entry, and it is silent until the row count doubles — hence verification by content hash rather than by reading. |
| 3. Backfill and the workflow | The import script, the staged snapshot loaded as a rehearsal, the workflow green on `workflow_dispatch` | The `ignoreDuplicates` response contract is established for a single conflicting row but not for a mixed batch; Phase 2 verifies it against the real table before this phase depends on it. |
| 4. Cutover | Collection running from this repository alone, with everything imported | Ordering: exporting before the old cron's last run, or disabling it before the import, opens a window against feeds that retain roughly two days. |

**Prerequisites:** F-01, which is complete. A Supabase dashboard login to create the secret key, admin access to this repository's GitHub secrets, and access to the original collector's repository to export its file and disable its schedule. All four are human actions.

**Estimated effort:** Phases 1–3 are one evening. Phase 4 is a short human-coordinated window, plus the wait for two scheduled runs to land.

## Open Risks & Assumptions

- **The four-hourly cadence leaves roughly two hours for everything downstream** against the PRD's six-hour visibility requirement, and GitHub's `schedule` can be delayed fifteen minutes under load. Nothing is violated today because extraction does not exist, but S-01 must be sized against what is left, not against six hours.
- **The mixed-batch return of `ignoreDuplicates` + `.select('id')`** follows from Postgres `RETURNING` on `on conflict do nothing`, and the client's own test covers only the single-conflict case. Phase 2 verifies it against the real table rather than assuming it; if it returns more than the inserted rows, the run summary's count needs deriving differently and nothing else changes.
- **The fresh export at cutover is taken from a repository outside this plan's reach.** If it is taken before the old cron's last run, those hours are lost with no signal — the check is that its newest `first_seen_at` exceeds the staged snapshot's.
- **A collector-only commit redeploys an identical artifact**, spending a few CPU-minutes against the Hobby four-hour monthly ceiling. Accepted deliberately, because the alternative removes the collector from the gates it was moved into.
- **`@types/node` is at 20.19.43 while Node is pinned at 24.x.** Probes of the APIs the collector uses type-check clean, but the whole source has not been checked against it; `npm run build` in Phase 2 is where that surfaces.

## Success Criteria (Summary)

- Collected posts arrive in the database on their own, every four hours, from this repository — and a run in which nothing arrives is visibly red rather than quietly green.
- Everything the collector has ever gathered is in `collected_posts`, with no duplicates and all 15 sources present, and no collection day was lost to the switch.
- Re-running the collector or the import changes nothing, so recovery from any failure is to run the same command again.
