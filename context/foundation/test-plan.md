# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-27

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
also cites the 14-day view as the truer churn signal. The refresh scan of
2026-10-15, same scope, found 59 commits in 30 days, again the whole
history (`.github/workflows/` 16, `supabase/migrations/` 12,
`scripts/extract/` 11, `src/lib/deals/` 6, `src/lib/auth/` 5,
`src/lib/watchlist/` 5, `supabase/checks/` 5, `scripts/collector/` 5), and
31 in 14 days (`scripts/extract/` 10, `supabase/migrations/` 9,
`.github/workflows/` 8), 10 of them on 2026-10-14 and 2026-10-15. §2 cites
both scans, each with its date.

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

Interview, 2026-10-15, for the refresh (Q4 asked for the first time,
because the test base is now `meaningful`):

- **Q1, worries most:** unchanged.
- **Q2, burned before:** unchanged; there has been no incident.
- **Q3, changed without confidence:** changed. The new tests settled the
  doubt, so the SQL matching rule and the extraction prompt are no longer
  changed without confidence.
- **Q4, under-tested:** nothing in particular.
- **Q5, do not spend on:** unchanged; see §7.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3). Slice names refer to the change
folders under `context/changes/`; F-numbers are findings in their reviews.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A change to the matching rule silently drops watched games' deals from `/my-deals`, or admits a different game — platform-pinned entries and phrases included — or the add-phrase check refuses a new phrase as already watched. | High | High | PRD US-01 AC1, Business Logic, Open Question 5 (at least 80% found, at most 5% wrong); roadmap S-04 Risk; `deals-matched-to-watchlist` review F1, F2 (the rule was corrected the day it shipped), F5 (fixed in `testing-matching-rule-protection`); `watchlist-from-catalog` review F4; interview Q1, Q2, Q3 (Q3 eased on 2026-10-15); hot-spot on 2026-10-12 `supabase/migrations/` — 6 commits/14d (2 touched the rule), `src/lib/watchlist/` — 4 commits/14d (1 touched the fold); on 2026-10-15 `supabase/migrations/` — 9 commits/14d, `src/lib/watchlist/` — 5 commits/14d |
| 2 | A prompt or model change quietly makes extraction worse — digital or key offers, non-deals or wrong prices get listed, real physical deals get dropped, a set's price reads as one game's — or a deal stays listed past its stated expiry, including when the stated date was written in a form the pipeline cannot read and is kept as undated. | High | High | PRD Guardrails (no digital edition), NFR (at most 5% wrong), US-01 AC3–AC4; roadmap S-01 Risk; `physical-deals-from-real-posts` evaluation (prompt v3 regression, digital leaks in a rejected model, expiry not measured because no labelled post states one) and sample review (2.9% wrong, set prices); `testing-extraction-and-listing-guard` research (the eval finished clean on leaks, fixed in the same change; the extractor runs from `main` without waiting for CI) and change log (the first passing eval record accepted a known model error: Mistral reads „do niedzieli” in a post of Wednesday 2026-10-21 as Monday 2026-10-26 instead of Sunday 2026-10-25, the day the clocks change, so such a deal stays listed 24 hours too long); interview Q1, Q3 (Q3 eased on 2026-10-15); hot-spot on 2026-10-12 `scripts/extract/` — 6 commits/14d, 2 of them to the prompt or its reply format (v1→v3), `src/lib/deals/` — 5 commits/14d; on 2026-10-15 `scripts/extract/` — 10 commits/14d, `src/lib/deals/` — 5 commits/14d |
| 3 | Collection or extraction stalls across several runs — a poison post, a withdrawn model, exhausted credit, most feeds failing — while runs stay green and the freshness line claims fresh data; posts older than the feeds' ~2-day window are lost, or a re-run bills a post twice. | High | High | PRD NFR (visible within 6 h), US-01 AC2, cost guardrail; roadmap F-02 Risk (~2-day feed retention); `physical-deals-from-real-posts` incident 2026-10-05 and review F1, F2, F4; `collector-into-repo-and-database` review F1, F6, F9; `testing-extraction-and-listing-guard` (a new stall path: the extractor refuses a prompt, schema or model change that has no new passing eval record); the collect workflow runs the default branch on a schedule without waiting for CI; CLAUDE.md (from 2026-10-30 a new table without explicit grants fails at write time with `42501`); interview Q1; hot-spot on 2026-10-12 `scripts/extract/` — 6 commits/14d, `.github/workflows/` — 11 commits/30d; on 2026-10-15 `scripts/extract/` — 10 commits/14d, `.github/workflows/` — 16 commits/30d |
| 4 | Another signed-in user or a guest reads or changes someone's watchlist entries or matched deals — through the Data API, a Server Action, or a database object shipped without explicit grants. (Abuse: authorization.) | High | Medium | PRD Guardrails and NFR (isolation, including by editing the address), Access Control; roadmap F-01 Risk ("the one guardrail whose failure is silent"); `deals-matched-to-watchlist` review F1, F3; `physical-deals-from-real-posts` Phase 2 grant finding and review F6; CLAUDE.md (Supabase default grants change on 2026-10-30; functions stay executable by `PUBLIC` unless revoked); `local-supabase-stack` research (sequences carry no explicit grants; the local CLI grants new objects automatically); hot-spot on 2026-10-12 `supabase/migrations/` — 8 commits/30d; on 2026-10-15 — 12 commits/30d |
| 5 | A deal's link leads somewhere other than the deal's origin — a URL the post never contained, a non-web scheme planted in a stranger's post, another aggregator or a lookalike site the post links to, or a different offer from the same post. (Abuse: untrusted input.) | High | Medium | PRD Guardrails (link), Business Logic (shop link, else the aggregator post); shape-notes (link worry); `physical-deals-from-real-posts` plan (the link rule's cases ran only in a scratch script outside the repo); `testing-extraction-and-listing-guard` plan (decision 2026-10-13: no shop allow-list and no lookalike detection); untrusted input (aggregator posts are written by strangers); interview Q3 (Q3 eased on 2026-10-15); hot-spot on 2026-10-12 `scripts/extract/` — 6 commits/14d, none of them to the link rule, so likelihood rests on the untrusted input and the scratch-only testing, not on churn; on 2026-10-15 — 10 commits/14d, one of them to the link rule (Phase 2's fix) |
| 6 | A session or access change logs users out, leaves a signed-out session alive on the server, opens a private view or action to guests, or lets a cache serve one user's page to another. | High | Medium | PRD Access Control; roadmap S-02 Risk; `email-password-accounts` review F1, F2, F5; `watchlist-from-catalog` change log (a guest's Server Action POST answered 200 and showed the error screen); `infrastructure.md` risk register #6, #8, #12 (#6, the switch of the session check, still open on 2026-10-15); `testing-main-flow-end-to-end` (the browser round trip shipped: the guest redirect and server-side sign-out revocation gate deploy); hot-spot on 2026-10-12 `src/lib/auth/` — 5 commits/30d, `src/utils/supabase/` — 4 commits/30d; unchanged on 2026-10-15 |
| 7 | A catalogue failure — outage, timeout, rate limit — shows a raw error or breaks the search on `/`, a game page or the watchlist instead of the one generic message, or the RAWG key, which rides in the request URL, leaks into a log, an error body or the browser bundle. (Abuse: secret leakage.) | Medium | Medium | PRD Open Question 6; `game-catalog-provider-proven` coverage (no non-2xx response ever observed); `watchlist-from-catalog` review F1 (dev logging printed the key) and change log (3 of ~15 searches timed out); `infrastructure.md` risk register #14; CLAUDE.md (key in the request URL); `testing-main-flow-end-to-end` (the server under the e2e test runs with a blank RAWG key) |

