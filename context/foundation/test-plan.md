# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried that the LLM stops processing deals or processes them worse,
   that deals vanish from `/my-deals` when the matching rule changes, and
   that the cron stalls for several runs — and the failure would surface
   somewhere in the extraction pipeline or the matching rule" carry the
   same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (without
`src/components/ui/`), `scripts/` (without JSON data and fixtures),
`supabase/migrations/`, `supabase/checks/`, `.github/workflows/`. The scan
found 43 commits in 30 days, which is the project's whole history, so §2
also cites the 14-day view as the truer churn signal.

Interview, 2026-10-12 (Q4 skipped because the test base is `none`):

- **Q1, worries most:** the LLM stops processing deals or processes them
  worse; deals vanish from `/my-deals` when the matching rule changes; the
  cron stalls across several runs.
- **Q2, burned before:** no incident. The most doubt was about matching
  deals to the watchlist, which is why phrases were added when RAWG lacked
  a new release.
- **Q3, changed without confidence:** the SQL matching rule and the
  extraction prompt, every time.
- **Q5, do not spend on:** see §7.
- **After the brief:** one e2e test of the main flow was requested (§3
  Phase 5).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3). Slice names refer to the change
folders under `context/changes/`; F-numbers are findings in their reviews.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A change to the matching rule silently drops watched games' deals from `/my-deals`, or admits a different game — platform-pinned entries and phrases included — or the add-phrase check refuses a new phrase as already watched. | High | High | PRD US-01 AC1, Business Logic, Open Question 5 (at least 80% found, at most 5% wrong); roadmap S-04 Risk; `deals-matched-to-watchlist` review F1, F2 (the rule was corrected the day it shipped), F5 (skipped, still live); `watchlist-from-catalog` review F4; interview Q1, Q2, Q3; hot-spot `supabase/migrations/` — 6 commits/14d (2 touched the rule), `src/lib/watchlist/` — 4 commits/14d (1 touched the fold) |
| 2 | A prompt or model change quietly makes extraction worse — digital or key offers, non-deals or wrong prices get listed, real physical deals get dropped — or a deal stays listed past its stated expiry. | High | High | PRD Guardrails (no digital edition), NFR (at most 5% wrong), US-01 AC3–AC4; roadmap S-01 Risk; `physical-deals-from-real-posts` evaluation (prompt v3 regression, digital leaks in a rejected model) and sample review (2.9% wrong, set prices); interview Q1, Q3; hot-spot `scripts/extract/` — 6 commits/14d, `src/lib/deals/` — 5 commits/14d |
| 3 | Collection or extraction stalls across several runs — a poison post, a withdrawn model, exhausted credit, most feeds failing — while runs stay green and the freshness line claims fresh data; posts older than the feeds' ~2-day window are lost, or a re-run bills a post twice. | High | High | PRD NFR (visible within 6 h), US-01 AC2, cost guardrail; roadmap F-02 Risk (~2-day feed retention); `physical-deals-from-real-posts` incident 2026-10-05 and review F1, F2, F4; `collector-into-repo-and-database` review F1, F6, F9; interview Q1; hot-spot `scripts/extract/` — 6 commits/14d, `.github/workflows/` — 11 commits/30d |
| 4 | Another signed-in user or a guest reads or changes someone's watchlist entries or matched deals — through the Data API, a Server Action, or a database object shipped without explicit grants. (Abuse: authorization.) | High | Medium | PRD Guardrails and NFR (isolation, including by editing the address), Access Control; roadmap F-01 Risk ("the one guardrail whose failure is silent"); `deals-matched-to-watchlist` review F1, F3; `physical-deals-from-real-posts` Phase 2 grant finding and review F6; CLAUDE.md (Supabase default grants change on 2026-10-30); hot-spot `supabase/migrations/` — 8 commits/30d |
| 5 | A deal's link leads somewhere other than the deal's origin — a URL the post never contained, a different offer, or a non-web scheme planted in a stranger's post. (Abuse: untrusted input.) | High | Medium | PRD Guardrails (link), Business Logic (shop link, else the aggregator post); shape-notes (link worry); `physical-deals-from-real-posts` plan (the link rule's cases ran only in a scratch script outside the repo); interview Q3; hot-spot `scripts/extract/` — 6 commits/14d |
| 6 | A session or access change logs users out, leaves a signed-out session alive on the server, opens a private view or action to guests, or lets a cache serve one user's page to another. | High | Medium | PRD Access Control; roadmap S-02 Risk; `email-password-accounts` review F1, F2, F5; `watchlist-from-catalog` change log (a guest's Server Action POST answered 200 and showed the error screen); `infrastructure.md` risk register #6, #8, #12; hot-spot `src/lib/auth/` — 5 commits/30d, `src/utils/supabase/` — 4 commits/30d |
| 7 | A catalogue failure — outage, timeout, rate limit — shows a raw error or breaks the watchlist instead of the one generic message, or the RAWG key, which rides in the request URL, leaks into a log, an error body or the browser bundle. (Abuse: secret leakage.) | Medium | Medium | PRD Open Question 6; `game-catalog-provider-proven` coverage (no non-2xx response ever observed); `watchlist-from-catalog` review F1 (dev logging printed the key) and change log (3 of ~15 searches timed out); `infrastructure.md` risk register #14; CLAUDE.md (key in the request URL) |

