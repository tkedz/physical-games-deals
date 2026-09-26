# Game catalogue provider proven — Implementation Plan

## Overview

Prove that the game catalogue this product rests on knows the games it is for. Tomasz chose RAWG on 2026-09-26, after a desk comparison with IGDB made without registering for either. This change puts a thin, provider-neutral search contract in `src/lib/catalog/`, implements it for RAWG, and adds a probe Tomasz runs locally against his own titles and a sample of real deal titles. The verdict is recorded against a predicate fixed before the run, so PRD open question 7 is answered either way. This is roadmap item F-03; it removes the coverage block on `S-03`.

## Current State Analysis

Nothing in the repository talks to a game catalogue yet. The only trace is a placeholder written before the provider was chosen: `.env.example:20-23` reserves empty `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` slots and leaves RAWG open, and `context/deployment/alternative-git-integration.md:110` repeats the `IGDB_*` name. There is no JSON-over-HTTP client anywhere to imitate, and `zod` is a dependency (`package.json:34`) with no usage.

RAWG was checked against the three slices that will consume it. Its OpenAPI spec (`https://api.rawg.io/docs/?format=openapi`, Swagger 2.0) covers the shape they need: `GET /games` with `search`, `search_precise`, `search_exact`, `exclude_additions` and `page_size`; per result `id`, `slug`, `name`, `released`, `background_image` and `platforms[].platform{id,slug,name}`; `GET /games/{id}/parent-games` to collapse an edition to its game. Four things the spec does not settle:

- **The key is undeclared.** The spec has no security definition and no `key` parameter; `https://rawg.io/apidocs` shows it travels as the `?key=` query parameter. A logged request URL is a leaked key.
- **Polish names are uncertain.** There is no localisation field; `alternative_names` exists only on the detail object, and nothing documents whether `search` matches it. Public pages show it can carry the Polish name (`"alternative_names":["Wiedźmin 3: Dziki Gon", …]` on The Witcher 3) but is empty for Hogwarts Legacy and Star Wars Jedi: Survivor.
- **Failure behaviour is thin.** The spec documents only `200`. RAWG's error reference (`https://rawg.readme.io/reference/errors.md`) lists `401` (missing or unknown key) and `404`, and says nothing about `429` or quota overrun. The free tier is 20,000 requests a month (`https://rawg.io/apidocs`); no per-second limit is published.
- **Switch 2 is not a platform.** Mario Kart World, a Switch 2 exclusive, is tagged `"platforms":["nintendo-switch"]`. Tomasz accepts merging Switch and Switch 2 into one platform (2026-09-26), so this is recorded for S-03 rather than treated as a failure.

RAWG's terms bind every page that later shows its data: "attribute RAWG as the source of the data and/or images and add an active hyperlink from every page where the data of RAWG is used" (spec `info.description`, `https://rawg.io/tos_api`). No page shows RAWG data in this change.

Maintenance is a live risk. GameVault called RAWG "an unmaintained abandonware, causing frequent downtime and issues like incorrect search results and registration problems" (`https://gamevau.lt/blog/2024/05/07/`), and a 2025-09-23 issue reads "As RAWG seems down (impossible to create account or connect)" (`https://github.com/CMorooney/obsidian-game-search-plugin/issues/5`). Obtaining a key is therefore the first check of this change, not a formality.

The code has to run in two runtimes. Next bundles `src/` for server code (S-03's search); Node runs `.mts` scripts with type stripping (this probe now, S-01's extractor later), which never rewrites import specifiers — hence the `.mts` extensions and the comment at `tsconfig.json:12-17`. Two experiments on Node 24.21.0 (2026-09-26) fix the rules for a module shared by both:

- an `.mts` script can import a `.ts` file from `src/` by its real name; Node warns `MODULE_TYPELESS_PACKAGE_JSON` because `package.json` has no `"type"`, and `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` silences exactly that warning;
- between two `.ts` files, `import type { X } from "./types"` is erased and works, while `import { type X } from "./types"` survives stripping and fails with `ERR_MODULE_NOT_FOUND`.

The `verify` job does not type-check anything (`.github/workflows/ci.yml:63-65` runs `npm ci`, lint and format only); `next build` does, inside `deploy` (`ci.yml:106-110`), and `tsconfig.json` includes `**/*.mts`. Locally, `npm run build` is the type gate for both trees.

## Desired End State

