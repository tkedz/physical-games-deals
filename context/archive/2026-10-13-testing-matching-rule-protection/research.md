---
date: 2026-10-13T09:10:03+02:00
researcher: tkedz
git_commit: 81374d5f5821bced69cee514ce529b432bc7f7f5
branch: main
repository: 10x-physical-games-deals
topic: "Grounding rollout Phase 1 of the test plan: matching rule protection (Risk #1) and the first test runner"
tags: [research, testing, matching, watchlist, supabase, migrations, pglite, vitest, ci]
status: complete
last_updated: 2026-10-13
last_updated_by: tkedz
---

# Research: Grounding rollout Phase 1 — matching rule protection and the first test runner

**Date**: 2026-10-13T09:10:03+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 81374d5f5821bced69cee514ce529b432bc7f7f5 (`context/foundation/test-plan.md` and this change folder are uncommitted)
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Matching rule protection", Risk #1). Verify, rather than accept, its response guidance: the PRD's Silent Hill 2 example (pinned to PS5 vs unpinned), Switch 2 vs Switch, separate releases (Remake, Remastered, HD, year-numbered series) and phrase folding (case, Polish diacritics including ł, apostrophes, "&"); TS/SQL fold parity; no stale stored keys after a rule change. Ground where each half of the rule runs, the grants each matching function needs, and the acceptance sample as an independent oracle. Challenge "TS and SQL agree, so the rule is right" and "the hand-run truth table covers the rule". For the bootstrap, ground PGlite vs the local Supabase stack with pgTAP, stub roles that reproduce Supabase's grants, `npm test` in the CI `verify` job, and migration-only changes running it.

## Summary

1. **The matching rule runs entirely in Postgres, in three places.** The TypeScript fold is not one of them.
   - Deals carry stored keys: the generated columns `match_keys` and `match_text`, computed when `service_role` inserts or updates a deal (`supabase/migrations/20261012070050_match_deals_to_watchlist.sql:129-133`).
   - Entries are keyed on every read, inside the `matched_deals` view, as the calling role (`:169-186`).
   - Phrase duplicates are judged by the folded unique index (`:159-161`).
   - In a grep of `src/` and `scripts/`, `foldForMatching` is called only inside `isPhraseOnList` (`src/lib/watchlist/rules.ts:206,211`). The one caller of `isPhraseOnList` is `PhraseOffer`, which disables the "Obserwuj frazę" button (`src/components/watchlist/phrase-offer.tsx:49-52`).
   - No TypeScript twin of `game_match_key` exists: a case-insensitive grep of `src/` and `scripts/` for `match_key` or `matchKey` finds nothing. TS/SQL parity is therefore a narrower risk than §2 implies: it decides whether a user can add a phrase, not which deals `/my-deals` shows.
2. **The hand-run truth table is already an automatable asset.**
   - `supabase/checks/matching.sql` (80 checks at HEAD) ran unmodified against all 11 migrations in PGlite 0.5.9 and passed 80/80.
   - It also passed with the migrations applied by a non-superuser owner.
   - Three deliberate breaks were each caught and named in its report: `ł` dropped from the fold, the `authenticated` EXECUTE grant dropped, and an open RLS policy (the last one caught through `isolation.sql`).
   - Its gaps are what Phase 1 must add (see *Coverage gaps*).
3. **Both challenges hold up.**
   - **Parity:** review F5 (NFD `Pokémon` folds to `poke mon` in both twins) is SKIPPED and still live, so a parity-only test passes over a real defect (`context/changes/deals-matched-to-watchlist/reviews/impl-review.md:145-158`).
   - **Truth table:** review F2 (`Just Dance 2024/2025 Edition` sharing one key) escaped both the truth table and the acceptance run (`impl-review.md:94-104`). Its regression rows exist only at key level (`matching.sql:131-137`); there is no view-level case.
4. **The acceptance sample is not a fixture-loadable oracle — correct §2.**
   - Of its 43 expected deals, only 5 are recorded with titles and platforms (`context/changes/deals-matched-to-watchlist/acceptance.md:72-82`).
   - What is reusable: the 20 catalogue names as entries, the 4 recorded misses, and the sibling families "rightly kept apart" (`:61-68`), which have names but no titles.
   - Its labels were judged by reading card titles (`:30-33`), and the sample has no phrase and no pinned entry (`:23-24`).