No High-impact × Low-likelihood row was padded in: alerting on a stopped
pipeline is observability, not a test (§7).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Deals for watched entries reach `/my-deals` and sibling games stay out, on the PRD's Silent Hill 2 example (pinned to PS5 vs unpinned), Switch 2 vs Switch, separate releases (Remake, Remastered, HD, year-numbered series) and phrase folding (case, Polish diacritics including ł, apostrophes, "&"). A rule change leaves no stale stored keys. Separately, the TypeScript pre-check folds exactly as the database does, so the add-phrase check never refuses a phrase the database treats as new; parity protects that check, not what `/my-deals` lists. | "TS and SQL agree, so the rule is right" — until review F5 was fixed, both twins folded an accent typed as a separate character the same wrong way ("Pokémon" → "poke mon"). "The hand-run truth table covers the rule" — review F2 escaped both it and the acceptance measurement. | Where the rule runs: all of it in the database — keys stored on deals, entry keys computed on every read, and the folded phrase index; the TS pre-check only predicts phrase duplicates. How to apply the repo's migrations to a disposable Postgres without Docker (the PGlite dry-runs of the hand-run checks). The grants each matching function needs, including the role whose deal insert computes the stored keys. The acceptance sample supplies inputs only — the 20 watched names, its 4 recorded misses and the sibling families kept apart; its deal titles were not kept, so expected values come from the PRD, roadmap S-04 and the review findings. | Database integration, table-driven, against the repo's migrations + unit for the TS fold + a TS/SQL parity check over a shared corpus. | Oracle problem: expected keys produced by running today's functions. ASCII-only fixtures. |
| #2 | On the labelled set, a prompt or model change yields zero digital or key offers among listed deals, no post newly missed and no new wrong game or price against the last committed passing run, over repeated runs because one run varies. The share of wrong listed entries stays at or below 5% on the sample review of random production posts, after the change runs; the 34 listable deals of the labelled set (23 real, 11 synthetic) cannot measure a share: they are not a random sample, and one error is 2.9%. A stated expiry becomes the right instant in Warsaw time, across the 2026-10-25 DST change too; the database's listing predicate hides an expired deal on both deals pages and an undated one stays; a stated date the pipeline cannot read, other than `H:MM`, stays undated, by decision (2026-10-13). A set's rows carry the set label whenever the set names other games. | "The model passed the eval once, so prompt edits are safe": prompt v3 regressed. "A recorded model reply is ground truth." "The labels measure the rules": only the 8 synthetic posts carry an expiry, a physical set or a shop link; the 55 real posts carry none, so expiry reading, set recognition and link choice are measured on tidy invented posts only. "The eval gates the change": it exits 1 on a breach and judges the production model list, and its record binds a pass to the prompt and labels fingerprints; a mismatch fails `npm test`, and a prompt mismatch also stops the extractor, while a labels-only change does not. "A green eval means expiry is right": the baseline accepts the failures it first recorded, the „do niedzieli” misread among them; only recorded failures can shrink, and a newly labelled item enters with whatever it fails. | Which decisions the model makes and which deterministic code makes; the labelled set's composition, where its post texts live (not committed, but re-exportable) and who can run it; how the eval scores through the pipeline's own row mapping (expiry excepted: it compares the model's raw text); cost per run; what could bind a passing run to the prompt and model it ran on. Grounded on 2026-10-13 in the Phase 2 research. | Unit on the row mapping, the expiry instant, listability and the set label with fixed model outputs + the eval as the wired gate on prompt, schema or model changes (AI-native) + the sample review for the 5% share + database integration on the listing predicate for hiding an expired deal. | Asserting the model's current replies. Mocking the model and calling it an extraction test. Running the paid eval on every commit. Asserting the page query's filter text through a fake client. |
| #3 | A post is extracted once and never billed again on re-runs or re-sightings; one failing post or feed does not block the rest; a misconfigured run (bad cut-off, missing model, exhausted credit) fails loudly instead of recording an ok run; the deals view reports stale data once no ok run has landed for over 6 hours. | "A green run means a healthy pipeline" — 14 of 15 feeds failing stays green (`collector-into-repo-and-database` review F6). "An ok run means new deals arrived" (`physical-deals-from-real-posts` review F4). "A red `verify` stops a bad pipeline change": it stops the deploy only; the cron runs whatever is on `main`. | The post state machine (attempts, processed marker, run records) and its write order; what makes a run red or ok; how freshness is computed and shown; which pipeline decisions are already pure with injected I/O (lessons.md); the extract step's refusal path, which stops before it reads a credential and writes no run record, so the scheduled run turns red in Actions while the app shows only the freshness line; which pipeline writes depend on explicit grants once Supabase's default privileges end on 2026-10-30. | Unit on the pure pipeline decisions with injected I/O + integration against a disposable database for idempotency and write order. | Mocking the database client and asserting call order (implementation mirror). Live feeds or a live model in a test. |
| #4 | Acting as user B and as a guest, every API-reachable table, view and function returns none of user A's watchlist entries or matched deals and refuses writes to them; an object shipped without explicit grants is unreachable by `anon` and `authenticated`; the pipeline role keeps exactly the writes it needs. | "RLS on means isolated" — execute grants on functions, security-invoker views and column grants are separate gates (review F3). "The proxy guards private pages, so the data is safe" — Server Actions and the Data API bypass it. "The harness's cut-off is production's" — the PGlite harness grants Supabase's default privileges by the migration's version, before 2026-10-30, while the hosted project grants them by when the table is created, so a migration dated before 2026-10-30 and pushed after it gets the default grants in the harness and none in production. | Supabase's role model and default privileges; how the user's identity reaches the policies; which objects the Data API exposes, and to whom; the hand-run isolation and grants checks kept in `watchlist-from-catalog`. Functions stay executable by `PUBLIC` unless revoked, and sequences carry no explicit grants; the local stack grants new objects automatically under CLI 2.117.0, so it is no grants oracle. | Database integration as `anon`, user A, user B and the pipeline role, against the repo's migrations; the security advisors check stays on every push. | Testing with the secret key, which bypasses RLS. Happy path only (A sees own rows) without cross-user and guest negatives. |
| #5 | For posts with and without an off-site link, and for adversarial ones carrying `javascript:` or `data:` links in any spelling, aggregator self-links, relative links or URLs absent from the post, the stored link is one of the post's own off-site http(s) links, copied exactly, or the aggregator post itself, and nothing else. On the page, a stored link with any other scheme falls back to the post, or to no link. A link to a collected aggregator's site is not a shop; a lookalike or an uncollected aggregator stays a kept off-site link, by decision (2026-10-13): there is no shop allow-list and no lookalike detection. | "The model copies links faithfully." "A URL-shaped string is a safe link." "Rendering neutralises unsafe schemes": React blocks `javascript:` but passes `data:`, so the app's own render check is the only barrier for `data:`, and the post's own link is stored from the feed unchecked. "The check picks the right offer": it proves the link is the post's, not the item's; pairing links with items in a multi-offer post is the model's job and is unmeasured. | Where the link is chosen (model output versus a deterministic check); what is stored versus rendered; the existing scratch cases, as inputs only. Grounded on 2026-10-13 in the Phase 2 research. | Unit, table-driven over adversarial inputs, from post HTML through to the rendered link choice. | Only well-formed links. Expected values computed by the helper under test. |
| #6 | The access decision is right for every path and state (guest or signed in × `/`, `/login`, `/signup`, `/my-deals`, `/watchlist` — the list's old address, which redirects to `/my-deals` or `/login` — a Server Action POST); a redirect keeps the refreshed cookies; private responses are never cacheable; a failed sign-out leaves the browser and the server agreeing. | "The decision table passes, so the proxy enforces it" — the matcher and Server Actions sit outside the table. "Sign-out returned OK, so the server session is gone" (review F1). "A fresh login works, so sessions survive" — the refresh happens only after an hour idle. | The proxy matcher and the access decision; the session refresh flow with its cookie and cache-header handling; the planned switch of the session check (`infrastructure.md` register #6), still pending on 2026-10-15, which would touch the session path; the manual idle-session test. | Unit for the decision table (shipped 2026-10-27 with `game-search-and-pages`: `tests/unit/auth/access.test.ts`) + integration on the session refresh with a fake request; the browser round trip shipped with §3 Phase 5: the guest redirect and server-side sign-out revocation gate deploy. | Mocking Supabase auth so that no refresh ever happens. One e2e test per access combination. |
| #7 | For a timeout, a network error, 401, 403, 429 and 5xx from the catalogue, the user sees the one generic "temporarily unavailable" message, the watchlist keeps working and the typed text can still be watched as a phrase; no thrown error, log line or response carries the request URL or the key; the browser bundle carries no server-only key. | "We never log the URL" — dev logging printed it (review F1). "Only a 200 matters" — no non-2xx response was ever observed live. "Server-only means not in the bundle." | Error translation at the catalogue boundary; logging configuration; the build output; how PRD Open Question 6 was resolved. | Unit with a stubbed fetch per failure + a build-output scan for server-only key names on the deploy build. The e2e server runs with a blank key: since `game-search-and-pages` (2026-10-27), `tests/e2e/search.spec.ts` and `tests/e2e/game-page.spec.ts` assert the message on `/` and on a game page, and unit tests stub the RAWG lookup per failure and check the cache's error text for the URL and the key (`tests/unit/catalog/rawg-game.test.ts`, `tests/unit/games/cached-catalog.test.ts`); the logs and the build output are still Phase 3's job. | Asserting only the message text while the error object still carries the URL. Live calls to RAWG in a test (shared quota). |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Matching rule protection | Prove a matching-rule change cannot silently drop a watched game's deals or admit a sibling game — on PRD and acceptance examples, in SQL and in the TypeScript pre-check | #1 | runner bootstrap + database integration + unit + TS/SQL parity | complete | `context/archive/2026-10-13-testing-matching-rule-protection/` |
| 2 | Extraction and listing guard | Prove a prompt or model change cannot raise digital leaks or wrong entries unnoticed, that listing and link rules hold on expiry, DST and adversarial posts, and that edits to the rule or the prompt run the fast suites | #2, #5 | unit + AI-native eval gate + post-edit hook | complete | `context/archive/2026-10-13-testing-extraction-and-listing-guard/` |
| 3 | Pipeline delivery and catalogue boundary | Prove one bad post or feed cannot stall delivery, no post is billed twice, stale data never reads as fresh, and catalogue failures degrade to the generic message without leaking the key into a log, an error or the deploy build | #3, #7 | unit + integration with stubbed boundaries + build-output scan | not started | — |
| 4 | Isolation and access | Prove no other user or guest can reach a user's watchlist or matched deals through the Data API or a Server Action, per role, and that the access decision, session refresh and private-page caching hold below the browser | #4, #6 | database integration per role + unit + integration | not started | — |
| 5 | Main flow end to end | Prove the PRD's primary flow works in a real browser: guest redirect, sign-in, empty state, a watched phrase reaching `/my-deals` with price and link, removal, sign-out | #1, #4, #6 | e2e (one Playwright test) | complete | `context/archive/2026-10-14-testing-main-flow-end-to-end/` |