`src/lib/catalog/` holds a provider-neutral contract and a RAWG implementation of it, importable by Next server code and Node scripts alike, that never logs or returns anything carrying the key. `npm run catalog:probe` prints, for every title in `scripts/catalog/probe-titles.json`, where RAWG ranks the intended game with and without editions excluded, and ends with a verdict. `context/changes/game-catalog-provider-proven/coverage.md` records that verdict — or the failed registration, if RAWG could not issue a key — and the constraints S-01, S-03 and S-04 inherit. The roadmap carries the answer to its question 7.

The verdict predicate, fixed before the run (Tomasz, 2026-09-26): a title is **found** when the intended catalogue entry is among the first 5 results for its Polish or its English name. RAWG **passes** when every title from Tomasz's list that has an international release is found. Misses among Polish-only releases are recorded and do not fail it — the PRD already accepts that cost (`prd.md:98`). Titles taken from collected posts are informational and never fail it.

### Key Discoveries:

- `scripts/collector/posts.mts:1-11` — pure logic lives in a module with no top-level side effects, apart from the file that calls `main()`. The probe splits the same way.
- `scripts/collector/supabase.mts:18-29` — env validation throws before any I/O, naming the variable and where to set it; `collect.mts:37-39` calls it first; `collect.mts:130-135` is the top-level guard that sets `process.exitCode = 1`.
- `src/lib/kitchen-sink.ts:11-16` — the one pure function in `src/lib/` takes its environment as a parameter instead of reading `process.env`. The key reader follows it.
- `package.json:19-20` — scripts that need credentials load `.env.local` with `--env-file-if-exists`, and `CLAUDE.md` → Secrets names them as the only sanctioned exception.
- `context/changes/email-password-accounts/plan.md:132` — S-02 puts domain code under `src/lib/<domain>/`; `src/lib/catalog/` matches.

## What We're NOT Doing

- **No IGDB adapter.** If the verdict fails or RAWG cannot issue a key, the record says so and a follow-up change takes IGDB through the same contract.
- **No page, footer or attribution link.** Nothing renders RAWG data yet; the attribution requirement goes to `CLAUDE.md` and to the handoff for S-03.
- **No database schema.** Watchlist rows and resolved deal ids belong to S-03 and S-01.
- **No Vercel or GitHub Actions secret.** The key stays in `.env.local`; S-03 adds it to Vercel, S-01 to Actions.
- **No platform vocabulary.** Whether Switch and Switch 2 merge, and which platforms a watchlist entry can be pinned to, is S-03's decision.
- **No alternative-title handling.** Tomasz's idea — S-01's extraction producing alternative titles when posts name one game both "Wiedźmin 3" and "The Witcher 3" — is S-01's to plan.
- **No caching, retries or throttling in the client.** The probe runs one request at a time; S-01 decides throttling for its batch.
- **No edit to the PRD.** The answer to question 7 goes to the roadmap, where question 8's answer went (`roadmap.md:210`).

## Implementation Approach

Contract first, then the adapter, then the probe that exercises it. The contract (`types.ts`) holds only types, so every file can depend on it through `import type` and Node never has to resolve it. The adapter (`rawg.ts`) is the only file that knows RAWG's URL, parameter names and payload; everything in it is pure except one factory whose `fetch` is injected. The probe splits as the collector does: `coverage.mts` decides (normalise, rank, verdict), `probe.mts` does the I/O. Phase 1 ends with a live smoke run on the PRD's own example, so a failed registration or a broken key surfaces before Tomasz spends time collecting titles.

## Critical Implementation Details

**Imports inside `src/lib/catalog/`.** These files are loaded by Node as well as bundled by Next, so only whole-statement type imports may cross between them — `import type { CatalogGame } from "./types";`. A value import, or an inline `import { type CatalogGame } …`, leaves a specifier Node cannot resolve (verified: `ERR_MODULE_NOT_FOUND`). Say so in a one-line comment at the import.

**The request URL is a secret.** The key is part of the URL, so the URL is built inside the adapter and goes nowhere else: not into a thrown message, not into a result, not into a log. Any error `fetch` throws is mapped to a failure reason and the error object dropped, because its message or `cause` may name the request.

**Polish diacritics.** `normalizeTitle` strips combining marks after NFD decomposition, but NFD does not decompose `ł`/`Ł`; map them to `l` explicitly, or a name containing them never matches.

## Phase 1: Catalogue client and probe

### Overview

The contract, the RAWG adapter, the probe with its seed, the npm script and the configuration facts. Ends with Tomasz holding a key and a smoke run on Silent Hill 2.