5. **Which examples the PRD itself settles.**
   - Explicit in the PRD: Silent Hill 2 pinned vs unpinned (`context/foundation/prd.md:54`), and folding of case, diacritics and punctuation (`:75`, `:100`).
   - From roadmap S-04 and the plan: Switch 2 ≠ Switch, Remake/Remastered/HD as separate releases, and ł, apostrophes and "&" (`context/foundation/roadmap.md:186-187`).
   - From review F2: year-numbered series.
   - These are the independent sources for expected values.
6. **Stale stored keys are detectable, under one condition** (both experiments run in this research):
   - **Stored deal keys:** after all migrations, compare each deal's stored `match_keys`/`match_text` with a fresh `deal_match_keys(...)`/`deal_match_text(...)`. With `update public.deals set title = title` removed from `20261012130317`, this flags exactly the 2 of 3 seeded rows whose key changed. As the migration is, it flags 0.
   - **Folded phrase index:** `amcheck`'s `bt_index_check(..., heapallindexed => true)` fails after a fold change without `reindex`, and passes with it.
   - **The condition:** the seeded corpus must be inserted before the first matching migration and must contain rows the rule change affects.
7. **PGlite is the recommended disposable Postgres**, if the stub is kept honest.
   - Cost: about 1–2 s from nothing to a migrated database. No Docker, and the same in CI and on Windows.
   - Keeping the stub honest means a non-superuser owner, default privileges that depend on each migration's date, and a pinned PGlite version.
   - Residual gaps: PG 18.6 vs hosted 17.6, collation C vs `en_US.UTF-8`, and no PostgREST layer.
   - The local Supabase stack with pgTAP needs Docker, which is not running on this machine. Its CI start-up time was not measured.
8. **Runner and CI: settled facts and open choices.**
   - Settled: the test runner must resolve the `@/` alias (`src/lib/watchlist/vocabulary.ts:14`) and needs an explicit `include`. `next build` type-checks test files (`tsconfig.json:31-38`).
   - Settled: `vitest@5` fails to install against `@types/node ^20` (ERESOLVE), while `vitest@4.1.11` installs cleanly.
   - Settled: CI cannot gate a hand-applied migration, so the local loop has to run the tests before `db:push`.
   - Open: making migration-only pushes run the suite without a production deploy is a choice among four options (see *CI wiring*).

## Detailed Findings

### Where each part of the rule runs, and what breaks if it drifts

| Part | Where | Evaluated as | Fails how |
|---|---|---|---|
| Deal game keys | generated `deals.match_keys` from `deal_match_keys` → `game_match_key` (`20261012070050:91-104,129-131`) | the inserting role, which is `service_role` for the extractor (`:191-192`) | Stale after a `game_match_key` change unless the migration runs `update public.deals set title = title` (`20261012130317:65`) |
| Deal phrase text | generated `deals.match_text` from `deal_match_text` → `fold_for_matching` (`20261012070050:108-122,132-133`) | as above | Stale after a fold change, for the same reason |
| Entry keys | the `my_entries` CTE in `matched_deals`, recomputed on every read (`:170-176`) | the caller, `authenticated` (`security_invoker`, `:169`) | Never stale. But after a rule change it uses the new function while deal keys hold the old one, so the two sides diverge |
| Platform rule | `e.platform is null or e.platform = d.platform` (`:183`); the platform vocabularies at `20260930061813_create_deals.sql:13` and `20261007141021_create_watchlist_entries.sql:16` | the caller | `switch` and `switch-2` are distinct codes. A pinned entry matches only equality. An unpinned entry matches any platform, including null and `other` |
| Listed predicate | `kind = 'game' and edition = 'physical' and price_amount is not null` (`:180`), restated by `loadListedDealsPage` (`src/lib/deals/queries.ts:160-162`) with the expiry filter (`:165`) | — | Expiry belongs to Risk #2, not Phase 1 |
| Phrase duplicates | `watchlist_entries_active_phrase_folded` (`20261012070050:159-161`) plus `lower(phrase)` (`20261007141021:37-38`) | `authenticated` on insert | A stale expression index after a fold change without `reindex` |
| TS fold | `foldForMatching` (`rules.ts:156-168`), used by `isPhraseOnList` (`:200-214`) | browser and server render | If TS folds two phrases alike where SQL does not, the button is disabled and the user cannot watch a phrase that would match other deals (silent). If SQL refuses what TS allowed, the insert gets 23505 and `addEntry` answers `"duplicate"` (`src/lib/watchlist/queries.ts:127,155`), which is handled |

