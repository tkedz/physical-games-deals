# Schema in repo migrations, with row-level security locked by default — Implementation Plan

## Overview

Put the database schema under version control as Supabase migrations in this repository, applied to the hosted project by hand, and make "row-level security on, no policy" the posture every new table starts from — enforced by a gate that fails rather than by a rule someone has to remember. One first migration proves the path works: a table holding the posts the RSS collector produces.

## Current State Analysis

The database side of this project is entirely unbuilt, and one recorded statement about it is already wrong.

- **No schema, no migrations, no SQL.** `supabase/migrations/` does not exist — not as an empty directory. There is no `.sql` file anywhere in the repository, no seed file, and no generated database types. `context/deployment/deploy-plan.md:114` says "`supabase/migrations/` is empty", which was true of the intent and never of the disk.
- **Nothing reads the database yet.** `src/` is ten files; the only Supabase calls are session plumbing (`src/utils/supabase/session.ts:45`, and the two `createClient()` factories). No route handlers, no server actions, no `.from(` anywhere.
- **The CLI is present and unlinked.** `supabase@2.117.0` is a devDependency, so `npm run` puts `supabase` on PATH; `supabase/.temp/` holds only `cli-latest`, so no project is linked. `supabase/config.toml` is committed and declares `major_version = 17`, with its own warning that this must match the remote.
- **The collector's record shape is fully pinned.** `_incoming/cron-collector/src/collect.ts:24-34` declares nine fields; all 659 rows in `data/raw.jsonl` carry the identical nine-key set. `id` is the first 16 hex characters of `sha1(feed_id|guid)` (`src/collect.ts:79-81`), so deduplication is **per feed** — 100 of the 550 distinct links appear under two or three different `source` values. `content` is HTML hard-capped at 4000 characters; `categories` runs 0–30 strings and is always empty for the two cenograj feeds.
- **Two live traps in `supabase/config.toml`.** `auto_expose_new_tables` is commented out and therefore defaults to `true`, so new `public` tables are reachable by `anon`/`authenticated` without explicit grants (`supabase/config.toml:19-23`). `[db.seed]` is enabled and points at `./seed.sql`, which does not exist (`supabase/config.toml:65-71`).
- **Three constraints already on record.** `vercel rollback` moves traffic only and does not undo a migration, so a migration must stay compatible with the previous deployment for one rollback window (`context/foundation/infrastructure.md:112`). Dropping a table or disabling RLS is a human-only operation (`infrastructure.md:113`). Preview deployments read and write the **production** Supabase project (`infrastructure.md:110`).
- **No test runner exists** and the project instructions forbid claiming otherwise; verification vocabulary is `npm run lint`, `npm run format:check`, `npm run build`, plus the Supabase CLI.

## Desired End State

`supabase/migrations/` exists in the repository and holds one applied migration. The hosted Supabase project contains `public.collected_posts` with row-level security enabled, zero policies, and no privileges granted to `anon` or `authenticated`. `npm run db:check` runs Supabase's security advisor with `--fail-on error` and exits 0; it has been seen to exit non-zero against a deliberately unlocked table, so the gate is a demonstrated control rather than an assumption. The migration workflow — create, dry-run, push, check — is written into `CLAUDE.md` alongside the additive-only rule, and the two documents that describe the schema as absent say what is actually there.

Verify by running `npm run db:status` (local and remote history agree on one migration), `npm run db:check` (exit 0), and the catalogue query in Phase 2, which must return row-level security enabled, zero policies and zero grants.

### Key Discoveries:

- **The CLI ships the gate.** `supabase db advisors --type security --fail-on error` flags RLS-disabled-in-public and exits non-zero — the same shape as the `eslint --max-warnings 0` rule already recorded at `context/foundation/lessons.md:19-23`. Nothing custom needs writing.
- **`supabase db query --linked` runs SQL through the Management API**, so posture checks need no connection string, no Docker, and no access to `.env.local` — which `CLAUDE.md:44-46` forbids by every route.
- **`supabase migration down --linked` exists but is a reset, not a revert** — its own help says "Resets applied migrations up to the last n versions". Objects are recreated empty; data does not come back. It falls squarely under the human-only rule at `infrastructure.md:113`.
- **`link` must not be unique.** Per-feed deduplication (`_incoming/cron-collector/src/collect.ts:127-135`) is deliberate and documented at `_incoming/cron-collector/README.md:34-36`; a unique constraint on `link` would reject 100 of the 659 rows F-02 imports.
- **Feed identifiers are immutable.** `_incoming/cron-collector/README.md:21` warns that renaming a feed id re-duplicates every entry from that feed, because the id feeds the hash. `source` is therefore a stable value, not a rename-safe label.
- **`.prettierignore` excludes `supabase/`, `*.md` and `context/`**, so migration SQL and every document this change touches are outside `npm run format:check`. Only the `package.json` edit is in its scope.