### Changes Required:

#### 1. Catalogue contract

**File**: `src/lib/catalog/types.ts` (new)

**Intent**: The provider-neutral contract S-03 and S-01 will depend on, so the provider stays replaceable behind it. Types only — Node erases every import of this file.

**Contract**:

- `CatalogPlatform = { id: number; slug: string; name: string }`
- `CatalogGame = { id: number; slug: string; name: string; released: string | null; platforms: CatalogPlatform[]; imageUrl: string | null }` — `released` is `YYYY-MM-DD`, or null when unknown or TBA; `imageUrl` is background art, not a box cover.
- `CatalogFailureReason = "misconfigured" | "rate_limited" | "unavailable" | "invalid_response"`
- `CatalogResult<T> = { ok: true; value: T } | { ok: false; reason: CatalogFailureReason; status: number | null }` — `status` is the HTTP status when a response arrived.
- `SearchOptions = { limit?: number; excludeAdditions?: boolean; timeoutMs?: number }`
- `interface GameCatalog { searchGames(query: string, options?: SearchOptions): Promise<CatalogResult<CatalogGame[]>> }`
- Invariant: a failure carries a reason and a status only — never a URL, a header or a response body.

#### 2. RAWG adapter

**File**: `src/lib/catalog/rawg.ts` (new)

**Intent**: Implement `GameCatalog` for RAWG, keeping every part that decides something pure and callable with data. No top-level side effects and no `process.env` read: the key and `fetch` arrive as parameters (`context/foundation/lessons.md`, "Separate logic from I/O").

**Contract**:

- `readRawgApiKey(env: { RAWG_API_KEY?: string }): string` — returns the key, or throws `RAWG_API_KEY is not set — put it in .env.local locally, or in the deployment's environment variables.` in the form of `supabase.mts:20-29`. An empty string counts as unset.
- `classifyRawgStatus(status: number): CatalogFailureReason` — `401` and `403` → `misconfigured`, `429` → `rate_limited`, any other non-2xx → `unavailable`.
- `parseRawgSearchResponse(body: unknown): CatalogGame[] | null` — validates with `zod` only the fields the contract uses (`results[].id`, `slug`, `name`, `released`, `background_image`, `platforms[].platform.{id,slug,name}`) and drops unknown keys, because real payloads carry more than the spec declares. `platforms: null` becomes `[]`; an absent or null `released` or `background_image` becomes null. Returns null when the shape does not match.
- `createRawgCatalog(deps: { apiKey: string; fetch: typeof fetch }): GameCatalog` — `GET https://api.rawg.io/api/games` with `key`, `search`, `page_size` (from `limit`, default 10) and `exclude_additions=true` only when requested, built with `URLSearchParams` so Polish characters are encoded; `AbortSignal.timeout(timeoutMs)`, default 5,000 ms; a descriptive `User-Agent`, as the collector sends (`collect.mts:27`). A thrown `fetch` or an abort → `{ ok: false, reason: "unavailable", status: null }`; a non-2xx → `classifyRawgStatus` with its status; a body `parseRawgSearchResponse` rejects → `invalid_response`.

#### 3. Probe logic

**File**: `scripts/catalog/coverage.mts` (new)

**Intent**: The probe's decisions as pure functions, in a module with no top-level side effects — the split `posts.mts:1-11` documents.

**Contract**:

- `ProbeEntry = { title: string; queries: string[]; expect: string; year?: number; kind: "own" | "polish-only" | "post" }` — `queries` are the names to try (Polish and/or English, or the title exactly as a post wrote it); `expect` is the name the intended catalogue entry carries; `year` tells a remake from its original.
- `normalizeTitle(title: string): string` — lower case, diacritics removed (with the `ł` mapping), punctuation (`:` `-` `–` `—` `'` `’` `.` `,` `(` `)` `®` `™`) turned into spaces, whitespace collapsed.
- `rankOf(entry: ProbeEntry, games: CatalogGame[]): number | null` — 1-based position of the first game whose normalised name starts with the normalised `expect` and, when `year` is set, whose `released` year equals it.
- `FOUND_WITHIN = 5`: an entry is found when any of its queries, in either mode, ranks it at or above that.
- `verdict(outcomes): "PASS" | "FAIL"` — PASS when every `own` entry is found; `polish-only` and `post` entries are counted and reported but never change it.

#### 4. Probe runner

**File**: `scripts/catalog/probe.mts` (new)