The test plan's phrase "the TypeScript pre-check folds exactly as the database does" therefore protects the add-phrase flow. It does not protect what `/my-deals` lists. The deals `/my-deals` lists depend only on the SQL rows above.

### What the PRD and the roadmap settle (the oracles)

- **Explicit in the PRD:**
  - US-01 AC1: "„Silent Hill 2" z platformą PS5 zwraca wyłącznie oferty na PS5, ta sama gra bez wskazanej platformy zwraca również ofertę na Xbox" (`prd.md:54`).
  - The game rule ignores case, diacritics, punctuation, and edition and platform words (`:100`).
  - A phrase is contained in any title, ignoring case, diacritics and punctuation (`:75`, `:100`).
  - The pin applies to phrases as it does to games (`:102`).
  - The Silent Hill 2 example gives no deal titles, so a test supplies its own titles.
- **Not in the PRD (the word "Switch" does not occur in it):**
  - Switch 2 ≠ Switch is a plan decision derived from "zawęża trafienia do tej platformy" (`context/changes/deals-matched-to-watchlist/plan.md:102`). It was observed on production (deal 2370 on `switch-2` shown, deal 2099 on `switch` not; `context/changes/deals-matched-to-watchlist/change.md:53`).
  - Remake, Remastered and HD as separate releases come from `roadmap.md:186`. This sits in tension with the PRD's non-goal "bez rozróżniania edycji" (`prd.md:115`), a product judgement the rule already made.
  - ł, apostrophes and "&" come from `roadmap.md:187`: "`ł` has no Unicode decomposition…", "„Dragon's Dogma” finds „Dragon’s Dogma 2” and „pokemon” finds „Pokémon”".
  - Year-numbered series (`Just Dance 2024` vs `2025`) first appear in review F2 (`impl-review.md:94-99`).
- **Thresholds:** found ≥ 80% and wrong ≤ 5% for watched games, measured as 39/43 found and 0/39 wrong (`prd.md:126`). The PRD Guardrail prefers precision: "Fałszywe trafienie niszczy zaufanie do filtra szybciej niż przeoczona okazja" (`prd.md:40`).

### The acceptance sample, as an oracle

- **Where it lives:** `context/changes/deals-matched-to-watchlist/acceptance.md`. Per-game counts are at `:37-59` (43 on `/`, 39 on `/my-deals`; the sums reconcile).
- **Fixture-loadable: no.**
  - Deal titles are recorded for 5 deals only: 2301, 2302 and 2303 (`Dragon’s Dogma 2 Dark Arisen` on PS5, Xbox Series X|S and Switch 2), 2829 (`Fortnite Darkfire & Ice Bundle` on Switch), and 2833, which matched through an alternative title (`:72-82`).
  - The 1,524 listed deals were not saved. They live only in production `public.deals`.
- **Reusable inputs:**
  - The 20 catalogue names, as entry `game_name` values (`:37-58`).
  - The sibling families kept apart, by name only (`:61-68`): Little Nightmares II/III, Borderlands 3/4, FFVII Remake Intergrade, Crisis Core and FFVII, Atari 50, Dragon's Dogma: Dark Arisen, and Daemon X Machina (2019).
- **Label provenance:** the expected set was judged by reading card titles. "Editions and bundles count as the game. Sequels, remakes, remasters and other games of a series do not" (`:30-33`). The matched side is the rule's own output (`:88`).
  - Card titles miss `english_title` and alternative titles, which is how deal 2833 got in (`:79-82`).
  - The sample has no phrases and no pins (`:23-24`).
- **Known misses that a test expecting a match fails on today:** the three Dark Arisen deals (key `dragons dogma 2 dark arisen`) and the Fortnite bundle (key `fortnite darkfire and ice bundle`) (`:72-77`). They need a known-failing marker or a recorded decision.

### Review findings, as they bear on Phase 1

- **F2** (WARNING, FIXED; `impl-review.md:87-109`): the free word in front of "edition" swallowed years and HD.
  - The fix is migration `20261012130317:46-48`.
  - The truth table gained key-level rows at `matching.sql:131-137`: Just Dance 2025 and 2024, Shadow of the Colossus HD Edition, Dark Souls Remastered Edition, Resident Evil 2 Remake Edition, and Shadow of the Colossus Edycja HD.
  - It has no view-level case: no Just Dance deal fixture exists.
  - The review's own blind spot: "None appeared among the 43 deals measured" (`:104`).