Status vocabulary (parser literals): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

Scope after Phase 5 (2026-10-15):

- **Phase 3.** The e2e test passes through the catalogue-unavailable path
  without asserting its message. The pipeline's grants on `collected_posts`
  are proven in the database harness; those on `post_extractions`, `deals`
  and `pipeline_runs` are not. The build-output scan must scan the `deploy`
  job's build: the e2e build has a blank RAWG key and the local
  `NEXT_PUBLIC_*` values.
- **Phase 4.** The guest redirects and server-side sign-out revocation are
  covered by e2e. What remains is isolation per role (`anon`, user A,
  user B, the pipeline role), plus the access decision, session refresh and
  caching below the browser. The local stack (PostgreSQL 17 with GoTrue and
  PostgREST) is a candidate for Data API isolation checks beside PGlite. It
  is not a grants oracle while CLI 2.117.0 grants new objects
  automatically; Phase 4 research decides.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section are grounded in local manifests and configs
plus the MCP/tools actually exposed in the session that wrote this plan.

Test base at writing: **none**. There is no runner config; the only two
test files belong to `.claude/skills`, not to the product. Ready case
lists exist in the slice plans, and some ran in scratch harnesses outside
the repository; they are input material, not oracles (§2 #2, #5).

Test base at refresh (2026-10-15): **meaningful**. Vitest and Playwright
are configured, with 25 test files: unit 14, db 7, hooks 1, e2e 3. No unit
test covers auth, the collector or the catalogue.

Since `game-search-and-pages` (2026-10-27): e2e 5, with
`tests/e2e/game-page.spec.ts` and `tests/e2e/search.spec.ts`; unit tests
cover the catalogue (`tests/unit/catalog/`, `tests/unit/games/`) and the
access decision (`tests/unit/auth/access.test.ts`). The collector still has
none.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest — checked: 2026-10-15 | `^5.0.4` (5.0.4 installed) — Phase 1 | Covered by the bundled Next 16 testing guide. Use the `node` environment for rules and scripts. Async Server Components are not supported: keep logic in pure functions (lessons.md) and leave pages to e2e. |
| database | PGlite, in process, built fresh from `supabase/migrations/` — checked: 2026-10-15 | `0.5.9`, an exact pin — Phase 1 | Chosen in Phase 1. Its stub roles model Supabase's default privileges on both sides of 2026-10-30 (§6.2); stub roles that do not reproduce Supabase's grants make the tests lie. The local Supabase stack (Docker; PostgreSQL 17, GoTrue, PostgREST) has served dev and e2e since `local-supabase-stack`; it is no grants oracle while CLI 2.117.0 grants new objects automatically. |
| boundary stubs | Stubbed `fetch` at the feed, OpenRouter and RAWG edges (MSW or a hand-written stub) — checked: 2026-10-15 | none yet — see Phase 3 | No automated test calls live feeds, the model or RAWG. The only stub is a `fetch` tripwire in the e2e account tests, which proves that a refused target sends nothing; the e2e server's RAWG key is blank. |
| LLM regression (AI-native) | `npm run extract:eval` over 55 real and 8 synthetic labelled posts, each candidate model twice — checked: 2026-10-15 | in repo, wired (§5) | When NOT to use: changes that touch neither the prompt, the model list nor the extraction schema — the unit suite covers post-processing. Never per commit: it is paid and nondeterministic. Its post texts are not committed, but `scripts/extract/eval/export-posts.sql` re-exports them (§6.3). |
| post-edit hook (AI-native) | Claude Code hooks: lint and the fast suites for the edited area after each Edit or Write; lint, `npm test` and `tsc` at the end of the turn — checked: 2026-10-15 | three scripts, wired 2026-10-13 — Phase 2 | When NOT to use: as a CI substitute, or to run the paid eval. The per-edit hooks see only Edit and Write. The end-of-turn hook sees whatever is uncommitted when the agent stops, Bash and hand edits included, but not changes committed during the turn. Nothing runs outside an agent session. |
| e2e | Playwright, plus the `playwright-cli` skill for exploration — checked: 2026-10-15 | `^1.64.1` (1.64.1 installed) — Phase 5 | Covered by the bundled Next 16 testing guide. Five tests, run by the CI `e2e` job (§6.5): the auth setup, the seed, the main flow, and since `game-search-and-pages` (2026-10-27) the guest paths of a game page (`tests/e2e/game-page.spec.ts`) and of the search on `/` (`tests/e2e/search.spec.ts`) that hold with a blank RAWG key. One flow; the tests assert behaviour, not layout (§7), save that the search's overlay leaves the deals list where it was. |
| (optional) agent browser | Chrome DevTools MCP — checked: 2026-10-15 | n/a | When NOT to use: anything a deterministic test covers; never as a gate. Fits exploratory checks on production in a signed-in browser. |
| accessibility | none | — | UI is out of scope (§7). |

**Stack grounding tools (current session, refresh of 2026-10-15):**
- Docs: Context7 available, not re-queried: the checks of 2026-10-12 are three days old. They covered Vitest (node environment, TypeScript without a separate compiler, no type-checking during runs), Supabase (pgTAP tests of RLS through `supabase test db` on the local stack), PGlite (WASM Postgres for Node), plus the Next 16 docs bundled in `node_modules/next/dist/docs/01-app/02-guides/testing/` (Vitest and Playwright guides; async Server Components → e2e). Playwright 1.64.1 and Supabase CLI 2.117.0 were read from the installed packages; checked: 2026-10-15
- Search: WebSearch available but not used; Exa.ai not available in current session; checked: 2026-10-15
- Runtime/browser: Chrome DevTools MCP and the `playwright-cli` skill available; Playwright MCP not available in current session; checked: 2026-10-15
- Provider/platform: no GitHub, Supabase or Vercel MCP in current session — not used; checked: 2026-10-15

Constraints every phase inherits: Node 24 (`.nvmrc`, `engines`), because
the `.mts` scripts rely on built-in type stripping; the collect job installs
with `--omit=dev`, so test tooling stays in devDependencies and never
reaches the job that holds the keys. `npm run dev` and E2E run on the local
Supabase stack; previews and `npm run dev:hosted` reach the production
project. `next build` and `next start` are unguarded: the target guard runs
under `next dev`, in the e2e config and in the scripts. Agents ask before
`npm run local:reset`, which wipes local data and accounts, the E2E user
included.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint (`--max-warnings 0`) + format check | local + CI `verify` | required (wired) | warnings-as-defects, unused code, formatting drift |
| typecheck | CI `e2e` job's `next build` (beside `verify`, before `deploy`) and `deploy`'s `vercel build`; locally the end-of-turn hook's `tsc --noEmit` | required (wired); never yet proven red | type drift |
| unit + database integration (`npm test`) | local + CI `verify` | required (wired) | matching, listing and link regressions, and an eval record that no longer matches the prompt or the labels; pipeline and access regressions after §3 Phases 3 and 4 |
| migration-only changes run the suite | CI `database-tests.yml` on `supabase/**`, which `ci.yml` skips, E2E included; the gate is the local migration loop, `npm test` and then `npm run local:up` applying the migration before `db:push`, since `db:push` can reach production first | required (wired) | a rule or grant migration merged untested |
| extraction eval on the labelled set | local, human-run (needs the OpenRouter key and the uncommitted post texts) | required (wired): `npm test` fails on a fingerprint mismatch, and the extract step refuses a prompt mismatch | digital leaks and wrong entries after a prompt or model change |
| post-edit hook | local (agent loop) | wired; not a gate | regressions in the matching rule and the listing rules at edit time |
| build-output secret scan | CI, on the `deploy` job's build | required after §3 Phase 3 | server-only keys in the browser bundle |
| e2e on the main flow | CI `e2e` job, on a local stack with seed data, beside `verify`; `deploy` needs it | required (wired, proven red 2026-10-15); not a required status check in branch protection | a broken sign-in → search on `/` → `/my-deals` with its list → sign-out path |
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
- **Rules under `scripts/extract/`** (rollout Phase 2):
  - The tests live in `tests/unit/extract/` and import through a relative
    path with the real `.mts` name (`../../../scripts/extract/deals.mts`),
    types through a whole-statement `import type`.
  - Never import `extract.mts` or `eval.mts`: importing them runs their
    `main()`. Anything worth testing belongs in a module without one
    (`deals.mts`, `evaluation.mts`, `fingerprint.mts`).
  - A test from a hand-written `ExtractionOutput` is row mapping, not
    extraction: its suite says "row mapping (fixed model output)". Whether a
    model reads a post well is the eval's job (§6.3).
  - Expiry rows are literal UTC instants worked out from the EU summer-time
    rule (clocks change at 01:00 UTC on the last Sundays of March and
    October), on both sides of both changes, never computed by
    `expiryInstant` or a second implementation.
  - A table over untrusted input names its threat in each row (`XSS: a data:
    URL, which React does not block`), and covers encoded, padded and
    quoted variants, not only well-formed links.
  - When two conditions of a rule overlap, add a row only one of them
    catches: every own-site row of `verifyShopUrl` was also on
    `AGGREGATOR_SITES`, so dropping the own-site check stayed green until a
    row with an unlisted aggregator was added.
  - A list that must cover a configuration file gets a drift test reading
    that file (`scripts/collector/feeds.json` in `shop-url.test.ts`).
  - References: `tests/unit/extract/expiry.test.ts`,
    `tests/unit/extract/deal-rows.test.ts`,
    `tests/unit/extract/shop-url.test.ts`, `tests/unit/deals/links.test.ts`.
- Rollout Phase 4 (access decision table) extends this section. The table's
  first rows shipped with `game-search-and-pages`:
  `tests/unit/auth/access.test.ts`.

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
  - A grant has two privilege models to hold under: the hosted date model
    (the default) and none at all, as on a local stack whose CLI no longer
    grants new public objects. `defaultPrivilegesEnd`, a 14-digit version,
    moves the end of Supabase's default privileges for one build;
    `NO_DEFAULT_PRIVILEGES` builds the whole chain without them. Reference:
    `tests/db/collected-posts-grants.test.ts` (each allowed operation and
    each refusal, under both models).
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
- **The local loop:** `npm test`, then `npm run local:up`, which applies
  the migration to the local stack, run before `npm run db:push`
  (CLAUDE.md, Database migrations). CI cannot gate a hand-applied
  migration; `.github/workflows/database-tests.yml` only runs the suite
  after the fact, for a push that touches `supabase/**` alone.

### 6.3 Changing the extraction prompt or model

- **When the eval is required:** for any change the fingerprints in
  `scripts/extract/fingerprint.mts` see, and you do not have to work out
  which: `npm test` fails (`tests/unit/extract/eval-record.test.ts`) and
  names `npm run extract:eval`.
  - The prompt fingerprint covers what is sent to the model: the
    instructions, the aggregator descriptions and the post formatting
    (`prompt.mts`), the reply schema (`schema.mts`), `MODELS` with its order,
    `TEMPERATURE` and `MAX_TOKENS` (`config.mts`), the request body
    (`openrouter.mts`) and `PROMPT_VERSION`. A comment edit does not move it.
  - The labels fingerprint covers `scripts/extract/eval/labels.json` and
    `synthetic-posts.json`, as parsed JSON, so line endings do not matter.
  - The post-edit hook also reminds you after an edit to `prompt.mts`,
    `schema.mts`, `config.mts` or `openrouter.mts`.
  - Bump `PROMPT_VERSION` with any change to the instructions or the schema.
    The report is named `report-v<PROMPT_VERSION>.md`, so a run without the
    bump overwrites the last report.
- **Who can run it:** whoever has `OPENROUTER_API_KEY` in `.env.local` and
  the uncommitted `scripts/extract/eval/posts.json`. CI has neither. To
  rebuild `posts.json`, run `scripts/extract/eval/export-posts.sql` in the
  Supabase SQL editor and save its one cell as that file, following the
  file's header.
- **The run:** `npm run extract:eval` runs every model in `CANDIDATES` twice
  over the labelled posts (55 real, 8 synthetic): about $0.06 and 15–20
  minutes. The report's "Gate" section gives the verdict and every reason.
- **What blocks (exit 1),** judged for each model in `MODELS` and for each
  run on its own:
  - a leak: a listed item the label says is not a physical game;
  - a post left unmeasured, or a reply from a model other than the one
    asked;
  - a production model that was not evaluated;
  - an item, keyed `<postId>#<item index>`, with a gated failure its
    baseline entry lacks. The gated failures are `missed`, `wrongGame`,
    `price`, `expiry`, `set` and `link`. Currency, platform and discount are
    reported only.
- **The baseline** is the `record` of the committed
  `scripts/extract/eval/result.json`: per model and item, the failures the
  last passing run saw. Failures can only shrink. An item new to the record
  is accepted on first sight, with whatever it fails, and recorded. A model
  new to `MODELS` is held to the first model of the record. A model in
  `CANDIDATES` but not in `MODELS` may leak without blocking.
- **What to commit:** on a pass the eval writes `result.json`. Commit it in
  the same commit as the change. It is Prettier-ignored; do not reformat or
  edit it by hand.
- **A flaky fail:** rerun once and read the reasons. A reason that repeats
  is real. Do not relax the labels to get past it: a label states what the
  post says, not what the model replied.
- **When the extractor refuses:** `npm run extract`, and with it the
  "Extract deals" step of `.github/workflows/collect.yml`, aborts with
  "Extraction aborted: The prompt fingerprint differs from
  scripts/extract/eval/result.json…" before it reads a credential or sends
  anything. It also aborts when `result.json` is missing or records no pass.
  Collection keeps running and posts wait. The way out is a passing eval
  with its `result.json` committed, or reverting the change.
  `EXTRACT_PAUSED` only skips the step.
- **Adding a labelled post:**
  - A real one: add its label to `labels.json`, under the id of the post's
    representative row (its earliest sighting); add the id to
    `export-posts.sql`; re-export `posts.json`.
  - A synthetic one: add the post to `synthetic-posts.json` as
    `synthetic-NN`, invented and never copied from a real post, with shop
    links on `.example` hosts, and its label to `labels.json`.
  - Either way the labels fingerprint moves: run the eval and commit the
    new record.
- **What the eval does not measure:** the ≤5% share of wrong entries. That
  is measured after a change runs, by the sample review of production posts
  (`npm run extract:report:hosted`; `npm run extract:report` reads the
  local stack).
- **What the record is:** a speed bump, not proof. A hand edit of
  `result.json` defeats both checks.
- Proven 2026-10-14: with the edition rule inverted, the eval exited 1 on
  14 and 12 leaks and wrote no record.

### 6.4 Adding a test at an external boundary (feeds, OpenRouter, RAWG)

- TBD — see §3 Phase 3 (stubbed-boundary failure pattern: no live calls,
  no key or URL in any error).

### 6.5 Adding to the e2e test

- **Where:** `tests/e2e/`, one test per file, run by the `chromium` project
  after the `setup` project (`tests/e2e/auth.setup.ts`) has saved the E2E
  user's session. A new step of the PRD's main flow goes into
  `tests/e2e/main-flow.spec.ts`. A new file is only for a risk that needs a
  browser and that no cheaper layer covers (§1), and never one per access
  combination (§2 #6). References: `tests/e2e/main-flow.spec.ts` (risks #1,
  #4 and #6) and `tests/e2e/seed.spec.ts` (the smallest shape: a guest, no
  data). `tests/e2e/game-page.spec.ts` and `tests/e2e/search.spec.ts` cover
  a guest's game page and search on `/` with a blank RAWG key; each asks the
  catalogue for an id or a query fresh per run, because `next start` keeps
  the catalogue's answers under `.next/cache`, and one stored by a run with
  the real key would be served instead of the failure. The config and its
  commands are recorded in `context/foundation/test-stack.md`.
- **The pattern,** as `tests/e2e/main-flow.spec.ts` follows it:
  - **A fresh account per attempt.** A fixture creates it through
    `scripts/e2e/accounts.mts` (`uniqueTestEmail`, `testAccountPassword`,
    `createTestAccount`), deletes it after the test, and asserts with
    `findTestAccountId` that it is gone. Its watchlist rows go with it
    (`on delete cascade`). So the empty state holds by construction, and a
    retry or a parallel attempt never meets another attempt's entries. The
    address goes on the test as a `test-data` annotation. The password does
    not, though the report shows it in the fill step's title, as it shows
    everything a test types: a throwaway for the local stack, not a secret
    (CLAUDE.md, Secrets). The fixture's callback is not called `use`,
    because the React hooks lint rule takes that for React's `use()`. The
    module's pure parts are tested in `tests/unit/e2e/accounts.test.ts`.
  - **Its own sign-in when it signs out.** Sign-out uses `scope: "local"`
    and ends the session it is pressed in. So a spec that signs out opts
    out of the saved session, with
    `test.use({ storageState: { cookies: [], origins: [] } })` as
    `seed.spec.ts` does, and signs in itself. Clicked before it hydrates,
    the sign-in form submits natively, as a GET carrying both fields in the
    URL: first prove it interactive with an empty submit answered by
    „Podaj hasło.”, as `auth.setup.ts` does. „Wyloguj się” does nothing
    before hydration: press it inside `toPass` until the header offers
    „Zaloguj się”, and only while it is still there.
  - **Self-seeded from `/`, behaviour over layout.** The test takes the
    first deal card on `/` whose title has 3–100 characters (a watchable
    phrase) and appears on no other card: the `/my-deals` card is found by
    its title, and the snapshot lists different deals under one title. It
    records the title, the price text
    and the card's link targets, and expects them again on `/my-deals`. It
    names no deal and no seed row, so it passes on `supabase/seed.sql`
    alone (CI) and on the production snapshot. It asserts the matched
    card's presence, not a count: snapshot data may match more deals.
    Locators are roles, labels and the visible Polish text; there is no
    layout or screenshot assertion (§7).
  - **The phrase path, because the server under test has no RAWG key.**
    `playwright.config.ts` starts it with `webServer.env` setting
    `RAWG_API_KEY` to `""`, so a search on `/` shows „Katalog gier jest
    chwilowo niedostępny” and the phrase offer, in the overlay (the dialog
    „Wyniki wyszukiwania”). The test presses the phrase button by its full
    name, `Obserwuj frazę „<title>”`, so the step holds whatever the
    catalogue answers; a reused server may hold a key. It then waits for the
    offer to read „Ta fraza jest już na liście”, so the write has landed
    before it opens `/my-deals`, where the entry and its „Usuń” sit in the
    list below the matched deals. Auth, PostgREST, RLS and the proxy stay
    real, and there is no `page.route` mock. Catalogue failures are risk
    #7's, below the browser.
  - **Deliberate breaks, and no residue.** A new assertion counts once a
    break of the code it guards turns it red; revert the break at once.
    The main flow's two: `/my-deals` reading no rows
    (`loadMatchedDealsPage` in `src/lib/deals/queries.ts`) fails step 6,
    and a sign-out that clears only the browser's cookies fails step 9,
    where a new context replays the cookies from before sign-out. An
    assertion that fails on unbroken code is a finding: report it, and
    never weaken it. After every run, green or red, each attempt's
    annotated address must report "nothing to delete" through
    `E2E_USERNAME=<address> npm run e2e:account -- delete`.
- **Run:**
  - `npx playwright test` runs setup, then the seed, the main flow, the
    game page and the search;
    `npx playwright test tests/e2e/main-flow.spec.ts` runs one spec, and
    `--repeat-each=3` shows that parallel attempts do not collide. It
    builds and starts the app on the local stack's values from `.env.local`
    and refuses any other target in its own environment (`refuseE2eTarget`
    in `src/lib/env/supabase-target.ts`).
  - Free port 3000 first, or set `E2E_PORT`. Outside CI
    `reuseExistingServer` tests whatever already listens on the port,
    unchecked: `npm run dev` with the live RAWG key, or `npm run dev:hosted`
    against the hosted project.
  - Local data may be the production snapshot (`supabase/snapshot.sql`), so
    a new step has to hold on it and on the seed alone.
  - `npm run local:reset` deletes every local account, the E2E user among
    them. `npm run e2e:account -- create` restores it from `E2E_USERNAME`
    and `E2E_PASSWORD` in `.env.local`. When it reports "already exists",
    the account keeps its old password; `-- delete` first to change it.
  - `--headed` shows a run. UI mode (`--ui`) lists only the `setup` project
    until `chromium` is ticked, and runs headless.
    `npx playwright show-report` opens the last report.
- **CI:** the `e2e` job in `.github/workflows/ci.yml`, beside `verify`.
  - It runs `npm run local:start` and `npm run local:reset` in the runner
    (migrations plus `supabase/seed.sql`; CI has no snapshot). It writes a
    workspace `.env.local` from `supabase status -o env` through a filter
    that lets out three names, and appends a per-run E2E user
    (`e2e-setup-<run id>-<attempt>@example.com`, a generated password).
    Then it creates that user with `npm run e2e:account -- create`,
    installs Chromium and runs `npx playwright test`. It takes no secret.
  - `deploy` needs `verify` and `e2e`, so a red `e2e` stops the preview and
    the production deploy alike.
  - With `CI` set: `retries: 2` with `failOnFlakyTests`, so a test that
    passes only on a retry fails the run; one worker; a `globalTimeout` of
    15 minutes inside the job's 30; and the `next build` output in the log
    (`webServer.stdout: "pipe"`).
  - Every run that is not cancelled uploads `playwright-report/` as the
    `playwright-report` artifact, kept 14 days: a screenshot per failed
    attempt, plus the first retry's trace.
  - A break meant to prove the gate in CI must also pass `verify`
    (`eslint --max-warnings 0`). With `verify` red, `deploy` is skipped
    whatever `e2e` says, and the run proves nothing about `e2e`.
- **Known gaps:**
  - A push touching only `supabase/**` skips `ci.yml`, E2E included, by
    decision: `database-tests.yml` runs `npm test` for it, and E2E runs on
    the next push that runs `ci.yml`.
  - The CI build is not the shipped one. `next build` inlines the
    `NEXT_PUBLIC_*` values, so `e2e` builds its own copy against the local
    stack, and the shipped build runs once, inside `vercel build`.
  - The report artifact carries everything the tests typed, passwords
    included, in its step titles, and a traced retry adds request and
    response bodies: the local stack's publishable key, and the throwaway
    accounts' sign-in and tokens. Accepted, because they belong to a stack
    destroyed with the job.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

- **2026-10-13, Phase 1 (matching rule protection):** The stale-key detector
  sees only rows seeded before the first matching migration. The F5 fix was
  the first real rule change it checked, and it flagged the deliberately
  incomplete draft. Two Windows traps surfaced: Vitest 5.0.4 started from a
  lowercase `c:` (hence `scripts/test.mts`), and NFD test input composed by
  an editing tool (hence the `\u` escapes).
- **2026-10-14, Phase 2 (extraction and listing guard):**
  - `create or replace view` silently drops `security_invoker` unless the
    statement restates it. A term in a `security_invoker` view is visible
    only to a reader RLS does not bind, so `listed-expiry.sql` also reads the
    view as the table owner.
  - The eval had exited 0 on leaks. The fingerprint hashes the whole request
    body, because the instructions are not exported.
  - Hooks on Windows use exec form (`"command": "node"` with `args`). The
    lint hook starts ESLint and Prettier at once, so a test asserting their
    order passed on Windows and failed on Linux CI.
- **2026-10-15, Phase 5 (main flow end to end):**
  - Sign-out with `scope: "local"` also revokes the session on the server:
    the cookies from before sign-out, replayed in a new context, land on
    `/login`. With a sign-out that only cleared the browser's cookies, they
    still opened `/my-deals`.
  - The first CI break failed `verify` on unused parameters, so `deploy`
    was skipped for the wrong reason. The lint-clean break (`page + 1000`)
    proved that a red `e2e` alone keeps `deploy` from starting.
  - Measured on the first green pull request: `e2e` took 4 min 20 s beside
    `verify`'s 52 s, of which `local:start` took 2 min 06 s and
    `npx playwright test` 43 s (build and start 29 s, tests 11 s). A
    pipeline run, `deploy` included, lasts about 6 minutes, and `e2e` adds
    about 3.5 minutes beyond `verify`. The plan estimated 6–10 minutes for
    the job.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5, the brief
accepted on 2026-10-12, and the plans of rollout Phases 1, 2 and 5, from
2026-10-13 to 2026-10-15). Future contributors should respect these unless
the underlying assumption changes. The plans stated no re-evaluate
condition; the ones below were derived from each exclusion's reason at the
refresh of 2026-10-15.

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
- **Matching-rule exclusions (rollout Phase 1)** — decided in its plan.
  (Source: `testing-matching-rule-protection` plan, 2026-10-13.)
  - **The acceptance sample's four misses** (Dragon's Dogma 2 Dark Arisen
    ×3, the Fortnite bundle) are an accepted cost, with no test: the PRD
    promises no completeness, and 39 of 43 met the 80% bar. Re-evaluate if
    an acceptance measurement falls below the PRD's 80%.
  - **No normalisation beyond NFC.** NFKC would widen the rule ("Ⅶ" →
    "VII", fullwidth letters), which is a product decision of its own.
    Re-evaluate if the product decides to fold compatibility forms alike.