No High-impact × Low-likelihood row was padded in: alerting on a stopped
pipeline is observability, not a test (§7).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Deals for watched entries reach `/my-deals` and sibling games stay out, on the PRD's Silent Hill 2 example (pinned to PS5 vs unpinned), Switch 2 vs Switch, separate releases (Remake, Remastered, HD, year-numbered series) and phrase folding (case, Polish diacritics including ł, apostrophes, "&"). A rule change leaves no stale stored keys. Separately, the TypeScript pre-check folds exactly as the database does, so the add-phrase check never refuses a phrase the database treats as new; parity protects that check, not what `/my-deals` lists. | "TS and SQL agree, so the rule is right" — review F5 was skipped, so today both twins fold an accent typed as a separate character the same wrong way ("Pokémon" → "poke mon"). "The hand-run truth table covers the rule" — review F2 escaped both it and the acceptance measurement. | Where the rule runs: all of it in the database — keys stored on deals, entry keys computed on every read, and the folded phrase index; the TS pre-check only predicts phrase duplicates. How to apply the repo's migrations to a disposable Postgres without Docker (the PGlite dry-runs of the hand-run checks). The grants each matching function needs, including the role whose deal insert computes the stored keys. The acceptance sample supplies inputs only — the 20 watched names, its 4 recorded misses and the sibling families kept apart; its deal titles were not kept, so expected values come from the PRD, roadmap S-04 and the review findings. | Database integration, table-driven, against the repo's migrations + unit for the TS fold + a TS/SQL parity check over a shared corpus. | Oracle problem: expected keys produced by running today's functions. ASCII-only fixtures. |
| #2 | On the labelled set, a prompt or model change keeps digital or key offers among listed deals at zero and wrong entries at or below 5%, without newly dropping physical deals. The deterministic listing rules hide a deal after its stated expiry in Warsaw time — across the 2026-10-25 DST change too — keep undated deals, and never list a set's price as one game's. | "The model passed the eval once, so prompt edits are safe" — prompt v3 regressed. "A recorded model reply is ground truth." "The labels still match the rules" — they predate the set rule. | Which decisions the model makes and which deterministic code makes; the labelled set's composition, where its post texts live (they are not committed) and who can run it; how the eval scores through the pipeline's own row mapping; cost per run. | Unit on the listing rules with fixed model outputs + the existing eval as a required gate on prompt or model changes (AI-native). | Asserting the model's current replies. Mocking the model and calling it an extraction test. Running the paid eval on every commit. |
| #3 | A post is extracted once and never billed again on re-runs or re-sightings; one failing post or feed does not block the rest; a misconfigured run (bad cut-off, missing model, exhausted credit) fails loudly instead of recording an ok run; the deals view reports stale data once no ok run has landed for over 6 hours. | "A green run means a healthy pipeline" — 14 of 15 feeds failing stays green (`collector-into-repo-and-database` review F6). "An ok run means new deals arrived" (`physical-deals-from-real-posts` review F4). | The post state machine (attempts, processed marker, run records) and its write order; what makes a run red or ok; how freshness is computed and shown; which pipeline decisions are already pure with injected I/O (lessons.md). | Unit on the pure pipeline decisions with injected I/O + integration against a disposable database for idempotency and write order. | Mocking the database client and asserting call order (implementation mirror). Live feeds or a live model in a test. |
| #4 | Acting as user B and as a guest, every API-reachable table, view and function returns none of user A's watchlist entries or matched deals and refuses writes to them; an object shipped without explicit grants is unreachable by `anon` and `authenticated`; the pipeline role keeps exactly the writes it needs. | "RLS on means isolated" — execute grants on functions, security-invoker views and column grants are separate gates (review F3). "The proxy guards private pages, so the data is safe" — Server Actions and the Data API bypass it. "A local stub reproduces Supabase's default privileges" — they change on 2026-10-30. | Supabase's role model and default privileges; how the user's identity reaches the policies; which objects the Data API exposes, and to whom; the hand-run isolation and grants checks kept in `watchlist-from-catalog`. | Database integration as `anon`, user A, user B and the pipeline role, against the repo's migrations; the security advisors check stays on every push. | Testing with the secret key, which bypasses RLS. Happy path only (A sees own rows) without cross-user and guest negatives. |
| #5 | For posts with and without a shop link — and adversarial ones carrying `javascript:` or `data:` links, aggregator self-links or URLs absent from the post — the stored link is one of the post's own http(s) shop links or the aggregator post itself, and nothing else. | "The model copies links faithfully." "A URL-shaped string is a safe link." Whether rendering neutralises unsafe schemes is research's to verify, not to assume. | Where the link is chosen (model output versus a deterministic check); what is stored versus rendered; the existing scratch cases, as inputs only. | Unit, table-driven over adversarial inputs. | Only well-formed links. Expected values computed by the helper under test. |
| #6 | The access decision is right for every path and state (guest or signed in × `/`, `/login`, `/signup`, `/watchlist`, `/my-deals`, a Server Action POST); a redirect keeps the refreshed cookies; private responses are never cacheable; a failed sign-out leaves the browser and the server agreeing. | "The decision table passes, so the proxy enforces it" — the matcher and Server Actions sit outside the table. "Sign-out returned OK, so the server session is gone" (review F1). "A fresh login works, so sessions survive" — the refresh happens only after an hour idle. | The proxy matcher and the access decision; the session refresh flow with its cookie and cache-header handling; the planned switch of the session check (`infrastructure.md` register #6); the manual idle-session test. | Unit for the decision table + integration on the session refresh with a fake request; the browser round trip belongs to §3 Phase 5. | Mocking Supabase auth so that no refresh ever happens. One e2e test per access combination. |
| #7 | For a timeout, a network error, 401, 403, 429 and 5xx from the catalogue, the user sees the one generic "temporarily unavailable" message, the watchlist keeps working and the typed text can still be watched as a phrase; no thrown error, log line or response carries the request URL or the key; the browser bundle carries no server-only key. | "We never log the URL" — dev logging printed it (review F1). "Only a 200 matters" — no non-2xx response was ever observed live. "Server-only means not in the bundle." | Error translation at the catalogue boundary; logging configuration; the build output; how PRD Open Question 6 was resolved. | Unit with a stubbed fetch per failure + a build-output scan for server-only key names. | Asserting only the message text while the error object still carries the URL. Live calls to RAWG in a test (shared quota). |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Matching rule protection | Prove a matching-rule change cannot silently drop a watched game's deals or admit a sibling game — on PRD and acceptance examples, in SQL and in the TypeScript pre-check | #1 | runner bootstrap + database integration + unit + TS/SQL parity | researched | `context/changes/testing-matching-rule-protection/` |
| 2 | Extraction and listing guard | Prove a prompt or model change cannot raise digital leaks or wrong entries unnoticed, that listing and link rules hold on expiry, DST and adversarial posts, and that edits to the rule or the prompt run the fast suites | #2, #5 | unit + AI-native eval gate + post-edit hook | not started | — |
| 3 | Pipeline delivery and catalogue boundary | Prove one bad post or feed cannot stall delivery, no post is billed twice, stale data never reads as fresh, and catalogue failures degrade to the generic message without leaking the key | #3, #7 | unit + integration with stubbed boundaries + build-output scan | not started | — |
| 4 | Isolation and access | Prove no other user or guest can reach a user's watchlist or matched deals, and that session changes keep sign-in, sign-out and private-page caching correct | #4, #6 | database integration per role + unit + integration | not started | — |
| 5 | Main flow end to end | Prove the PRD's primary flow works in a real browser: guest redirect, sign-in, empty state, a watched phrase reaching `/my-deals` with price and link, removal, sign-out | #1, #4, #6 | e2e (one Playwright test) | not started | — |