- **F3** (OBSERVATION, FIXED; `impl-review.md:111-124`) is the missing CLAUDE.md rule on function privileges. It is not the grant matrix, so the test plan's "(review F3)" pointer is loose. The matrix itself:
  - It is at `20261012070050:196-211`: `service_role` gets all four functions, `authenticated` gets `fold_for_matching` and `game_match_key`, and `anon` gets none.
  - It is asserted at `matching.sql:467-497`, with view privileges at `:499-516`.
  - Postgres checks EXECUTE inside a generated column against the inserting role. This was confirmed by dropping the `service_role` grant, which failed 21 checks (`change.md:26`).
- **F5** (OBSERVATION, **SKIPPED**; `impl-review.md:145-158`): "The translate table holds precomposed letters only… `fold_for_matching(E'Pokémon')` is `poke mon`… The TypeScript twin does the same, so parity holds".
  - The decision was "deferred to the next change of the fold" (`:158`).
  - `matching.sql` holds no combining mark.
  - Any test asserting `pokemon` for NFD input fails on both twins today. Fixing it changes the rule, which needs a migration, the settle step, a reindex, a `rules.ts` change and a parity run.
- **`watchlist-from-catalog` F4** (FIXED): this finding led to the folded index and the settle step (`roadmap.md:187`).
  - Duplicate cases sit at `matching.sql:527-532`; "each deal once" at `:391-392,434-448`.
  - The settle step (`20261012070050:141-152`) is covered only by the earlier scratch PGlite harness (`change.md:27`), not by the repository.

### Coverage gaps in `supabase/checks/matching.sql` against the response guidance

Already covered at view level (`matching.sql:365-404`):

- Silent Hill 2 pinned to `ps5` vs unpinned, on `ps5` and `xbox-series` deals.
- A `switch-2`-pinned entry against a `switch` deal (Metroid, `:385`).
- Front Mission 3 vs Front Mission 3 Remake.
- Elden Ring vs Nightreign.
- Matching through `english_title` and through alternative titles.
- Phrases with diacritics, a curly apostrophe, and alternative titles.
- A phrase not spanning two titles.
- A pinned entry not matching a deal with no platform.
- A removed phrase, and the `!!!` phrase.
- Digital and unpriced deals hidden.

Absent, confirmed by grep of the file:

- A `switch-2` **deal** against a `switch`-pinned entry. No fixture deal has platform `switch-2`.
- Year-numbered siblings at view level, for example a `Just Dance 2025` entry against a `Just Dance 2024 Edition` deal.
- Remastered, HD and Remaster vs the base game at view level; `Front Mission 3 Remake` is the only one.
- A phrase or title with `&` or `ł` at view level. `&` appears only in fold case 7 (`:106`), and `ł` only in fold cases 2 and 12 (`:101,111`).
- A phrase pinned to a platform: all of A's phrases are `null` (`:301-306`), although `prd.md:102` applies the pin to phrases.
- NFD input (F5).
- Stale stored keys, and the settle step.
- The acceptance sample's misses and named siblings.

### Bootstrap: a disposable Postgres built from `supabase/migrations/`

**PGlite (experiment in this research, Node v24.21.0, Windows):**

- **Version:** `@electric-sql/pglite` 0.5.9 embeds "PostgreSQL 18.6 (PGlite 0.5.9) on wasm32-unknown-emscripten". The npm `latest` tag is 0.5.9. The earlier harness used 0.5.8 with PG 18.3 (`change.md:25`).
- **What the migrations need:** roles `anon`, `authenticated` and `service_role`; Supabase's default privileges (every `revoke` is written against them, for example `20261012070050:188-190`); `auth.uid()` (`20261007141021:9,73,77,81-82`; `20261012070050:175`); and `auth.users` as the foreign-key target (`20261007141021:9`).
  - No migration runs `create extension`, uses the `extensions` schema, or runs `alter default privileges`.