## What We're NOT Doing

- **No local Docker verification.** The roadmap's F-01 outcome names reproduction "on a fresh local database"; this change proves the hosted half only. Docker is installed here but its engine is not running, and the decision was to avoid that dependency. The migration files are in the repository, so local reproduction stays available the day someone starts Docker — it is the *proof* that is deferred, not the capability.
- **No product schema.** No watchlist, no games, no extracted deals, no user-owned tables. The roadmap is explicit that F-01 is "the migration path plus the default posture, not the product's schema" (`context/foundation/roadmap.md:103`). Each later slice brings its own tables and its own policies.
- **No data import.** The 659 collected posts stay in `_incoming/cron-collector/data/raw.jsonl`. Loading them is F-02's work, together with moving the collector itself.
- **No policies on `collected_posts`.** The table is written by the collector with the secret key, which bypasses RLS, and read server-side by a later extraction step. No browser client has any business reading it, so it gets no policy — which is also what makes it the proof that locked-by-default holds.
- **No indexes beyond the primary key.** Additive-only discipline means an index can land in its own migration the day a query needs one. Adding them speculatively now would guess at F-02's and S-01's access patterns.
- **No migrations applied from CI.** Considered and declined this session: automation does not solve the rollback asymmetry, it needs a write credential in CI, and `lessons.md:14-16` requires a credential to be proven against the real command by hand before it reaches CI secrets.
- **No separate Supabase project for previews.** `infrastructure.md:110` records that previews write production and that the fix is a second project. That becomes urgent when user-owned data appears — S-02 — not for a table no deployed code reads. Left as a recorded risk in the brief.
- **No generated TypeScript types.** Nothing in `src/` reads the database, so the file would be generated for a consumer that does not exist and regenerated before first use.
- **No new lesson in `lessons.md`.** That register is `/10x-lesson`'s to write, after this lands.

## Implementation Approach

Three phases, in the order the gate lesson prescribes: establish the baseline, tighten while it is clean, then prove the gate by breaking it once.

Phase 1 links the project and puts the four commands behind npm scripts, so the flags that make the gate a gate cannot be dropped by retyping the command from memory. It also records what the security advisor says about the project *before* any table exists — because a gate adopted against an unknown baseline is one that either blocks something pre-existing or hides it.

Phase 2 adds the one migration. The posture lives in the migration SQL — `enable row level security` plus an explicit `revoke` — rather than in `supabase/config.toml`, because config settings govern the local stack while the SQL governs wherever it is applied. Verification is a direct catalogue query, not an inference from the advisor passing.

Phase 3 creates an unlocked table on purpose, watches `npm run db:check` fail on it, removes it, and then writes the runbook. The documentation is deliberately last, so what gets written is what actually happened.

## Critical Implementation Details

**Leave `auto_expose_new_tables` alone.** Setting it to `false` looks like defence in depth and is the opposite. It governs only the local stack, so a table whose `revoke` was forgotten would be inaccessible locally and exposed on the hosted project — the config flag would hide, on the machine where mistakes are cheap, exactly the mistake that ships. The explicit `revoke` in the migration behaves identically in both places; that is why it carries the posture.

**The Phase 3 probe must not go through migration history.** Create and drop it with `supabase db query --linked`, never with `supabase migration new`. A probe in the migrations directory would be replayed on every future fresh database, and a probe recorded in the remote history table would have to be repaired out of it. The cost of doing it this way is that the remote schema diverges from the repository for the minutes the probe exists — which is why the drop belongs in the same sitting, not the next one.

**Ordering is load-bearing.** Linking precedes everything, the advisor baseline precedes the first table, and within Phase 3 the deliberate violation precedes the clean re-run. Running the baseline after the table exists would make a pre-existing finding and a self-inflicted one indistinguishable.

**`supabase db push` will ask for the database password.** The implementer must not go looking for it: `CLAUDE.md:44-46` forbids reading `.env.local` by the Read tool, by `cat`, through an interpreter, or by any other route. The human types it, or the CLI has it cached from `supabase link`.

**Two of the three phases trigger a production deployment.** `.github/workflows/ci.yml:7-12` ignores `**/*.md`, `context/**` and `.claude/**` — so the `package.json` edit in Phase 1 and the migration in Phase 2 both run `verify` and then `deploy` on merge to `main`, deploying unchanged application code. Harmless, but not a surprise worth discovering live. Phase 3 touches only Markdown and `context/`, so it runs no CI at all.

