---
date: 2026-09-22T14:27:02+02:00
researcher: tkedz
git_commit: 907e11252d6e270ac404bce060315202a4170d52
branch: main
repository: 10x-physical-games-deals
topic: "Moving the RSS collector into this repository and making it write to the database (F-02)"
tags: [research, codebase, collector, rss, supabase, github-actions, ingestion]
status: complete
last_updated: 2026-09-22
last_updated_by: tkedz
---

# Research: Moving the RSS collector into this repository and making it write to the database

**Date**: 2026-09-22T14:27:02+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 907e11252d6e270ac404bce060315202a4170d52
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

What does the codebase already fix, and what does it leave open, for change `collector-into-repo-and-database` (roadmap F-02): moving the RSS collector out of the gitignored `_incoming/cron-collector/` staging directory into this repository, importing the posts collected so far, and having the collector write to `public.collected_posts` instead of appending to `data/raw.jsonl`?

## Summary

The destination is further prepared than the source. `public.collected_posts` was created by the previous change as a field-for-field mirror of the collector's record, and its nine column names were declared a contract that this change's loader is written against (`context/changes/schema-migrations-and-rls-baseline/plan.md:145`). Two things are settled about the write: the credential class (the secret key, i.e. `service_role`, which bypasses RLS — `supabase/migrations/20260921133305_create_collected_posts.sql:16-18`) and the SQL semantics (`on conflict (id) do nothing` — `plan.md:270`). The client library is not chosen, and `.env.example` names two mutually exclusive candidates.

Four findings change what the move looks like:

1. **The collector's dedupe strategy does not survive the port unchanged.** It loads every known id into a `Set` before collecting (`_incoming/cron-collector/src/collect.ts:52-77`). Against the Supabase Data API the equivalent `select('id')` is capped at 1,000 rows by default, and the table starts at 659 rows from the backfill alone. Letting Postgres enforce the primary key — `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` — removes the cap from the design entirely.
2. **The collector exits 0 when every feed fails.** `failedFeeds` is counted and printed but never reaches the exit code (`collect.ts:155-158`, `collect.ts:176-179`). A cron run in which all 15 feeds time out is a green run. This is the failure shape `context/foundation/lessons.md:19-24` already names.
3. **Moving the code out of `_incoming/` moves it into two gates and one type-check.** `_incoming/` is excluded from `tsconfig.json:33` and `.prettierignore:10`, but *not* from ESLint — the staged collector is already linted today and passes. A destination such as `scripts/` is inside all three, including the `next build` type-check that runs in the deploy job.
4. **No dependency needs adding to run TypeScript.** Node v24.21.0 executes a `.ts` or `.mts` file directly, no flag and no `tsx`. Only `rss-parser` is genuinely missing from this repository.

The one credential the workflow needs, `SUPABASE_SECRET_KEY`, is **not yet created** in GitHub Secrets — confirmed by the user on 2026-09-22, matching `context/deployment/deploy-plan.md:83`. The old collector **is still running** in its original repository (user, 2026-09-22), which answers roadmap open question 8 (`context/foundation/roadmap.md:210`): no collection days are being lost, so the risk moves from a gap to a cutover ordering problem, and the staged snapshot is stale by design.

## Detailed Findings

### The collector as it stands

Single file, 179 lines, one runtime dependency (`rss-parser`), no build step (`_incoming/cron-collector/package.json:15-21`). Its shape, measured against the staged snapshot of `data/raw.jsonl` (659 lines, 1,067,785 bytes, file mtime 2026-09-18 10:52 local):

| Property | Value | Source |
| --- | --- | --- |
| Records | 659, of which 0 failed to parse | measured over the staged file |
| Distinct ids | 659 — no collisions in this snapshot | measured |
| Feeds | 15, all `enabled: true` | `_incoming/cron-collector/feeds.json` (15 objects) |
| Newest `first_seen_at` | 2026-09-18T04:35:36.450Z | measured |
| Oldest `published_at` | 2024-12-14T00:30:58.000Z | measured |
| Keys per record | the same 9 in every one of the 659 records | measured; declared at `collect.ts:24-34` |