- **Stub prelude:** roles, schema usage, `auth.users`, and `auth.uid()`/`auth.role()`/`auth.jwt()` reading `request.jwt.claim.sub` with a fallback to `request.jwt.claims ->> 'sub'`. That body matches Supabase's documented definition (Context7, `/supabase/supabase`).
  - The default privileges are a separate file: `grant all on tables, sequences, functions to anon, authenticated, service_role`.
  - Full text: `scratchpad/pglite-probe/stub/` (session scratchpad, not in the repository).
- **Non-superuser owner:** on Supabase the migrations run as `postgres`, which is not a superuser. Run as a non-superuser owner, the first attempt failed with `42501 permission denied for table users` on the `auth.users` foreign key until REFERENCES was granted. A superuser stub hides that class of gap.
  - PGlite's `username` option only issues `SET ROLE`; use `SET SESSION AUTHORIZATION`.
- **Timings, over 3 runs:**

  | Step | Time |
  |---|---|
  | `PGlite.create()` | 1.0–1.9 s |
  | All 11 migrations | 38–98 ms |
  | `matching.sql` | 35–77 ms |
  | `clone()` | 250–299 ms |
  | `dumpDataDir` | 45–54 ms, 39 MB |
  | `create({ loadDataDir })` | 173–220 ms |

  Memory was about 363–405 MB RSS per instance.
- **Fidelity verified:**
  - After `set local role anon`, `is_superuser` is off, and anon reading `matched_deals` gets 42501.
  - RLS is enforced for anon and `authenticated`, and `service_role` bypasses it.
  - `security_invoker` is honoured.
  - The three `nulls not distinct` indexes return 23505.
  - The generated columns are stored.
  - The regex features `game_match_key` uses all work: `\M`, non-capturing groups, and `\1\2`.
  - `translate` works on multibyte text.
  - Encoding is UTF8.
- **Fidelity gaps:**
  - PG 18.6 vs hosted 17.6 (`change.md:32`; local stack `supabase/config.toml:41` `major_version = 17`). Syntax that exists only in 18 would pass here and fail at `db:push`.
  - Collation C vs `en_US.UTF-8`. `--locale=en_US.UTF-8` is accepted but still sorts bytewise, so it is misleading; ICU initdb fails.
  - One connection and no PostgREST.
  - The stub's `ALL` default privileges may be wider than the hosted `pg_default_acl`, which was not verified.
  - The earlier hosted run of `matching.sql` gave the same results as PGlite (`change.md:32`).

**Default privileges and the 2026-10-30 change:** with the default-privileges file left out, as for a project after 2026-10-30, 10 of 39 privilege rows change:

- `service_role` loses everything on `collected_posts`.
- All three roles lose everything on the three identity sequences.

`matching.sql` still passes 80/80. So the stub should apply each migration under the default privileges of its own date, before or after 20261030. Phase 1's matching checks do not depend on that choice.

**Local Supabase + pgTAP (documentation only):**

- How it runs: `supabase db start` and `supabase test db` run `pg_prove` over `supabase/tests/**` in Docker.
- What it reproduces that the stub cannot: the real roles and `pg_default_acl` (which will follow the 2026-10-30 change), the real auth schema, PG 17, glibc collation, and PostgREST with the full stack.
- What it costs: Docker, which is not running on this machine. The installed CLI, 2.117.0, has no Docker-less mode on Windows. The existing DO-block checks would need a pgTAP wrapper. Start-up time in Actions was not measured.

### Bootstrap: the runner

- **Next 16's guide** (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md:37-76`):
  - It prescribes `vitest` plus `vite-tsconfig-paths`; its React and jsdom packages are not needed for a `node` suite.
  - On async Server Components: "Vitest currently does not support them… we recommend using E2E tests" (`:9`).
  - Its example config fails this repository's `format:check`: single quotes, no semicolons.
- **Versions** (npm registry, 2026-10-13):
  - `vitest` 5.0.4 (`latest`) needs Node `^22.12 || ^24 || >=26` and has an optional peer `@types/node ^22 || >=24`. Installing it fails with ERESOLVE against `@types/node ^20` (`package.json:42`).
  - `vitest` 4.1.11 resolves cleanly. So does `vitest@5` together with `@types/node@^24`, which matches `engines` 24.x (`package.json:5-7`); whether that bump surfaces type errors under `next build` was not run.