**If the remote Postgres major version is not 17**, update `supabase/config.toml` to match what `show server_version;` reports. The remote is authoritative; upgrading a live project is not this change's business.

**If the advisor baseline in Phase 1 is not clean**, record each pre-existing finding verbatim in the phase commit message before proceeding, and narrow the gate by scope rather than by loosening `--fail-on` — a gate relaxed to `warn` is the failure `lessons.md:19-23` describes.

## Phase 1: Migration path and the posture gate

### Overview

Link the hosted project, confirm the local configuration matches it, put the four CLI commands behind npm scripts that carry their flags, settle the seed configuration, and record the security advisor's verdict on the schema as it stands — empty.

### Changes Required:

#### 1. Link the hosted Supabase project

**File**: none tracked — `supabase/.temp/project-ref` is written by the CLI and is gitignored (`supabase/.gitignore:3`)

**Intent**: Give the CLI an identity to talk to, so every `--linked` command in this plan has a target. This is a human step: `supabase login` opens a browser flow and `supabase link` asks for the project reference and the database password.

**Contract**: `npx supabase login`, then `npx supabase link --project-ref <ref>`. After it, `npx supabase projects list` shows the project marked as linked. No repository file changes.

#### 2. npm scripts for the database commands

**File**: `package.json`

**Intent**: Bind each CLI command to its flags once, so the gate cannot be run toothless by someone retyping it without `--fail-on error`. `npm run *` is already allowlisted in `.claude/settings.json:4`, and extra arguments pass through after `--`, so no wrapper script or second variant is needed.

**Contract**: four entries in `scripts`, each invoking the devDependency binary directly:

```json
"db:new": "supabase migration new",
"db:push": "supabase db push --linked",
"db:status": "supabase migration list --linked",
"db:check": "supabase db advisors --linked --type security --fail-on error"
```

`db:status` is the fourth beyond the three agreed during planning: it is the drift check that the human-run apply path needs, and it costs one line.

#### 3. Seed configuration

**File**: `supabase/config.toml`

**Intent**: `[db.seed]` is enabled and points at a `./seed.sql` that does not exist, so the first `supabase db reset` anyone runs fails on a file nobody decided to omit. Turn seeding off explicitly and say why, rather than committing an empty file that implies seed data is coming.

**Contract**: `[db.seed] enabled = false`, with a comment recording that this project has no seed data and that `db push --include-seed` is the opt-in if that changes. Leave `auto_expose_new_tables` commented out — see Critical Implementation Details.

### Success Criteria:

#### Automated Verification:

- Migration history is reachable and reports no applied migrations: `npm run db:status`
- Security advisor baseline is clean: `npm run db:check` exits 0
- Linting passes: `npm run lint`
- Formatting passes: `npm run format:check`

#### Manual Verification:

- Remote Postgres major version matches `major_version = 17` in `supabase/config.toml`, checked with `npx supabase db query --linked "show server_version;"`
- Any pre-existing advisor finding is recorded verbatim in the phase commit message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: First migration — collected_posts, locked by default

### Overview

Add the one migration that proves the path: a table mirroring the collector's record, row-level security on, no policy, grants revoked. Apply it with a dry run first, then confirm the posture by reading the catalogue rather than by trusting the advisor's silence.

### Changes Required:

#### 1. The collected-posts migration

**File**: `supabase/migrations/<timestamp>_create_collected_posts.sql`, generated by `npm run db:new -- create_collected_posts`

**Intent**: Create the table that F-02 will write collected RSS posts into, as a field-for-field mirror of the collector's JSON record, and lock it by default. The column set is the contract between this migration and F-02's loader; the posture statements are the template every later migration copies.

**Contract**: the table name `public.collected_posts` and these nine columns are load-bearing names — F-02's loader is written against them. The two posture statements and the header comment are the pattern later migrations repeat:

```sql
-- Revert: drop table public.collected_posts;
-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.

create table public.collected_posts (
  id            text        primary key,
  source        text        not null,
  platform_hint text        not null,
  title         text,
  link          text,
  published_at  timestamptz,
  categories    text[]      not null default '{}',
  content       text,
  first_seen_at timestamptz not null
);

alter table public.collected_posts enable row level security;
revoke all on table public.collected_posts from anon, authenticated;
```

Add `comment on` statements for the facts a reader cannot infer from the types: that `id` is the leading 16 hex characters of `sha1(feed_id|guid)` and therefore already encodes the feed; that `link` is deliberately not unique because deduplication is per feed; that `content` arrives HTML and truncated at 4000 characters by the collector; and that `first_seen_at` is when the collector saw the post, not when it was published. Nullability follows the collector's own type (`_incoming/cron-collector/src/collect.ts:24-34`) rather than what today's 659 rows happen to contain.