**Intent**: The I/O shell: read the key and the title list, query the catalogue, print a Markdown report the coverage record can quote as printed.

**Contract**:

- Calls `readRawgApiKey(process.env)` first, so a missing key aborts before any request (as `collect.mts:37-39`). Imports `src/lib/catalog/rawg.ts`, `src/lib/catalog/types.ts` and `./coverage.mts` by their real file names.
- Reads `scripts/catalog/probe-titles.json` relative to its own location (as `collect.mts:21-24`); a file that is not an array of well-formed entries aborts with a message naming the first bad entry.
- For each entry, each query and each mode (`excludeAdditions` false, then true): one request at a time, `limit: 10`, latency measured.
- Prints a table with one row per query and mode: query, mode, rank or `—`, found yes/no, the first five results as `name (year)` with platform slugs, latency in ms; a failed call shows its `reason` and `status` only. Then totals per kind, then `Verdict: PASS` or `Verdict: FAIL`. Then one call with `timeoutMs: 1`, printed as `Failure path: <reason> (status: <status or none>)`.
- Exit code 0 whenever the probe measured something, whatever the verdict — a failing verdict is a result to record. Exit code 1 when it could not measure: key missing, title file unreadable, or every request failed. Top-level guard as `collect.mts:130-135`.

#### 5. Seed titles

**File**: `scripts/catalog/probe-titles.json` (new)

**Intent**: Let Phase 1 run with nothing from Tomasz: the PRD's own example (`prd.md:54`), remake and original.

**Contract**: two entries, `kind: "own"`, both querying `Silent Hill 2` and expecting `Silent Hill 2`, one with `year: 2024` (the remake) and one with `year: 2001` (the original).

#### 6. npm script

**File**: `package.json`

**Intent**: One command for the probe, loading `.env.local` the way the collector does and silencing the one warning a script importing `src/` triggers.

**Contract**: a `catalog:probe` script after `collect:import`:

```json
"catalog:probe": "node --env-file-if-exists=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/catalog/probe.mts"
```

#### 7. Environment template

**File**: `.env.example`

**Intent**: Replace the undecided IGDB placeholder with the chosen provider's single variable.

**Contract**: the `Game catalogue (FR-003)` block (`.env.example:20-23`) becomes a `RAWG_API_KEY=` slot whose comment says where the key comes from (`https://rawg.io/apidocs`), that it never takes the `NEXT_PUBLIC_` prefix, that it travels in the request URL so URLs are never logged, and that it is local-only until S-03 (Vercel) and S-01 (GitHub Actions) need it. `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are removed.

#### 8. Project rules

**File**: `CLAUDE.md`

**Intent**: Put the facts a later agent needs before touching the catalogue where it will read them; the reasoning stays in this plan.

**Contract**:

- A new `## Game catalogue` section, after `## Supabase`: the provider is RAWG; the contract is `src/lib/catalog/types.ts`, and `src/lib/catalog/rawg.ts` is the only file that knows RAWG; `RAWG_API_KEY` is server-only, never `NEXT_PUBLIC_`, and rides in the URL, so request URLs are never logged or returned; files under `src/lib/catalog/` are also loaded by Node, so only `import type` crosses between them, and scripts importing `src/` run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`; RAWG's terms require an active link to rawg.io on every page showing its data.
- `## Secrets`: the sanctioned-exception bullet names `npm run catalog:probe` alongside `npm run collect` and `npm run collect:import`.

### Success Criteria:

#### Automated Verification:

- Lint passes with zero warnings: `npm run lint`
- Formatting passes: `npm run format:check`
- The build type-checks `src/` and `scripts/`: `npm run build`
- Without the env file the probe aborts before any request: `env -u RAWG_API_KEY node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/catalog/probe.mts` exits 1 and prints `RAWG_API_KEY is not set`
- The key never gets a public prefix: `git grep -n "NEXT_PUBLIC_RAWG"` returns nothing
- The client never logs: `git grep -n "console\." -- src/lib/catalog` returns nothing

#### Manual Verification:

- Tomasz registers at https://rawg.io/apidocs and puts `RAWG_API_KEY` into `.env.local`, confirmed by Tomasz without anyone reading the file; if registration fails, that goes into `coverage.md` and Phase 2 continues with the record only
- `npm run catalog:probe`, run by Tomasz, reports both Silent Hill 2 entries in both modes — a rank where RAWG returns the entry, `—` where it does not, different ranks where both appear — with a latency per call, a verdict line and `Failure path: unavailable`
- The output Tomasz pastes contains neither the key nor a request URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Coverage verdict and handoff