- **Alias:** `src/lib/watchlist/vocabulary.ts:14` imports `@/lib/deals/format` at runtime, so even the first unit test needs alias resolution: `vite-tsconfig-paths`, Vite 8's `resolve.tsconfigPaths`, or an absolute `resolve.alias`.
- **Discovery trap:** Vitest's default `include` would collect `.claude/skills/10x-plan/scripts/metadata-guard.test.mjs` and `.claude/skills/10x-research/scripts/prose-json-check.test.mjs`. Both use `node:test` and are managed by the 10x CLI. Set an explicit `include`.
- **Type check, lint and format:**
  - **Type check:** `tsconfig.json:31-38` includes `**/*.ts` and `**/*.mts`, so `next build` type-checks test files and `vitest.config.mts`.
  - **Imports:** explicit `import { describe, it, expect } from "vitest"` needs no tsconfig change. Globals would need `types`, which would stop `@types/*` from being included automatically.
  - **Lint:** `eslint --max-warnings 0` covers every `.ts` and `.mts` file (`eslint.config.mjs:6-20`). An unused import fails it, and so does an anonymous default export (`import/no-anonymous-default-export`). Use `export default async function setup()`.
  - **Format:** Prettier checks `tests/`, `src/**` and the config, but ignores `supabase/` (`.prettierignore:13`).
- **Sharing a database across files:**
  - `globalSetup` runs in the main process, and only serializable data crosses to tests through `provide`/`inject`. So a live PGlite instance cannot be shared that way.
  - The options are a per-file instance (about 1–1.5 s per file), or migrating once and loading a `dumpDataDir` tarball per file (about 0.2 s). The latter is composed from documented pieces and was not tested under Vitest.
  - The default pool is `forks`. PGlite is pure WASM, and no `threads`-specific guidance was found.
- **Supply-chain constraint:** `collect.yml:57` runs `npm ci --omit=dev`, for the reason given at `:52-56`. Every test package must stay in `devDependencies`.

### CI wiring

- **Today:** `verify` runs `npm ci`, lint and `format:check` (`ci.yml:53-65`). `deploy` needs it (`:68`) and deploys `--prod` on main (`:114`). Both events list `supabase/**` in `paths-ignore` (`:24-40`).
  - A push touching only test files would also trigger a production deploy of an unchanged artifact. A fix limited to `supabase/**` therefore leaves the same dilemma for `tests/**`.
- **GitHub semantics** (workflow-syntax docs, read through a summarising fetch):
  - `!` negation is documented for `paths` only.
  - `paths` and `paths-ignore` cannot be combined for one event.
  - A workflow skipped by path filters leaves required checks "Pending". A job skipped by `if` reports Success.
- **Options for "a migration-only push runs the tests":**

  | Option | Change | Effect |
  |---|---|---|
  | (a) | Drop `supabase/**` from `paths-ignore` | Simplest. A migration push also redeploys identical code to production |
  | (b) | Keep `ci.yml` and add `npm test` to `verify`, plus a separate workflow with `paths: [supabase/migrations/**, supabase/checks/**, src/lib/watchlist/**, …]` | No deploy on a migration push. A mixed push runs the tests twice, and `deploy` is not gated by the second workflow unless `ci.yml` calls it through `workflow_call` |
  | (c) | Convert to `paths:` with negations | Same effect as (a), on a narrower trigger |
  | (d) | Always trigger, with a `changes` job and `if:` on `deploy` | Removes the "Pending" caveat (`ci.yml:15-17`). Starts a runner for every docs push, needs `dorny/paths-filter` (a new third-party action) or a hand-rolled diff, and has a cancel-in-progress trap: a docs push cancels an in-flight code deploy, then skips its own (`ci.yml:43-45`) |

- **Constraint the CI options cannot remove:** `npm run db:push` is human-only (CLAUDE.md, *Database migrations*). A migration reaches production before or regardless of CI. A test gate for migrations is real only if the local loop (`db:new → db:push --dry-run → db:push → db:check`) runs `npm test` before `db:push`. CI is a backstop.

### Stale stored keys: the experiment (`scratchpad/stale-probe/`)

