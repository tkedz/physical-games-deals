---
project: physical-games-deals
version: 1
status: draft
created: 2026-09-21
updated: 2026-09-29
prd_version: 2
main_goal: speed
top_blocker: time
milestone_id: first-matched-physical-deals
milestone_seq: 1
milestone_status: open
---

# Roadmap: physical-games-deals

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.
>
> The PRD is written in Polish and stays that way. This roadmap is in English, matching
> the other derived documents in `context/` (`infrastructure.md`, `deploy-plan.md`).
> Requirement IDs (`FR-001`, `US-01`) are quoted verbatim from the PRD.

## Milestone

**M-1: First matched physical deals** — Status: open

- **Intent:** Prove the product's central claim end to end — that posts written by people, each one worded differently, can be turned automatically into a clean list of boxed-edition deals narrowed to the games a given user actually wants. That is the PRD's primary success criterion; nothing before it counts as the product working.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** every `F-NN` and `S-NN` below is `done`.
- **Scope anchors:** PRD v2 — `FR-001`, `FR-003`, `FR-004`, `FR-005`, `FR-006` (all must-have); `US-01` with its five acceptance criteria; the `## Access Control` section; the non-functional requirements on freshness, progress feedback, responsiveness and per-user isolation.

## Vision recap

A collector of boxed game editions currently tours several deal aggregators by hand every evening. Most of what they find is useless to them, because those sites treat keys and digital editions as first-class and the physical/digital distinction as an afterthought — and the posts are written freehand by people, so filtering them has meant reading them.

This product reverses that: it reads the posts so the collector does not, keeps only boxed editions, and shows only the games on that collector's own list, each with a price and a link back to where the deal came from.

The one trait that, if removed, would make this indistinguishable from any other deal feed is the pairing of two filters that no existing source combines: **physical-only**, decided from the wording of each post, and **matched to this user's own list of titles**, not to keywords or categories.

## North star

**S-01: A visitor sees physical-edition deals extracted from real collected posts** — the smallest slice that tests whether the automatic reading of freehand posts works at all, and whether digital editions stay out.

> "North star" here means the smallest end-to-end slice whose successful delivery would
> prove the core product idea — the claim the whole product rests on. It is placed as
> early as its Prerequisites allow, because every other slice only matters if this one
> works. Everything else in this roadmap (accounts, catalogue, watchlist) is well-trodden
> work whose outcome is not in doubt; the automatic reading of human-written posts is the
> part nobody has yet shown to work on this data.

Choosing it first also settles two of the PRD's open questions by doing rather than deciding: the PRD defers both the pipeline's v1 scope (question 2) and the acceptable share of wrong entries (question 3) to "after the first extraction run on real posts".

## At a glance

| ID   | Change ID                            | Outcome (user can …)                                                        | Prerequisites    | PRD refs                        | Status   |
| ---- | ------------------------------------ | --------------------------------------------------------------------------- | ---------------- | ------------------------------- | -------- |
| F-01 | `schema-migrations-and-rls-baseline` | (foundation) schema lives in repo migrations; every new table starts locked  | —                | Access Control, Guardrails, NFR | done |
| F-02 | `collector-into-repo-and-database`   | (foundation) collected posts land in the database, in this repository        | F-01             | Business Logic, NFR             | in-progress |
| F-03 | `game-catalog-provider-proven`       | (foundation) a catalogue provider is chosen and proven on real Polish titles | —                | FR-003, Business Logic          | in-progress |
| S-01 | `physical-deals-from-real-posts`     | see physical-edition deals extracted from real posts, with price and link    | F-01, F-02       | FR-005, FR-006, US-01           | in-progress |
| S-02 | `email-password-accounts`            | create an account with e-mail and password, sign in and sign out             | —                | FR-001, Access Control          | in-progress |
| S-03 | `watchlist-from-catalog`             | search the catalogue, add a game to a watchlist, remove one                  | F-01, F-03, S-02 | FR-003, FR-004, US-01           | blocked  |
| S-04 | `deals-matched-to-watchlist`         | see only the deals matching their own watchlist, platform rule applied       | S-01, S-03       | US-01, FR-005, Guardrails       | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                     | Chain                    | Note                                                                                                              |
| ------ | ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A      | Pipeline and first proof  | `F-01` → `F-02` → `S-01` | The north-star track. Under `main_goal: speed` it takes precedence on every tie.                                   |
| B      | Identity and watchlist    | `S-02` → `S-03` → `S-04` | `S-02` needs nothing and can start immediately, in parallel with all of Stream A. `S-04` joins Stream A at `S-01`. |
| C      | Game catalogue de-risking | `F-03`                   | Standalone; feeds `S-03` in Stream B. Independent of everything else, so it can run alongside any other item.      |