### Success Criteria:

#### Automated Verification:

- Dry run lists the new migration and nothing else: `npm run db:push -- --dry-run`
- Migration applies to the linked project: `npm run db:push`
- Local and remote migration history agree on one applied version: `npm run db:status`
- Security advisor still exits 0 with the table present: `npm run db:check`
- Catalogue query returns row-level security enabled, zero policies and zero grants for `anon` and `authenticated`, via `npx supabase db query --linked` against `pg_class.relrowsecurity`, `pg_policies` and `information_schema.role_table_grants`
- Formatting passes: `npm run format:check`

#### Manual Verification:

- The table's columns in Supabase Studio match the collector's nine fields one-for-one, in name and nullability

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Prove the gate and record the runbook

### Overview

Break the gate on purpose, confirm it fails, remove the breakage, then write down the workflow that now exists. The violation comes first; the clean re-run afterwards is what shows the gate distinguishes the two states rather than always passing.

### Changes Required:

#### 1. Deliberate gate violation

**File**: none — executed through the Management API, never committed

**Intent**: Prove the gate is a control and not an assumption, which is what `context/foundation/lessons.md:21-23` requires of any gate before it is trusted. The repository has done this once before, for the CI gate, in commits `85e0624` → `dffa739`.

**Contract**: `npx supabase db query --linked "create table public._rls_gate_probe (id int);"`, then `npm run db:check` — which must exit non-zero and name `rls_disabled_in_public`. Then `npx supabase db query --linked "drop table public._rls_gate_probe;"`. This is a destructive Supabase operation under `infrastructure.md:113`, so the human runs it, in one sitting, and `npm run db:status` afterwards must show the migration history untouched.

#### 2. Migration runbook

**File**: `CLAUDE.md`

**Intent**: Put the loop where an agent or a person will actually find it six weeks from now, rather than in a plan nobody reopens. Record the four commands, the locked-by-default template, the additive-only rule, and the fact that migrations are applied by hand.

**Contract**: a new section covering — the command sequence (`db:new` → `db:push -- --dry-run` → `db:push` → `db:check`); that every new table ships `enable row level security` plus `revoke all ... from anon, authenticated` and no policy unless one is deliberately justified; that migrations are additive, with any destructive half deferred to a later migration once the previous deployment is no longer a rollback target; that each migration opens with a `-- Revert:` line and a backward-compatibility statement; and that `supabase db push` is run by a human, never by CI.

#### 3. Correct the records that call the schema absent

**File**: `context/deployment/deploy-plan.md`, `context/foundation/infrastructure.md`

**Intent**: `deploy-plan.md:114` states `supabase/migrations/` is empty and no schema exists; both halves are now wrong. `infrastructure.md` describes the operational story without saying how schema reaches the database.

**Contract**: in `deploy-plan.md`, replace the stale line with what is true — migrations live in `supabase/migrations/`, applied by a human with `npm run db:push`, gated by `npm run db:check`. In `infrastructure.md`, add the migration apply step to the operational/setup material only. Its Platform Comparison, Anti-Bias Cross-Check and Risk Register are append-only (`infrastructure.md:27-29`) and must not be rewritten.

### Success Criteria:

#### Automated Verification:

- Security advisor is clean again once the probe is removed: `npm run db:check` exits 0
- Linting passes: `npm run lint`
- Formatting passes: `npm run format:check`

#### Manual Verification:

- With the probe table present, `npm run db:check` exits non-zero and names `rls_disabled_in_public`
- The probe table is dropped, confirmed absent, and `npm run db:status` shows the migration history unchanged by it
- The `CLAUDE.md` runbook is sufficient to run the whole loop from a clean checkout without opening this plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

There is no test runner in this repository and this change does not add one (`CLAUDE.md:35`). Nothing below should be described as a test suite.

### Unit Tests:

None. There is no application code in this change — the deliverable is SQL, configuration and documentation.

### Integration Tests:

None. The equivalent assurance comes from the catalogue query in Phase 2, which reads the three facts that define the posture (`relrowsecurity`, policy count, grant count) directly from the database rather than inferring them.

### Manual Testing Steps:

1. Run `npm run db:status` and confirm local and remote history agree on exactly one applied migration.
2. Run `npm run db:check` and confirm exit code 0.
3. Create the probe table, run `npm run db:check`, and confirm it exits non-zero naming `rls_disabled_in_public`.
4. Drop the probe table, re-run `npm run db:check`, and confirm exit code 0 again.
5. Open `public.collected_posts` in Supabase Studio and compare its nine columns against `_incoming/cron-collector/src/collect.ts:24-34`.