- **Stored deal keys:**
  - The experiment seeded three deals after `20261007141021`, before the first matching migration: `Just Dance 2025 Edition`, `Shadow of the Colossus HD Edition` and `Silent Hill 2`.
  - It then applied the rest and selected rows where `match_keys is distinct from deal_match_keys(title, english_title, alternative_titles)` or the same for `match_text`.
  - As the migration is: 0 rows.
  - With `update public.deals set title = title;` removed from `20261012130317`, 2 rows came back:
    - `Just Dance 2025 Edition`: stored `{"just dance"}`, fresh `{"just dance 2025"}`
    - `Shadow of the Colossus HD Edition`: stored `{"shadow of the colossus"}`, fresh `{"shadow of the colossus hd"}`
  - `Silent Hill 2` stayed equal, so the check sees only rows the change affects.
  - Comparing stored and fresh values is a consistency property, not an expected value, so it does not run into the oracle problem.
- **Folded index:**
  - After all migrations, the experiment stored the phrases `Łowcy gier` and `Silent Hill`, then replaced `fold_for_matching` with `ł` no longer folded.
  - Without `reindex`, `bt_index_check('public.watchlist_entries_active_phrase_folded', true)` fails: "heap tuple (0,1) … lacks matching index tuple".
  - With `reindex`, it passes. `amcheck` ships in PGlite's contrib.
- **The settle step:** not exercised here. The earlier harness verified that the newer of two phrases that fold alike is removed (`change.md:27`).

### Hot-spot evidence

- **`supabase/migrations/`, 6 commits in 14 days:** 2 touched the matching rule, `4585492` and `2fe9d97`, both on 2026-10-12. The others created pipeline and watchlist tables.
- **`src/lib/watchlist/`, 4 commits in 14 days:** 1 touched `foldForMatching` (`ce9438b`). The others were watchlist UI and catalogue rules.
- **Verdict:** the directory-level churn overstates matching-specific churn. The truer likelihood signal is that the rule was 1 day old at writing, and was changed the same day by a review that found a wrong-match defect (F2) and a cost defect (F1).

## Code References

- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:28-50` — `fold_for_matching`, the translate table
- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:129-133` — generated `match_keys` and `match_text`
- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:141-161` — settle step and folded unique index
- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:169-186` — `matched_deals`: entry keys per read, platform rule
- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:196-227` — EXECUTE matrix and view privileges
- `supabase/migrations/20261012130317_bound_game_match_key.sql:30-65` — current `game_match_key`, 1000-character cap, recompute update
- `supabase/checks/matching.sql:98-156` — fold and key cases; `:185-281` stored keys; `:338-449` view cases; `:451-516` grants; `:518-561` phrase duplicates
- `src/lib/watchlist/rules.ts:90-168` — `foldForMatching` and its copied table; `:200-214` `isPhraseOnList`
- `src/components/watchlist/phrase-offer.tsx:49-52` — the only consumer of the TS fold's result
- `src/lib/watchlist/queries.ts:127,149-158` — 23505 answered as `"duplicate"`
- `src/lib/deals/queries.ts:148-201` — `/my-deals` reads `matched_deals` with the listed predicate and expiry filter
- `src/lib/watchlist/vocabulary.ts:14` — runtime `@/` import a unit test must resolve
- `.github/workflows/ci.yml:24-40,53-65,68,114` — paths-ignore, `verify`, deploy dependency, production deploy
- `.github/workflows/collect.yml:52-57` — `npm ci --omit=dev`
- `supabase/migrations/20260921133305_create_collected_posts.sql:17-20` — `service_role` access left to default privileges

## Architecture Insights

- The rule is defined once, in SQL, and stored on one side only: deals hold keys, entries are keyed per read. A rule change therefore splits the two sides until the stored side is recomputed. The stale-key check is the test that pins this asymmetry.
- The hand-run truth table already follows the pattern later tests need: fixtures of its own, identity switches through `set local role` and `request.jwt.claims`, and a rollback. Wrapping it as one automated test reuses its 80 checks. New view-level cases could go into it, so the hosted SQL-editor run, which remains the authority on PG 17.6, also gains them.
- Grants are part of the rule's behaviour: a missing EXECUTE grant fails an insert or a read with 42501, not at `db:push`. A test is faithful only if the role switch really drops superuser rights, which it does in PGlite, and the default privileges match Supabase's.
- `lessons.md` ("Separate logic from I/O…"): the matching logic is already data-in/data-out SQL, and the TS fold is pure. Phase 1 needs no refactor to become testable.

## Historical Context (from prior changes)

- `context/changes/deals-matched-to-watchlist/plan.md:368-387` — the plan called for a PGlite dry-run of the checks; the harness stayed in a session scratchpad (`impl-review.md:29`).
  - Verdict now: supported. This research reproduced it at HEAD with 80/80.
- `context/changes/deals-matched-to-watchlist/change.md:50` — fold parity: 1,238 comparisons were identical (15 cases plus 1,223 generated probes). Dropping `ʼ` gave 2 mismatches.
  - Verdict: supported as a parity result. It does not establish correctness (F5).
- `context/changes/deals-matched-to-watchlist/acceptance.md` — 39/43 found, 0/39 wrong.
  - Verdict: supported as a production measurement. Not reusable as fixtures, because the deal titles were not kept.
- `context/changes/deals-matched-to-watchlist/reviews/impl-review.md` — F1 and F2 fixed with key-level regressions; F5 skipped.
  - Minor inconsistency: `change.md:79` calls the demo entry "Dragon's Dogma: Dark Arisen", while `:53` and `:80` say it is the phrase „Dragon's Dogma”.
- `context/changes/watchlist-from-catalog/checks/isolation.sql` and `grants.sql` — passed in PGlite with the same stub: 16 and all checks. Both are Phase 4 material.
- `context/archive/` holds only a README.

## Related Research

- Not applicable. No prior `research.md` covers testing or the matching rule. `context/changes/physical-deals-from-real-posts/research.md` concerns extraction cost.

## Corrections to `context/foundation/test-plan.md` §2 (for the backport check)

1. **Risk Response Guidance, #1 context:** "the acceptance sample (20 games, 43 deals) as an independent oracle" does not hold. Only 5 deals' titles were recorded. The reusable parts are the 20 names, the 4 misses and the sibling families. The independent expected values come from the PRD, `roadmap.md:186-187` and the review findings.
2. **Risk Response Guidance, #1 "Where each half of the rule runs":** the rule runs in SQL in three places: stored deal keys, per-read entry keys, and the folded index. The TS fold only predicts phrase duplicates. Parity protects the add-phrase flow, not what `/my-deals` lists.
3. **"(review F3)":** points to the CLAUDE.md privilege rule. The grant matrix lives in the migration and is asserted by `matching.sql:467-497`.
4. **Source column, hot-spot evidence:** the directory churn overstates matching churn: 2 of 6 migration commits and 1 of 4 `src/lib/watchlist/` commits touched the rule. Same-day review findings F1 and F2 are the stronger signal.
5. **Must challenge, kept and strengthened:** F5 is skipped, not fixed, so the twins share a live defect today.

## Open Questions

Decisions for `/10x-plan`. These are choices, not missing evidence.

1. **F5 (NFD input):** assert the correct `pokemon` as a known-failing case (Vitest `test.fails`), fix the fold in this phase (a rule change: migration, settle, reindex, `rules.ts`, parity run), or leave it out with a note. The test plan treats Phase 1 as tests only.
2. **Acceptance misses** (Dark Arisen ×3, the Fortnite bundle): mark them known-failing, or record them as accepted and keep them out of the suite.
3. **Shape of the database suite:** wrap `matching.sql` unmodified as one test and add the missing view-level cases to it, so the hosted run gains them too; port the cases to table-driven Vitest tests; or both. A single wrapped test reports every failure in one message.
4. **Vitest version:** 4.1.11 as is, or 5.x with `@types/node` bumped to `^24` (type check under `next build` not yet run).
5. **CI option** (a)–(d), and whether `verify` is or will be a required status check. Branch protection was not checked; `gh` is not signed in.
6. **PGlite pin and PG version gap:** 0.5.9 embeds PG 18.6 against hosted 17.6. Accept it, with the hosted SQL-editor run as the authority, or look for a PG 17 build. The npm `next` tag is `0.3.0-next.1`, which was not checked.
7. **Hosted default privileges:** the stub grants `ALL`, while Supabase's documented defaults are narrower. Tomasz can compare by running, read-only, `select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl where defaclnamespace = 'public'::regnamespace;` in the SQL editor.
8. **Local migration loop:** add `npm test` before `npm run db:push` in CLAUDE.md, since CI cannot gate a hand-applied migration.
9. **Outside Phase 1:** `public.collected_posts` relies on default privileges for `service_role` (`20260921133305_create_collected_posts.sql:17-20`). On a database built fresh after 2026-10-30, the collector and extractor would get 42501 there. The hosted table keeps its grant. This is Risk #3/#4 territory; flag it in `--refresh`, or as a lesson.