### Overview

Run the probe on the agreed title set, record the verdict against the predicate, and hand the constraints to the slices that consume the catalogue.

### Changes Required:

#### 1. Probe titles

**File**: `scripts/catalog/probe-titles.json`

**Intent**: The agreed probe set (Tomasz, 2026-09-26).

**Contract**: the two seed entries stay. Added: 10–15 titles from Tomasz's own list — `kind: "own"` for games with an international release, with both names in `queries` for those he knows by a Polish name — and 1–2 Polish-only releases as `kind: "polish-only"`. Plus about 10 boxed-edition deal titles Tomasz copies from `public.collected_posts` in the Supabase SQL editor, as `kind: "post"`, with `queries` holding the title exactly as the post wrote it and `expect` the game's English name.

#### 2. Coverage record

**File**: `context/changes/game-catalog-provider-proven/coverage.md` (new)

**Intent**: The answer to "does this catalogue know the games this product is for", on record either way.

**Contract**: sections —

- **Run**: date, provider, `limit: 10`, both modes, one request at a time.
- **Predicate**: verbatim from Desired End State.
- **Results**: the probe's table as printed, each automatic rank confirmed or corrected by Tomasz.
- **Verdict**: PASS or FAIL and one sentence why. If registration failed: FAIL for that reason, with IGDB named as the candidate for a follow-up change.
- **Operational observations**: latency range, the failure-path line, any non-2xx status seen.
- **Handoff**:
  - S-03: an active link to rawg.io on every page showing RAWG data, and `src/app/layout.tsx` has no footer yet; Switch 2 is folded into Nintendo Switch and Tomasz accepts merging the two, with the caveat that compatibility runs one way (a Switch 2 game does not run on a Switch); Polish names are thin, so search needs a hint to try the English title; which `exclude_additions` default the ranks support; the four failure reasons as material for PRD question 6; the key goes to Vercel as a server-only variable.
  - S-01: extraction should emit the game's original title (and perhaps alternative titles — Tomasz's idea, S-01's call); resolving a deal costs about one request; the free tier is 20,000 requests a month with no published per-second limit, so batches run one request at a time; the key goes to GitHub Actions secrets; scripts importing `src/` carry the warning flag.
  - S-04: matching compares the RAWG `id` plus the platform rule; editions collapse through `exclude_additions` or `GET /games/{id}/parent-games`.

#### 3. Roadmap answers

**File**: `context/foundation/roadmap.md`

**Intent**: Record the answers where the roadmap tracks them; status fields stay with the lifecycle skills.

**Contract**:

- F-03 `Unknowns` (`roadmap.md:129`): append `Answered 2026-09-26: RAWG — chosen by the user after a desk comparison with IGDB, as the simpler integration for a course project.`
- Open Roadmap Question 7 (`roadmap.md:209`): append `Answered <date>: <verdict> — see context/changes/game-catalog-provider-proven/coverage.md.`, in the form of question 8's answer (`roadmap.md:210`).
- S-03's coverage unknown (`roadmap.md:172`): append `Resolved by F-03 on <date>: <verdict>.`

#### 4. Deployment guide

**File**: `context/deployment/alternative-git-integration.md`

**Intent**: Drop the last reference to the placeholder provider.

**Contract**: line 110 names `RAWG_API_KEY` where it named `IGDB_*`; the rest of the sentence stands.

### Success Criteria:

#### Automated Verification:

- No IGDB placeholder is left in code, config or deployment docs: `git grep -n "IGDB_" -- .env.example src scripts .github context/deployment` returns nothing
- Formatting passes, the title file included: `npm run format:check`
- Lint passes with zero warnings: `npm run lint`

#### Manual Verification:

- `npm run catalog:probe` on the full title set, run by Tomasz, produces output that contains neither the key nor a request URL
- Tomasz confirms or corrects every automatic rank in `coverage.md`
- The verdict in `coverage.md` follows the agreed predicate applied to the confirmed ranks
- The roadmap carries the answers to the F-03 provider unknown, question 7 and S-03's coverage unknown

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

The repository has no test runner (`CLAUDE.md` → Verification), so none are written here. The decisions are pure functions so tests can be added later without rewriting them:

- `normalizeTitle`: Polish diacritics including `ł`, punctuation, repeated spaces.
- `rankOf`: `Silent Hill 2` against the 2001 and 2024 entries, with and without `year`; a prefix that also matches a DLC.
- `classifyRawgStatus`: `401`, `403`, `429`, `404`, `500`.
- `parseRawgSearchResponse`: `platforms: null`, a missing `released`, a missing `results`.
- `verdict`: an `own` miss fails; `polish-only` and `post` misses do not.

### Integration Tests:

- The Phase 1 smoke run and the Phase 2 full run against the live API are the integration evidence.

### Manual Testing Steps:

1. Register at https://rawg.io/apidocs and put the key into `.env.local`.
2. Run `npm run catalog:probe` on the seed; check both Silent Hill 2 rows and the failure-path line.
3. Add the agreed titles, run again, and confirm each rank in `coverage.md`.

## Performance Considerations

A full run is about two requests per query — roughly 60–100 for the agreed set — against a free tier of 20,000 a month, sent one at a time so any unpublished per-second limit is respected. The 5,000 ms default timeout is meant for S-03's interactive search; the probe reports real latencies for S-03 to tune it against.

## Migration Notes

None — no schema change, and no deployed code reads the new module.

## References

- Roadmap: `context/foundation/roadmap.md:119-131` (F-03), `:162-174` (S-03), `:209` (question 7)
- PRD: `context/foundation/prd.md:68-70` (FR-003), `:98` (catalogue identity and accepted cost), `:125-126` (questions 6 and 7)
- Rules: `context/foundation/lessons.md` ("Separate logic from I/O and from components before tests arrive")
- Patterns: `scripts/collector/posts.mts:1-11`, `scripts/collector/supabase.mts:18-29`, `scripts/collector/collect.mts:21-27`, `:37-39`, `:130-135`, `src/lib/kitchen-sink.ts:11-16`
- RAWG: `https://api.rawg.io/docs/?format=openapi`, `https://rawg.io/apidocs`, `https://rawg.io/tos_api`, `https://rawg.readme.io/reference/errors.md`
- Provider comparison evidence (2026-09-26): `https://api-docs.igdb.com/` (Business FAQ, rate limits), `https://gamevau.lt/blog/2024/05/07/`, `https://github.com/CMorooney/obsidian-game-search-plugin/issues/5`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Catalogue client and probe

#### Automated

- [x] 1.1 Lint passes with zero warnings: `npm run lint` — ea16611
- [x] 1.2 Formatting passes: `npm run format:check` — ea16611
- [x] 1.3 The build type-checks `src/` and `scripts/`: `npm run build` — ea16611
- [x] 1.4 Without the env file the probe aborts before any request: `env -u RAWG_API_KEY node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/catalog/probe.mts` exits 1 and prints `RAWG_API_KEY is not set` — ea16611
- [x] 1.5 The key never gets a public prefix: `git grep -n "NEXT_PUBLIC_RAWG"` returns nothing — ea16611
- [x] 1.6 The client never logs: `git grep -n "console\." -- src/lib/catalog` returns nothing — ea16611

#### Manual

- [x] 1.7 Tomasz registers at https://rawg.io/apidocs and puts `RAWG_API_KEY` into `.env.local`, confirmed by Tomasz without anyone reading the file; if registration fails, that goes into `coverage.md` and Phase 2 continues with the record only — ea16611
- [x] 1.8 `npm run catalog:probe`, run by Tomasz, reports both Silent Hill 2 entries in both modes — a rank where RAWG returns the entry, `—` where it does not, different ranks where both appear — with a latency per call, a verdict line and `Failure path: unavailable` — ea16611
- [x] 1.9 The output Tomasz pastes contains neither the key nor a request URL — ea16611

### Phase 2: Coverage verdict and handoff

#### Automated

- [x] 2.1 No IGDB placeholder is left in code, config or deployment docs: `git grep -n "IGDB_" -- .env.example src scripts .github context/deployment` returns nothing
- [x] 2.2 Formatting passes, the title file included: `npm run format:check`
- [x] 2.3 Lint passes with zero warnings: `npm run lint`

#### Manual

- [x] 2.4 `npm run catalog:probe` on the full title set, run by Tomasz, produces output that contains neither the key nor a request URL
- [x] 2.5 Tomasz confirms or corrects every automatic rank in `coverage.md`
- [x] 2.6 The verdict in `coverage.md` follows the agreed predicate applied to the confirmed ranks
- [x] 2.7 The roadmap carries the answers to the F-03 provider unknown, question 7 and S-03's coverage unknown