- **Extraction and link exclusions (rollout Phase 2)** — decided in its
  plan. (Source: `testing-extraction-and-listing-guard` plan, 2026-10-13.)
  - **No real posts added to the labelled set.** It grew by synthetic posts
    the agent wrote and Tomasz reviewed; they are tidier than real posts,
    so they prove less about messy input. Re-evaluate if the sample review
    finds a model error on real posts that the eval did not catch.
  - **No lookalike detection and no shop allow-list.** Code cannot tell
    `https://pepper.pl.evil.example/x` from a real shop, so a lookalike
    stays a kept off-site link. Re-evaluate if production data shows a
    lookalike or an uncollected aggregator stored as a shop link.
  - **No test of the page query's `.or()` filter.** The database's listing
    predicate is the tested layer; asserting the filter text through a fake
    client would mirror the implementation. Re-evaluate if the page ever
    reads deals with a key that bypasses RLS.
- **End-to-end exclusions (rollout Phase 5)** — decided in its plan.
  (Source: `testing-main-flow-end-to-end` plan, 2026-10-15.)
  - **No E2E against the hosted project.** It is production, and the test
    creates accounts through the admin API, with a key that bypasses RLS.
    Re-evaluate if a failure only the shipped build or the hosted project
    shows reaches users; a read-only guest smoke check after deploy is the
    cheapest next step.
  - **No catalogue path and no RAWG mock in E2E.** Risk #7 belongs to
    rollout Phase 3, below the browser. Re-evaluate when Phase 3 ships, if
    it leaves a gap only a browser shows.
  - **No E2E on pushes touching only `supabase/**`.** `database-tests.yml`
    runs `npm test` for them, and E2E runs on the next push that runs
    `ci.yml`. Re-evaluate if a migration breaks the main flow in a way
    `npm test` misses.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-15
- Stack versions last verified: 2026-10-15
- AI-native tool references last verified: 2026-10-15

Two dated events fall before the 2026-11-04 deadline: the DST change on
2026-10-25 (§2 #2) and Supabase's default-privileges change on 2026-10-30
(§2 #3, #4).

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