The id is the leading 16 hex characters of `sha1("<feed.id>|<key>")`, where `<key>` is `item.guid`, falling back to `item.link`, then `item.title` (`collect.ts:79-81`, `collect.ts:127`). Because the feed id is inside the hash, **deduplication is per feed** — the same deal legitimately appears once per feed that carried it, each row with a different `source` (`_incoming/cron-collector/README.md:34-36`).

Paths are resolved relative to the file's own directory (`collect.ts:7-10`), so both `feeds.json` and `data/raw.jsonl` move with the source file or the constants change.

### What the destination table already settles

`supabase/migrations/20260921133305_create_collected_posts.sql:4-14` declares exactly nine columns, matching the nine record keys one-to-one. The previous change states plainly that this is a contract for the present change: "the table name `public.collected_posts` and these nine columns are **load-bearing names** — F-02's loader is written against them" (`plan.md:145`).

Settled and inherited:

- **`id` is `text`, not generated.** It is the collector's own hash, which is what makes the loader idempotent (`migration:25-26`, `plan.md:14`). A database-generated key would destroy that property.
- **`link` is deliberately not unique** (`migration:34-35`, `plan.md:30`).
- **`source` is immutable**, because it feeds the hash (`migration:28-29`; the collector's own warning at `README.md:21`).
- **No policy, RLS on, no grants to `anon`/`authenticated`** (`migration:19-20`). The post-apply catalogue check is recorded in commit `7872252`: "RLS enabled, 0 policies, 0 grants for anon and authenticated; only postgres and service_role remain."
- **No index beyond the primary key**, deferred on purpose so as not to guess this change's access pattern (`plan.md:40`, `plan.md:262`).

Three column comments in the migration are claims about the data. Measured against the 659 staged records, all three hold:

- `categories` "0-30 entries. Always empty for the cenograj feeds" (`migration:37-38`) — observed range is exactly 0 to 30; all 186 rows with an empty array come from `cenograj-pudelkowe-najlepsze` (66) and `cenograj-pudelkowe-nowe` (120), and no row from the other 13 feeds has an empty array. All 1,154 category values in the snapshot are JSON strings, so `text[]` fits this snapshot; `collect.ts:144` types them `unknown[]`, so a non-string category from a future feed is possible and would be rejected by the column type.
- `content` "hard-capped at 4000 characters" (`migration:40-41`) — longest observed is exactly 4000, reached by 3 records.
- `first_seen_at` is collector time, not publication time (`migration:43-44`) — in this snapshot every `published_at` is a parseable ISO timestamp and none is null, though the column and the collector's own type both permit null (`collect.ts:30`).

### The write path: credential settled, library open

Settled: the secret key / `service_role`, which bypasses RLS (`migration:16-18`, `plan.md:39`, `CLAUDE.md`'s "Leave `service_role` alone — that is the server-side write path"). Settled: `on conflict (id) do nothing` semantics (`plan.md:270`, `plan-brief.md:25`).

Open, and this change has to pick: `.env.example:10-13` routes `SUPABASE_SECRET_KEY` to "GitHub Actions secrets (the collector)", while `.env.example:15-17` describes `DATABASE_URL` as "For migrations and **collector writes**". The infrastructure documents consistently assume the secret-key path for the cron (`context/foundation/infrastructure.md:111`, `:145`, `:161`; `deploy-plan.md:83`, `:115`) and none assumes the connection-string path.

The choice interacts with a rule that is stated without qualification. `CLAUDE.md` says "No credential that can write the database belongs in a workflow", in the migrations section and reasoned about `db push`; `deploy-plan.md:83` simultaneously plans `SUPABASE_SECRET_KEY` into GitHub Secrets for this very workflow. The distinction that reconciles them — DDL by a human, DML by the cron — is not written down anywhere inspected (`CLAUDE.md`, `infrastructure.md:101/111/112/145/161`, `deploy-plan.md:83/98/115`). This change is the first time a workflow holds a privileged Supabase credential, so the reading should be made explicit rather than assumed.

`@supabase/supabase-js` is already a dependency and installed at 2.116.0 (declared `^2.109.0`, `package.json:23`). Neither `pg` nor `postgres` is installed.

### Dedupe against a row-capped Data API

`loadExistingIds()` reads the whole JSONL and builds a `Set` of known ids before any feed is fetched (`collect.ts:52-77`); `collect.ts:134` then skips an item whose id is in the set. Ported literally to the Data API, the equivalent is `select('id')` over the whole table.

The Supabase Data API returns **a maximum of 1,000 rows by default** unless the project's API settings are changed or the query is paginated (Supabase JS reference, `select()`; the same default is written into this repo's local config at `supabase/config.toml:18` as `max_rows = 1000`). The table starts at 659 rows from the backfill alone. Growth rate, measured over the staged snapshot by bucketing `first_seen_at` to the hour: nine buckets, the first holding 471 records (the initial sweep) and the other eight holding 6, 30, 21, 15, 33, 60, 11 and 12. Those buckets are a proxy for runs, not a run log — the collector records no run identifier. On that evidence the 1,000-row cap is crossed within days of the backfill, and a truncated `select` is silent: no error, just a short list.

`upsert(rows, { onConflict: 'id', ignoreDuplicates: true })` sidesteps the sweep by letting the primary key decide. Verified in the client's own source and tests: `ignoreDuplicates: true` sends `Prefer: resolution=ignore-duplicates` (`postgrest-js/src/PostgrestQueryBuilder.ts`, `upsert()`), and the test `ignoreDuplicates upsert` shows that upserting a single already-present row returns `data: []` with status 201 while the non-ignoring form returns the merged row. That test covers the single-conflicting-row case only; it does not by itself establish what a mixed batch of new and existing rows returns, which matters if the run summary is derived from the response rather than counted locally.

### Where the code can live, and what that turns on

| Gate | `_incoming/` today | A new `scripts/` or `src/collector/` |
| --- | --- | --- |
| `tsconfig` type-check | excluded (`tsconfig.json:33`) | **included** — `include` is `**/*.ts`, unanchored (`tsconfig.json:26-31`) |
| ESLint (`--max-warnings 0`) | **already linted** — flat config reads no `.gitignore`; verified: `_incoming/cron-collector/src/collect.ts` reports 0 errors, 0 warnings, and `npm run lint` exits 0 today | linted |
| Prettier (`format:check`) | excluded (`.prettierignore:10`) | **included** |

Consequences worth carrying into the plan:

- **`next build` type-checks files the app never imports.** Next 16.3.5's bundled docs state that "Next.js uses the project-local `tsc` CLI by default" and that the CLI "checks the complete project selected by your `tsconfig` file … `next build --debug-build-paths` does not narrow the files that are type checked" (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md:35,39`). The `experimental` label belongs to the option that turns the CLI checker *off*; `useTypeScriptCli.md` states "The CLI checker is enabled by default", and `next.config.ts` here overrides nothing. A type error in the collector would therefore fail `vercel build` in the deploy job. Not observed directly — `next build` was not run.
- **`@typescript-eslint/no-unused-vars` is a warning, and `--max-warnings 0` promotes it to a failure**; `no-explicit-any` and `no-require-imports` are errors. `no-console` is not configured, so the collector's logging is fine as written.
- **`moduleResolution: "bundler"` (`tsconfig.json:11`) rejects relative `.ts` imports** (TS5097) while Node requires the extension. A single-file collector with no relative imports avoids the conflict; otherwise `allowImportingTsExtensions` has to be turned on, which is legal here because `noEmit` is already set.
- **`.jsonl` does not break `format:check`.** `prettier --check .` skips unknown extensions during directory expansion; only an explicit path to a `.jsonl` errors with "No parser could be inferred". Relevant only if collected data is ever committed.

### Running TypeScript without adding a runner

Node v24.21.0 is what `.nvmrc` and `engines.node: "24.x"` pin, and it runs TypeScript directly — verified: both a `.ts` and an `.mts` file with type annotations executed with no flag and no dependency. `tsx` is not installed, not even transitively.

One wrinkle, verified by reproduction: under a `package.json` with no `"type"` field — which is this repository's (`package.json` declares no `type`) — a `.ts` file **containing ESM `import` syntax** runs correctly but prints `MODULE_TYPELESS_PACKAGE_JSON ... Reparsing as ES module` to stderr on every run. The identical file named `.mts` runs clean. A `.ts` file with no import syntax does not warn. The existing collector uses ESM imports (`collect.ts:1-5`), so it would warn as `.ts`; `**/*.mts` is already in `tsconfig.json:31`.

Node 24's strip-only mode rejects `enum`, `namespace` and constructor parameter properties. The current collector uses none of them — only `type` aliases.

### The workflow, and how it meets the existing pipeline

The staged workflow runs `cron: '7 */4 * * *'` (`_incoming/cron-collector/.github/workflows/collect.yml:4-5`, six runs a day) with `permissions: contents: write` (`:8-9`), `node-version: 22` hardcoded (`:23`), and a final step that commits and pushes `data/raw.jsonl` (`:30-43`).

- **The commit-and-push step must not survive the move.** `.github/workflows/ci.yml:24-31` ignores `**/*.md`, `context/**`, `.claude/**`, `.agents/**`, `supabase/**`, `skills-lock.json` and `.10x-cli.json` — no pattern covers a data file, so each cron push to `main` would trigger `verify` plus a **production** deploy, six times a day. Writing to Supabase removes the step and the problem together.
- **A collector-only source change still triggers a full build and deploy**, because neither `scripts/**` nor `.github/**` is in `paths-ignore`. Adding `scripts/**` to escape that would remove the collector from lint, format and the `next build` type-check at once — the gate would vanish exactly where it is needed. Note also `ci.yml:19-20`: the two `paths-ignore` lists are duplicated deliberately (no YAML anchors) and must be edited together.
- **`node-version: 22` should become `node-version-file: .nvmrc`** to match both CI jobs (`ci.yml:58-61`, `:82-86`) and the repository's Node 24 pin. On Node 22, native type stripping needs `--experimental-strip-types`.
- **`concurrency` is keyed on the workflow name** (`ci.yml:43-45`), so a separately named collector workflow will not cancel CI runs.
- Cadence against the PRD: collection every 4 hours against the requirement that a published deal is visible within 6 hours (`context/foundation/prd.md`, Non-Functional Requirements; cited by `roadmap.md:110`). That leaves roughly two hours for everything downstream, and no document inspected acknowledges the margin.

### The backfill, measured

659 rows, 1,067,785 bytes, longest single line 4,726 bytes. `plan.md:260` sized it as "659 rows totalling roughly 1 MB, averaging about 1.6 kB each" — measured average is 1,620 bytes, so that holds.

Every row in the snapshot is well-formed: 0 unparseable lines, 0 duplicate ids, and no null in any of the nine fields, although the schema permits null in `title`, `link`, `published_at` and `content`.

The snapshot is a **stale copy**, not a live file: its newest `first_seen_at` is 2026-09-18T04:35:36.450Z, four days before this research, while the source collector is still running elsewhere (user, 2026-09-22). Whatever it has collected since is not in `_incoming/`.

## Code References

- `_incoming/cron-collector/src/collect.ts:7-10` — paths resolved relative to the source file; they move with it
- `_incoming/cron-collector/src/collect.ts:24-34` — the nine-field record type, mirrored by the table
- `_incoming/cron-collector/src/collect.ts:52-77` — `loadExistingIds()`, the dedupe strategy that does not port unchanged
- `_incoming/cron-collector/src/collect.ts:79-81` — `sha1("<feed.id>|<key>")`, first 16 hex characters
- `_incoming/cron-collector/src/collect.ts:127` — key fallback chain: guid → link → title
- `_incoming/cron-collector/src/collect.ts:155-158` — a failed feed is counted and logged, nothing more
- `_incoming/cron-collector/src/collect.ts:176-179` — the only path that sets a non-zero exit code
- `_incoming/cron-collector/README.md:21` — renaming a feed id re-duplicates every past entry from it
- `_incoming/cron-collector/.github/workflows/collect.yml:4-5,23,30-43` — cron, hardcoded Node 22, commit-and-push step
- `supabase/migrations/20260921133305_create_collected_posts.sql:4-14` — the nine columns
- `supabase/migrations/20260921133305_create_collected_posts.sql:16-20` — the locked posture and the named write path
- `.github/workflows/ci.yml:24-31` — the `paths-ignore` list a data commit would defeat
- `tsconfig.json:26-33` — repo-wide `**/*.ts` include; `_incoming` excluded
- `.prettierignore:10` — `_incoming/` excluded from the format gate
- `eslint.config.mjs:13-19` — `globalIgnores` lists four paths; no `.gitignore` awareness
- `package.json:23` — `@supabase/supabase-js` already a dependency
- `.env.example:10-17` — the two candidate write credentials

## Architecture Insights

- **The table is the interface, and it was designed as one.** The previous change deliberately made the schema a mirror of the producer's record and said so, which turns this change into a transport swap rather than a modelling exercise. The corollary is that changing a column name here breaks a contract that was written down, not merely inferred.
- **Idempotence lives in the id, not in the loader.** Because the hash encodes the feed, re-running is safe at the database level. That is what makes "deduplication behaves as it does today, so re-running changes nothing" (`roadmap.md:108`) achievable by a plain conflict clause instead of application logic — and what makes any re-hash during the move catastrophic rather than merely wasteful.
- **Leaving `_incoming/` is what subjects the code to the project's standards.** The staging directory is outside two of the three gates by explicit configuration. This is the moment the collector starts being held to `--max-warnings 0` and Prettier, and the moment its type errors can fail a production deploy.
- **The collector's error handling was written for a human reading a log, not for an unattended cron.** Per-feed resilience (one bad feed does not abort the run) is right; pairing it with an unconditional exit 0 means the only signal that ingestion has stopped is someone noticing stale data. `context/foundation/lessons.md:19-24` already generalises this: a check that cannot fail is not a check. `infrastructure.md:129` independently asks for run outcomes to be written to a Supabase table, and `infrastructure.md:87` notes Vercel Hobby keeps runtime logs for one hour — so a log is not a record.

## Historical Context (from prior changes)

- `context/changes/schema-migrations-and-rls-baseline/plan.md:38` — "**No data import.** The 659 collected posts stay in `_incoming/cron-collector/data/raw.jsonl`. Loading them is F-02's work, together with moving the collector itself." The backfill was deferred to this change by name.
- `context/changes/schema-migrations-and-rls-baseline/plan.md:145` — the nine column names are load-bearing because this change's loader is written against them.
- `context/changes/schema-migrations-and-rls-baseline/plan.md:270` — the inherited loader contract: `on conflict (id) do nothing`, "which reproduces the collector's own deduplication exactly".
- `context/changes/schema-migrations-and-rls-baseline/plan.md:40,262` — indexes deferred rather than guessed; adding one now is this change's call to justify.
- `context/foundation/roadmap.md:106-117` — F-02's entry: outcome, prerequisite F-01, and the two named risks (feed identifiers changing during the move; the schedule lapsing at cutover, against feeds that retain roughly two days).
- Commit `5c7ea7f` — added `supabase/**` and the tool-owned paths to both `paths-ignore` lists, with the caveat at `ci.yml:7-10` that `supabase/**` is inert "only while nothing under it feeds the Next build".

Three historical claims were checked individually and each gets its own verdict:

- **Supported.** `plan.md:14` — "100 of the 550 distinct links appear under two or three different `source` values". Measured exactly: 550 distinct links, 100 of them repeated, 91 twice and 9 three times.
- **Partly contradicted.** `plan.md:30` — "a unique constraint on `link` would reject 100 of the 659 rows F-02 imports". The rejected count is **109**, not 100: the 100 repeated links span 209 rows, of which 109 are surplus. The figure 100 counts distinct repeated links, not rows. The conclusion it supports — `link` must not be unique — is unaffected and stands.
- **Stale.** `context/foundation/roadmap.md:60` and `:104` still show F-01 as `in-progress`, while `context/changes/schema-migrations-and-rls-baseline/change.md` records `implemented` and the close-out commit `2665942` has landed. Only the status field is stale; F-01's content in the roadmap still matches what was built.

`context/deployment/deploy-plan.md:83` — "`SUPABASE_SECRET_KEY` | GitHub Secrets, **not yet created**" — was confirmed still accurate by the user on 2026-09-22, so it is current, not stale.

## Related Research

None. `context/archive/` holds only its `README.md`, and the preceding change produced no `research.md` — its folder contains exactly `change.md`, `plan-brief.md` and `plan.md`.

## Open Questions

Resolved during this research (recorded here so the plan does not re-ask):

- **Is the old collector still running?** (`roadmap.md:210`, open roadmap question 8) — **Yes**, in its original repository (user, 2026-09-22). No collection days are being lost. The urgency argument changes shape: the risk is now double-running or a gap at cutover, and the staged 659-row snapshot is four days stale and will need re-exporting at the moment of the switch.
- **Is `SUPABASE_SECRET_KEY` in GitHub Secrets?** — **No, not yet created** (user, 2026-09-22), matching `deploy-plan.md:83`. Creating and rotating it is a human-only action (`infrastructure.md:114`), so it has to be sequenced before the workflow can run green.

Left for the plan or the user:

1. **Which write path** — `SUPABASE_SECRET_KEY` through the Data API, or `DATABASE_URL` through a Postgres driver. `.env.example:10-17` names both; every infrastructure document assumes the first; the second would need a dependency this repository does not have. Bound up with question 2.
2. **How `CLAUDE.md`'s "no credential that can write the database belongs in a workflow" is to be read** once a cron workflow holds `SUPABASE_SECRET_KEY`. The DDL/DML distinction is the obvious reconciliation but is written down nowhere inspected; leaving it implicit invites the rule to be quoted against the workflow later.
3. **Whether this change adds a migration of its own.** `roadmap.md:106-117` does not say, and `plan.md:40` deferred indexes specifically so this change could decide. Candidates surfaced but not settled: an index for the extraction step's "not yet processed" query (S-01's access pattern, not this change's), and the ingestion-run table that `infrastructure.md:129` asks for and no roadmap item schedules.
4. **Cutover ordering** — the old cron is live, so the sequence that avoids both a gap and double-collection (freeze, re-export, import, switch) is a plan decision. Feed ids must survive it byte-for-byte (`README.md:21`, `roadmap.md:116`).
5. **Whether a failed run should fail the workflow.** Not a question the sources answer; raised here because the current exit-code behaviour makes total ingestion failure indistinguishable from success.

Evidence deliberately not gathered:

- **The live hosted schema was not queried.** `npm run db:status` and `npm run db:check` need credentials and are human-run; the post-apply state is instead taken from commit `7872252`'s recorded catalogue check. Worth re-running as the first step of implementation, not as research.
- **`next build` was not run**, so the claim that it type-checks an unimported `scripts/collect.ts` rests on Next 16.3.5's bundled documentation plus the resolved `tsc --showConfig` file list, not on an observed build.
- **`rss-parser` is not installed here**, so the real `collect.ts` could not be type-checked against this repository's `tsconfig`. `rss-parser@3` ships CommonJS with its own typings; `moduleResolution: "bundler"` plus `esModuleInterop: true` should handle `import Parser from 'rss-parser'`, but that is reasoned, not observed.
- **`@types/node` is at 20.19.43 while `engines.node` is `24.x`** (`package.json:35`). Probes of `node:fs`, `node:path`, `node:url`, `fetch` and `AbortController` type-checked clean, so it is not a blocker, but the whole collector source was not checked against it.