## Baseline

What's already in place in the codebase as of `2026-09-21` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next 16.3.5 App Router, React 19, Tailwind v4, shadcn/ui (`components.json`, `src/components/ui/button.tsx`) and Base UI. `src/app/page.tsx` is still the create-next-app landing page; no product screens exist.
- **Backend / API:** absent — no route handlers, no server actions. The only server-side entry point is `src/proxy.ts`, which exists solely to refresh the session.
- **Data:** partial — `@supabase/ssr`, `supabase-js` and the Supabase CLI are installed and `supabase/config.toml` is present, but there are no migrations and no tables at all.
- **Auth:** partial — all three Supabase clients are wired (`src/utils/supabase/client.ts`, `server.ts`, `session.ts`) and `src/proxy.ts` refreshes the session on every request. There are no sign-up or sign-in screens, no route protection, and no RLS policies (there is no schema to attach them to).
- **Deploy / infra:** present — `.github/workflows/ci.yml` runs `verify` (`npm run lint`, `npm run format:check`) gating a `deploy` job (`vercel pull` / `build` / `deploy --prebuilt`). Production is live at `physical-games-deals.vercel.app`, region `fra1`, Node 24.x.
- **Observability:** absent — no logging library, no error tracking, no metrics.
- **Deal collection (extra layer):** partial, and staged outside the build — `_incoming/cron-collector/` holds a working RSS collector: 15 enabled feeds across three aggregators (Pepper, Łowcy Gier, cenograj) and 659 raw posts in `data/raw.jsonl`, on a four-hourly Actions cron. The directory is gitignored, the cron runs in a different repository, it writes JSONL rather than a database, and nothing under `src/` imports it. `F-02` exists to close exactly that gap.

## Foundations

### F-01: Schema in migrations, with a locked-by-default posture

- **Outcome:** (foundation) the database schema lives in migrations inside this repository and can be reproduced on a fresh local database and applied to the hosted project; every table added from here on starts with row-level security on and no policy, so access has to be granted deliberately rather than remembered. The first migration — storage for collected source posts — lands as the proof that the path works.
- **Change ID:** `schema-migrations-and-rls-baseline`
- **PRD refs:** `## Access Control`; the guardrail "lista obserwowanych jednego użytkownika nigdy nie jest widoczna dla innego, również przez manipulację adresem"; the non-functional requirement on per-user isolation
- **Unlocks:** `F-02` (needs somewhere to write), `S-01`, `S-03`; reduces the risk that a user-owned table ships readable by everyone — the one guardrail whose failure is silent
- **Prerequisites:** —
- **Parallel with:** F-03, S-02
- **Blockers:** —
- **Unknowns:**
  - Data volume is undeclared (`target_scale.data_volume` is empty; PRD open question 4), and the raw-post set grows with time rather than with users. Owner: user. Block: no — the shape can be chosen now and revisited once weeks of collection exist.
- **Risk:** Sequenced first because nothing else can store anything, and because retrofitting row-level security onto tables that already hold data is where per-user isolation quietly fails. Kept deliberately thin: this is the migration path plus the default posture, not the product's schema. Each later slice brings its own tables.
- **Status:** done

### F-02: Collection moves into this repository and writes to the database