Status vocabulary (parser literals): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section are grounded in local manifests and configs
plus the MCP/tools actually exposed in the session that wrote this plan.

Test base at writing: **none**. There is no runner config; the only two
test files belong to `.claude/skills`, not to the product. Ready case
lists exist in the slice plans, and some ran in scratch harnesses outside
the repository; they are input material, not oracles (§2 #2, #5).

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest — checked: 2026-10-12 | none yet — see Phase 1 | Covered by the bundled Next 16 testing guide. Use the `node` environment for rules and scripts. Async Server Components are not supported: keep logic in pure functions (lessons.md) and leave pages to e2e. |
| database | Disposable Postgres built from `supabase/migrations/`: PGlite (in-process, no Docker; already used to dry-run the hand-run SQL checks) or the local Supabase stack with pgTAP via `supabase test db` (needs Docker) — checked: 2026-10-12 | none yet — see Phase 1 | Phase 1 research picks one. Stub roles must reproduce Supabase's grants, or the tests lie. |
| boundary stubs | Stubbed `fetch` at the feed, OpenRouter and RAWG edges (MSW or a hand-written stub) | none yet — see Phase 3 | No automated test calls live feeds, the model or RAWG. |
| LLM regression (AI-native) | `npm run extract:eval` over 55 labelled posts — checked: 2026-10-12 | in repo | When NOT to use: changes that touch neither the prompt, the model list nor the extraction schema — the unit suite covers post-processing. Never per commit: it is paid, nondeterministic, and its post texts are not committed. |
| post-edit hook (AI-native) | Claude Code hook running the fast suites for the edited area — checked: 2026-10-12 | none yet — see Phase 2 | When NOT to use: as a CI substitute, or to run the paid eval. |
| e2e | Playwright — checked: 2026-10-12 | none yet — see Phase 5 | Covered by the bundled Next 16 testing guide. One flow only; it asserts behaviour, not layout (§7). |
| (optional) agent browser | Chrome DevTools MCP — checked: 2026-10-12 | n/a | When NOT to use: anything a deterministic test covers; never as a gate. Fits exploratory checks on production in a signed-in browser. |
| accessibility | none | — | UI is out of scope (§7). |

**Stack grounding tools (current session):**
- Docs: Context7 — Vitest (node environment, TypeScript without a separate compiler, no type-checking during runs), Supabase (pgTAP tests of RLS through `supabase test db` on the local stack), PGlite (WASM Postgres for Node); plus the Next 16 docs bundled in `node_modules/next/dist/docs/01-app/02-guides/testing/` (Vitest and Playwright guides; async Server Components → e2e); checked: 2026-10-12
- Search: Exa.ai not available in current session; WebSearch available but not used — the docs above answered every stack question; checked: 2026-10-12
- Runtime/browser: Chrome DevTools MCP available; Playwright MCP not available in current session; checked: 2026-10-12
- Provider/platform: no GitHub, Supabase or Vercel MCP in current session — not used; checked: 2026-10-12

Constraints every phase inherits: Node 24 (`.nvmrc`, `engines`), because
the `.mts` scripts rely on built-in type stripping; the collect job installs
with `--omit=dev`, so test tooling stays in devDependencies and never
reaches the job that holds the keys; dev and previews share the production
Supabase project, so there is no separate test database (Phase 5 research
decides where the e2e test runs and with which account).

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint (`--max-warnings 0`) + format check | local + CI `verify` | required (wired) | warnings-as-defects, unused code, formatting drift |
| typecheck | CI `deploy`, inside `vercel build` | required (wired) | type drift; it runs after `verify`, not before it |
| unit + database integration (`npm test`) | local + CI `verify` | required after §3 Phase 1 | matching, listing, link, pipeline and access regressions |
| migration-only changes run the suite | CI | required after §3 Phase 1 | a rule or grant migration merged untested; today `supabase/**` is in the CI `paths-ignore`, so such a push runs nothing |
| extraction eval on the labelled set | local, human-run (needs the OpenRouter key and the uncommitted post texts) | required before any prompt or model change, after §3 Phase 2 | digital leaks and wrong entries after a prompt or model change |
| post-edit hook | local (agent loop) | recommended after §3 Phase 2 | regressions in the matching rule and the listing rules at edit time |
| build-output secret scan | CI, after the build | required after §3 Phase 3 | server-only keys in the browser bundle |
| e2e on the main flow | CI (environment chosen in §3 Phase 5) | required after §3 Phase 5 | a broken sign-in → watchlist → `/my-deals` → sign-out path |
| security advisors (`npm run db:check`) | local, human-run, on every migration push | required (wired) | tables without RLS and other exposed objects |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test for a pure rule

- **Where:** `tests/unit/<area>/<rule>.test.ts`, collected by the `unit`
  project of `vitest.config.mts`. Reference: `tests/unit/watchlist/fold.test.ts`
  (table-driven classes and near misses); `tests/unit/watchlist/phrase-on-list.test.ts`
  (one row per input → boolean).
- **Run:** `npm test`, or `npm test -- --project unit`. Always through
  `npm test`, never `npx vitest`: `scripts/test.mts` starts Vitest from the
  canonical path, and Vitest 5.0.4 fails every file when started from a
  lowercase `c:\…` on Windows.
- **Rules:**
  - Expected values come from the PRD, the roadmap or a review finding, and
    each row's name cites its source. Never from running the code under test.
  - An equivalence class ("these spellings fold alike") needs a near miss
    that must stay apart, so a constant or over-eager function cannot pass.
  - Fixtures carry the non-ASCII input real posts carry: Polish letters, `ł`,
    curly apostrophes, "&". Spell an NFD or combining character as a `\u`
    escape, and check that the file holds no raw combining mark afterwards:
    an editing tool can compose it silently.
  - Import the code from `@/…` and `describe`/`expect`/`it` from `vitest`
    explicitly.
  - Test files are type-checked by `next build` and linted with
    `eslint --max-warnings 0`, as all other code is.
- Rollout Phase 2 (listing and link rules) and Phase 4 (access decision
  table) extend this section.

### 6.2 Adding a database test against the migrations

Two patterns. Both run in PGlite, built fresh from `supabase/migrations/` by
`tests/db/harness/database.ts`, and are collected by the `db` project
(`tests/db/**/*.test.ts`). Run with `npm test` or `npm test -- --project db`.

- **(a) A matching case** (an entry and a deal → shown or hidden) is a row
  in `supabase/checks/matching.sql`, not a new test file.
  `tests/db/matching.test.ts` runs the file unchanged and reads its report.
  - Add the fixture deal to section 2's VALUES, with a label.
  - Add the entry to A's or B's inserts, and update the "A adds N games…"
    report line.
  - Add the case to the sections 3/4 VALUES, with its `shown` and `hidden`
    arrays, and its oracle in the name (e.g. `V3:`, `F5:`).
  - Update that user's whole-view expected array, and case 29 when B must
    not see a deal of A's.
  - Keep one entry of each user's per deal: a broken case must not hide
    behind another entry's match.
  - Spell NFD input as a `\u` escape inside an `E''` string.
  - Run `npm test`, then run the file in the hosted SQL editor after the
    `db:push`. The hosted run, on PostgreSQL 17.6, is the authority.
- **(b) A property of the migration chain** is a Vitest test in `tests/db/`
  that calls `buildDatabase`. Reference: `tests/db/rule-change.test.ts`
  (seed, detectors, synthetic proof) and `tests/db/fold-parity.test.ts`
  (one query over a corpus).
  - A seed runs as the owner immediately before a named migration
    (`seed: { beforeVersion, run }`), and the build throws if that version
    does not exist. The stale-key detector sees only rows seeded before the
    first matching migration (`tests/db/fixtures/rule-change-seed.ts`).
  - Synthetic migrations (`extraMigrations`, dated after the real chain)
    prove a detector by breaking it. A change to `fold_for_matching` must
    refresh its copy in `tests/db/fixtures/fold-without-l-stroke.ts`.
  - `amcheck` belongs to the superuser: call it through `asSuperuser`, one
    statement per call, outside a transaction.
  - A check file following the report convention of
    `supabase/checks/matching.sql` runs through
    `runCheckFile` in `tests/db/harness/check-file.ts`. Rollout Phase 4 runs
    the isolation and grants checks this way.
- **Stub rules** (`tests/db/stub/`, self-tested by `tests/db/harness.test.ts`):
  - the migrations run as `migrator`, an owner that is not a superuser, so
    a missing grant fails here as it does hosted;
  - each migration runs under Supabase's default privileges of its own
    date, granted before `20261030000000` and revoked from it. The grants
    match the hosted `pg_default_acl`, checked 2026-10-13;
  - `@electric-sql/pglite` is pinned at exactly `0.5.9`.
- **Known gaps:**
  - PGlite runs PostgreSQL 18.6, the hosted project 17.6, including their
    Unicode tables. Syntax new in 18 passes here and fails at `db:push`.
  - The collation is C, under which `lower()` lowers ASCII only.
  - There is no PostgREST: a role switch is `set local role` with
    `request.jwt.claims`, as the SQL editor does it.
- **The local loop:** `npm test` runs before `npm run db:push`
  (CLAUDE.md, Database migrations). CI cannot gate a hand-applied
  migration; `.github/workflows/database-tests.yml` only runs the suite
  after the fact, for a push that touches `supabase/**` alone.

### 6.3 Changing the extraction prompt or model

- TBD — see §3 Phase 2 (prompt and model regression gate: when to run the
  eval, which thresholds block).

### 6.4 Adding a test at an external boundary (feeds, OpenRouter, RAWG)

- TBD — see §3 Phase 3 (stubbed-boundary failure pattern: no live calls,
  no key or URL in any error).

### 6.5 Adding to the e2e test

- TBD — see §3 Phase 5 (main-flow pattern: self-seeded from the public
  deals list, behaviour over layout).

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

- **2026-10-13, Phase 1 (matching rule protection):** The stale-key detector
  sees only rows seeded before the first matching migration. The F5 fix was
  the first real rule change it checked, and it flagged the deliberately
  incomplete draft. Two Windows traps surfaced: Vitest 5.0.4 started from a
  lowercase `c:` (hence `scripts/test.mts`), and NFD test input composed by
  an editing tool (hence the `\u` escapes).

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5, and the brief
accepted on 2026-10-12). Future contributors should respect these unless
the underlying assumption changes.

- **Kitchen sink** — a design showcase that answers 404 in production. Re-evaluate if it
  ever ships to users. (Source: Phase 2 interview Q5.)
- **UI look and layout** — no snapshots, visual diffs or multimodal screen
  review; the UI will change heavily after the MVP. What is listed and who
  sees it is tested below the UI and by the one e2e flow, which asserts
  behaviour, not layout. Re-evaluate when the post-MVP design settles.
  (Source: Phase 2 interview Q5.)
- **JSONL import** — a one-off migration of the old collector's data,
  already done. Re-evaluate if it is ever run again. (Source: Phase 2
  interview Q5.)
- **Alerting on a stopped pipeline** — no run for several hours, or GitHub
  disabling the schedule after 60 quiet days, is observability rather than
  a test; Risk #3 tests the user-facing freshness line and the run outcome
  instead. Re-evaluate when observability leaves the roadmap's Parked list.
  (Source: brief challenger pass, 2026-10-12.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-12
- Stack versions last verified: 2026-10-12
- AI-native tool references last verified: 2026-10-12

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