## Performance Considerations

None bind at this size. The table starts empty and F-02 imports 659 rows totalling roughly 1 MB, averaging about 1.6 kB each with `content` hard-capped at 4000 characters by the collector. The set grows with time rather than with users — the PRD leaves the volume undeclared (open question 4) and the roadmap records the same at `context/foundation/roadmap.md:102`.

No non-primary-key index ships here, deliberately. The primary key carries the only access pattern this change creates — F-02's `on conflict (id) do nothing`. Indexes for the queries S-01 will run are additive and belong in the migration that introduces those queries, where the access pattern is known rather than guessed.

## Migration Notes

This migration is purely additive and therefore compatible with the previous deployment by construction: it creates a table no deployed code reads. That satisfies the one-rollback-window requirement at `infrastructure.md:112` trivially, which is exactly why it is a good first migration.

From here the rule is expand/contract. A change that removes or narrows anything — dropping a column, adding `not null` to an existing one, renaming — splits in two: the additive half now, the destructive half in a later migration, once the deployment that needed the old shape is no longer a rollback target. `supabase migration down --linked` is not an escape from this; it resets rather than reverts, and it takes the data with it.

F-02 inherits the column contract above and loads with `on conflict (id) do nothing`, which reproduces the collector's own deduplication exactly (`_incoming/cron-collector/src/collect.ts:127-135`). Because deduplication is per feed, the same deal legitimately appears under several `source` values; any cross-feed merge is downstream work and not a constraint on this table.

## References

- Roadmap item: `context/foundation/roadmap.md:92-104` (F-01)
- Change identity: `context/changes/schema-migrations-and-rls-baseline/change.md`
- Gate lesson: `context/foundation/lessons.md:19-23`
- Credential lesson: `context/foundation/lessons.md:12-17`
- Infrastructure constraints: `context/foundation/infrastructure.md:110-114`
- Stale schema record to correct: `context/deployment/deploy-plan.md:114`
- Collector record shape: `_incoming/cron-collector/src/collect.ts:24-34`
- Collector deduplication: `_incoming/cron-collector/src/collect.ts:79-81`, `:127-135`
- Feed identifier warning: `_incoming/cron-collector/README.md:21`
- CI path filters: `.github/workflows/ci.yml:7-12`
- Supabase config traps: `supabase/config.toml:19-23`, `:65-71`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration path and the posture gate

#### Automated

- [ ] 1.1 Migration history is reachable and reports no applied migrations: `npm run db:status`
- [ ] 1.2 Security advisor baseline is clean: `npm run db:check` exits 0
- [ ] 1.3 Linting passes: `npm run lint`
- [ ] 1.4 Formatting passes: `npm run format:check`

#### Manual

- [ ] 1.5 Remote Postgres major version matches `major_version = 17` in `supabase/config.toml`, checked with `npx supabase db query --linked "show server_version;"`
- [ ] 1.6 Any pre-existing advisor finding is recorded verbatim in the phase commit message

### Phase 2: First migration — collected_posts, locked by default

#### Automated

- [ ] 2.1 Dry run lists the new migration and nothing else: `npm run db:push -- --dry-run`
- [ ] 2.2 Migration applies to the linked project: `npm run db:push`
- [ ] 2.3 Local and remote migration history agree on one applied version: `npm run db:status`
- [ ] 2.4 Security advisor still exits 0 with the table present: `npm run db:check`
- [ ] 2.5 Catalogue query returns row-level security enabled, zero policies and zero grants for `anon` and `authenticated`, via `npx supabase db query --linked` against `pg_class.relrowsecurity`, `pg_policies` and `information_schema.role_table_grants`
- [ ] 2.6 Formatting passes: `npm run format:check`

#### Manual

- [ ] 2.7 The table's columns in Supabase Studio match the collector's nine fields one-for-one, in name and nullability

### Phase 3: Prove the gate and record the runbook

#### Automated

- [ ] 3.1 Security advisor is clean again once the probe is removed: `npm run db:check` exits 0
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Formatting passes: `npm run format:check`

#### Manual

- [ ] 3.4 With the probe table present, `npm run db:check` exits non-zero and names `rls_disabled_in_public`
- [ ] 3.5 The probe table is dropped, confirmed absent, and `npm run db:status` shows the migration history unchanged by it
- [ ] 3.6 The `CLAUDE.md` runbook is sufficient to run the whole loop from a clean checkout without opening this plan