- **Outcome:** (foundation) the RSS collector runs from this repository on its schedule and appends collected posts to the database instead of a JSON file, with the 659 posts gathered so far imported. Deduplication behaves as it does today, so re-running changes nothing.
- **Change ID:** `collector-into-repo-and-database`
- **PRD refs:** `## Business Logic` (posts written by people are the product's only input); the non-functional requirement that a published deal is visible within 6 hours; the guardrail on processing cost not growing uncontrollably
- **Unlocks:** `S-01` — there is nothing to extract deals from until collected posts are queryable
- **Prerequisites:** F-01
- **Parallel with:** F-03, S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The code already works and the data already exists, so the risk is not in writing it but in the move: the collector currently lives in a gitignored staging directory and runs from a different repository. Two things can go wrong — the feed identifiers change during the move, which the collector's own README warns duplicates every past entry, and the schedule lapses in the gap between switching the old cron off and the new one on. RSS feeds here retain roughly two days, so a lapse loses those days permanently. Sequenced immediately after `F-01` for that reason, and kept to a move rather than a rewrite.
- **Status:** in-progress

### F-03: A catalogue provider is chosen and proven against real Polish titles

- **Outcome:** (foundation) one external game catalogue is selected, reachable with credentials, and checked against a handful of real boxed titles from the user's own list; a thin search call exists behind an interface the application can hold onto. The answer to "does this catalogue know the games this product is for" is on record either way.
- **Change ID:** `game-catalog-provider-proven`
- **PRD refs:** `FR-003`; `## Business Logic` ("tożsamość gry pochodzi z zewnętrznego katalogu gier"); PRD open questions 6 and 7
- **Unlocks:** `S-03`; resolves PRD open question 7 (Polish-market coverage) and gives open question 6 (behaviour when the catalogue is unreachable) something concrete to be decided against
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - Which provider — `.env.example` carries empty `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` slots and its comment leaves RAWG open. Owner: user. Block: no — choosing is this foundation's work. Answered 2026-09-26: RAWG — chosen by the user after a desk comparison with IGDB, as the simpler integration for a course project.
- **Risk:** The PRD calls the catalogue "the only external dependency on the main path of adding a game" and warns that its coverage sets the ceiling on how useful the product can be. If it does not know Polish boxed releases, the ruling that only catalogued games may be watched has to be reopened — and that reshapes `S-03` rather than merely delaying it. Sequenced early and cheaply for exactly that reason: the PRD itself says the check is a few queries for real titles. It has no prerequisites, so it can be done in an evening alongside anything else.
- **Status:** in-progress

## Slices

### S-01: A visitor sees physical-edition deals extracted from real collected posts

- **Outcome:** user opens the deals view and sees deals read automatically out of the collected posts — each one a game named by its original title, with its platform where the post states one, a price, a percentage discount where the post states one, and a link that goes to the shop, or to the aggregator post when the shop link is not in the text. Digital editions and key offers do not appear. A deal whose post gives an expiry date disappears after it; one without a date stays. The view states when the data was last refreshed.
- **Change ID:** `physical-deals-from-real-posts`
- **PRD refs:** `FR-005`, `FR-006`, `US-01` (acceptance criteria 3, 4 and 5); `## Business Logic`; the guardrails on digital editions not leaking and on links always resolving to the deal's origin; the non-functional requirements on responsiveness, visible progress and 6-hour freshness
- **Prerequisites:** F-01, F-02
- **Parallel with:** F-03, S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Whether v1 normalises posts from all three aggregators or collects from all three and normalises one (PRD open question 2). Owner: user. Block: no — the PRD defers it to after the first working extraction run, so this slice is what answers it.
  - What share of wrong entries is acceptable (PRD open question 3). Owner: user. Block: no — same reason; the PRD says it is decided by looking at the first results.
  - Which model does the extraction and at what cost per post — `.env.example` records that the choice was postponed to this point. Owner: user. Block: no. Answered 2026-09-29: `mistralai/mistral-small-3.2-24b-instruct` through OpenRouter, alone in `MODELS`, at about $0.0002 per post (prompt version 2). It had zero digital leaks on the 55-post labelled set, while `openai/gpt-4.1-nano` leaked in both runs — see `context/changes/physical-deals-from-real-posts/evaluation.md`.
- **Risk:** This is the only part of the product whose outcome is genuinely unknown, which is why it is the north star and why it sits as early as its prerequisites permit. Two things decide whether it works: whether freehand Polish posts yield a reliable physical-versus-digital reading — a judgement the catalogue cannot help with, since it identifies games and not editions — and whether extraction runs once per post and stays run, because re-reading the whole corpus on every pass is how the cost guardrail gets broken quietly. One known wrinkle to plan around: the feeds overlap and the collector deduplicates per feed by design, so the same deal arrives several times under different sources.
- **Status:** in-progress

### S-02: A collector creates an account and signs in

- **Outcome:** user registers with an e-mail address and a password, signs in, signs out, and is sent away from private views when not signed in. A prepared demo account can be handed to someone who wants to look at the product without building a watchlist of their own.
- **Change ID:** `email-password-accounts`
- **PRD refs:** `FR-001`; `## Access Control` (flat role model, no admin panel)
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, F-03, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The least uncertain slice in the milestone — the session plumbing is already wired and proven, so what remains is screens and route protection. Its value under a time constraint is that it depends on nothing at all and can fill any evening that the pipeline work leaves blocked. The one thing to get right is that signing out actually clears the session on the server and not only in the browser; the PRD's isolation guardrail is about what a URL can reach, not about what the interface shows.
- **Status:** in-progress

### S-03: A collector keeps a watchlist of games from the catalogue

- **Outcome:** user searches the external catalogue by title, adds a game to their watchlist and optionally pins it to one platform, sees their list, and removes an entry — which disappears from their view for good, while the record that they once tracked it survives in the data. Another user cannot reach that list, including by editing the address.
- **Change ID:** `watchlist-from-catalog`
- **PRD refs:** `FR-003`, `FR-004`; `US-01`; `## Business Logic` (game identity comes from the catalogue, platform is a separate optional value); the guardrail on watchlist isolation
- **Prerequisites:** F-01, F-03, S-02
- **Parallel with:** F-02, S-01
- **Blockers:** —
- **Unknowns:**
  - What the user sees when the catalogue does not answer while they are searching (PRD open question 6). Owner: user. Block: yes — the PRD states it is "do rozstrzygnięcia przed implementacją FR-003", and the catalogue sits on the main path of adding a game, so the slice has no defined behaviour for its most likely failure until this is answered.
  - Whether the chosen catalogue covers the Polish boxed titles this product exists for (PRD open question 7). Owner: user. Block: yes — a negative answer reopens the ruling that only catalogued games may be watched, which changes what this slice builds rather than when. `F-03` resolves it. Resolved by F-03 on 2026-09-26: PASS.
- **Risk:** Marked blocked rather than merely risky because both unknowns change the slice's shape, not its timing, and one of them the PRD explicitly puts before implementation. Both are cheap to resolve and `F-03` resolves the harder one, so this is a short block, not a stalled slice. Sequenced after `S-02` because the list belongs to a user, and after `F-01` because isolation here is enforced by the database rather than by application code.
- **Status:** blocked

### S-04: The deals list narrows to the collector's own watchlist

- **Outcome:** user opens the deals view and sees only deals for games on their watchlist. A watchlist entry pinned to a platform admits only that platform's offers; an entry with no platform admits any. When nothing matches, the view says so and states when the data was last refreshed, so an empty list reads as "no deals" rather than "something is broken".
- **Change ID:** `deals-matched-to-watchlist`
- **PRD refs:** `US-01` and its acceptance criteria 1 and 2; `FR-005` (the matching half); `## Business Logic` (the second of the two filtering decisions); the guardrail on one user's matched deals never reaching another
- **Prerequisites:** S-01, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - No number has been set for what counts as the matching working well enough — how many hits on a watchlist in the first week (PRD open question 5). Owner: user. Block: no; the PRD records it as non-blocking.
  - Deals carry titles, not catalogue ids. S-01 stores each deal's original title and the alternative titles its post uses, with no RAWG call (`context/changes/physical-deals-from-real-posts/plan.md`), so whether this slice resolves them to a RAWG `id` or matches by name is decided here, together with the edition and platform rules. Owner: user. Block: no — the titles are stored either way.
- **Risk:** The slice that completes the PRD's primary success criterion, and the only one depending on both tracks, so it is last by necessity rather than by choice. The load-bearing detail is that one absent platform means "any platform" while a present one means "only this one" — a single field with two behaviours, which the PRD's own example (Silent Hill 2 with and without PS5) exists to pin down. Worth building against that example directly.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                            | Suggested issue title                                           | Ready for `/10x-plan` | Notes                                                            |
| ---------- | ------------------------------------ | --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| F-01       | `schema-migrations-and-rls-baseline` | Put the schema in repo migrations, locked by default             | yes                   | Run `/10x-plan schema-migrations-and-rls-baseline` — unlocks S-01 |
| F-02       | `collector-into-repo-and-database`   | Move the RSS collector into this repo and write to the database  | no                    | Waits on F-01                                                     |
| F-03       | `game-catalog-provider-proven`       | Choose a game catalogue and prove its Polish coverage            | yes                   | No prerequisites — can run alongside anything                     |
| S-01       | `physical-deals-from-real-posts`     | Show physical-edition deals extracted from collected posts       | no                    | Waits on F-01, F-02. This is the north star                       |
| S-02       | `email-password-accounts`            | E-mail and password accounts with sign-in and sign-out           | yes                   | No prerequisites — fills an evening blocked on the pipeline       |
| S-03       | `watchlist-from-catalog`             | Watchlist of catalogue games, with optional platform             | no                    | Blocked on PRD open questions 6 and 7                             |
| S-04       | `deals-matched-to-watchlist`         | Narrow the deals list to the user's watchlist                    | no                    | Waits on S-01 and S-03. Completes the primary success criterion   |

## Open Roadmap Questions

1. **Product name** — deliberately unresolved; the PRD's `project` frontmatter still carries a TODO placeholder while this roadmap uses the repository name. Owner: user. Block: none.
2. **v1 pipeline scope: collecting versus normalising** — collect from all three aggregators but normalise one, or normalise everything collected. Bears directly on extraction tuning cost and on the same deal arriving from several sources. Owner: user. Block: `S-01` (non-blocking — answered by running S-01).
3. **Cleanliness threshold** — the acceptable share of entries that do not belong (digital editions, wrong game). Without a number there is no way to say the filter works. Owner: user. Block: `S-01` (non-blocking — answered by looking at S-01's output).
4. **Data volume** — undeclared; the raw-post set grows with time regardless of user count. Owner: user. Block: `F-01` (non-blocking).
5. **A measurable primary success criterion** — the PRD's criteria are binary; no number has been set for when matching is good enough. Owner: user. Block: `S-04` (non-blocking).
6. **Behaviour when the catalogue is unreachable** — what the user sees when the catalogue does not answer during a search. Owner: user. Block: **`S-03` (blocking)** — the PRD places it before implementing `FR-003`.
7. **Catalogue coverage of the Polish market** — whether the chosen catalogue knows the titles a Polish collector of boxed editions cares about. The ruling that only catalogued games may be watched makes this coverage the ceiling on the product's usefulness. Owner: user. Block: **`S-03` (blocking)** — `F-03` resolves it. **Answered 2026-09-26: PASS.** All 12 of the user's titles were found within the first five results, both Polish names included — see `context/changes/game-catalog-provider-proven/coverage.md`.
8. **Is the old collector still running?** — surfaced by the baseline probe, not by the PRD. The collector runs from a different repository; these feeds retain roughly two days, so if it has been switched off, every day until `F-02` lands is lost permanently. Owner: user. Block: none — but the answer sets how urgent `F-02` is. **Answered 2026-09-23: yes, it ran throughout.** Confirmed against the data rather than from memory — the export staged for `F-02`'s import runs from 2026-09-16 to 2026-09-23 without a gap, so no collection days were lost between the baseline probe and the move into this repository.
9. **Watching keywords, not only catalogued games** — the user's idea (2026-09-26): besides games identified in the catalogue, let a user watch a keyword. It contradicts the PRD's ruling "Gra nieobecna w katalogu nie może zostać dodana do listy obserwowanych" (`prd.md:98`). `F-03` supplies the evidence: Fire Emblem: Fortune's Weave, a new release offered in collected posts, is not in RAWG — the catalogue lags new releases. Owner: user. Block: `S-03` (non-blocking — `F-03`'s verdict is PASS, so the ruling stands unless the user reopens it; a yes changes the shape of `S-03` and the matching in `S-04`).

## Parked

- **Marking a watched game as purchased** (`FR-007`) — Why parked: nice-to-have in the PRD, and not needed for the main flow. Under `main_goal: speed` it is deferred rather than sequenced late.
- **A per-game view of all offers found** (`FR-009`) — Why parked: nice-to-have; the PRD itself says it "wchodzi po domknięciu głównego przepływu, jeśli zostanie czas".
- **Querying shops for prices or availability** — Why parked: PRD `## Non-Goals`. Posts written by people are the only input; the price comes from the post and is not verified at the source.
- **Identifying a specific edition of a game** — Why parked: PRD `## Non-Goals`. The game is recognised, not its edition, region or box contents.
- **Judging whether a price is good** — Why parked: PRD `## Non-Goals`. Lowest-seen price returns to consideration only once several weeks of collection exist.
- **Notifications by e-mail or push** — Why parked: PRD `## Non-Goals`. The user opens the application themselves; this knowingly leaves one of the three layers of pain unaddressed.
- **Promising completeness** — Why parked: PRD `## Non-Goals`. A quality exclusion, not a functional one — some posts will be misread and some will never reach a source.
- **An admin panel** — Why parked: PRD `## Access Control` puts source lists and processing rules outside the interface in the MVP.
- **Observability beyond the user-facing freshness timestamp** — Why parked: the baseline reports none, and no requirement forces it. `US-01`'s "when was this last refreshed" is covered inside `S-01`. Under `top_blocker: time`, proper logging and error tracking wait.

## Milestone History

(Append-only. Carried forward verbatim into each successor milestone's roadmap; empty on the very first milestone.)

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)
