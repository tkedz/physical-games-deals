---
project: physical-games-deals
version: 2
status: draft
created: 2026-09-21
updated: 2026-10-27
prd_version: 2
main_goal: speed
top_blocker: time
milestone_id: public-game-pages
milestone_seq: 2
milestone_status: open
---

# Roadmap: physical-games-deals

> Derived from `context/foundation/prd.md` (v2), the intent recorded in `context/changes/game-search-and-pages/` (`change.md`, `frame.md`) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.
>
> The PRD is written in Polish and stays that way. This roadmap is in English, matching
> the other derived documents in `context/` (`infrastructure.md`, `deploy-plan.md`).
> Requirement IDs (`FR-001`, `US-01`) are quoted verbatim from the PRD.
>
> M-1's items (`F-01`–`F-03`, `S-01`–`S-04`) stay below with status `done`, and numbering
> continues from them, so an ID never names two items. The PRD (`prd.md:76`, `:100`) and the
> test plan (`test-plan.md:82-87`, `:97`) cite those items and Open Roadmap Question 9 by ID.

## Milestone

**M-2: Game pages and catalogue search for everyone** — Status: open

- **Intent:** Give anyone, signed in or not, a page per catalogue game that lists every listed deal matching it, and a catalogue search on the front page that leads there — without public traffic exhausting the shared catalogue quota. Watching stays the one thing that needs an account, and the watchlist moves in with the matched deals. This is the PRD's per-game view (`FR-009`), whose precondition — "po domknięciu głównego przepływu" — M-1 met.
- **Source materials:** `context/foundation/prd.md` (v2, the next tranche: `FR-009`); Tomasz's intent of 2026-10-26 in `context/changes/game-search-and-pages/change.md`, narrowed by his answers in `frame.md` (Narrowing Signals).
- **Done when:** every `F-NN` and `S-NN` below is `done`.
- **Scope anchors:** PRD v2 — `FR-009` (nice-to-have; leaves `## Parked`). From the user's description, verbatim intent in `change.md`, narrowed in `frame.md`:
  - MS-01: The game search moves out of `/watchlist` onto the front page, above the deals list. Anyone may search; its results open in an absolutely positioned container that does not shift the list, and `/` stays the public list of every deal.
  - MS-02: A signed-in user adds a game — or the typed text as a phrase, optionally pinned to a platform — to the watchlist straight from that search. For a visitor, watching leads to sign-in.
  - MS-03: Clicking a game opens its own public page, which shows the listed deals matched to that game without watching it. If time runs short, this is the part that ships.
  - MS-04: The search and the game page show an image of the game from the catalogue — any image, not necessarily the box cover — and every page showing catalogue data carries the catalogue's credit.
  - MS-05: The watchlist merges into `/my-deals`; `/watchlist` goes away behind a redirect.

## Vision recap

A collector of boxed game editions currently tours several deal aggregators by hand every evening. Most of what they find is useless to them, because those sites treat keys and digital editions as first-class and the physical/digital distinction as an afterthought — and the posts are written freehand by people, so filtering them has meant reading them.

This product reverses that: it reads the posts so the collector does not, keeps only boxed editions, and shows only the games on that collector's own list, each with a price and a link back to where the deal came from.

The one trait that, if removed, would make this indistinguishable from any other deal feed is the pairing of two filters that no existing source combines: **physical-only**, decided from the wording of each post, and **matched to this user's own list** — catalogue titles, plus phrases of their own where the catalogue falls short — not to shared categories.

## North star

**S-05: Anyone opens a game's page with its matching deals, found from a search on the front page** — the milestone's only slice. Its game page comes first inside it, because that is the part whose shape is genuinely new: a public way to read matched deals, which today exist only per signed-in user.

> "North star" here means the smallest end-to-end slice whose successful delivery would
> prove the milestone's idea — the claim the rest of it rests on. It is placed as early as
> its Prerequisites allow, because everything else in the milestone only matters if this
> works. The search on the front page, the merged watchlist and the images are relocation
> and presentation over parts that exist; a public per-game match path, and a catalogue
> that survives public traffic, are not.

M-1's north star was `S-01`, the automatic reading of freehand posts; it is `done`.

## At a glance

| ID   | Change ID                            | Outcome (user can …)                                                        | Prerequisites    | PRD refs                        | Status   |
| ---- | ------------------------------------ | --------------------------------------------------------------------------- | ---------------- | ------------------------------- | -------- |
| F-01 | `schema-migrations-and-rls-baseline` | (foundation) schema lives in repo migrations; every new table starts locked  | —                | Access Control, Guardrails, NFR | done |
| F-02 | `collector-into-repo-and-database`   | (foundation) collected posts land in the database, in this repository        | F-01             | Business Logic, NFR             | done |
| F-03 | `game-catalog-provider-proven`       | (foundation) a catalogue provider is chosen and proven on real Polish titles | —                | FR-003, Business Logic          | done |
| S-01 | `physical-deals-from-real-posts`     | see physical-edition deals extracted from real posts, with price and link    | F-01, F-02       | FR-005, FR-006, US-01           | done |
| S-02 | `email-password-accounts`            | create an account with e-mail and password, sign in and sign out             | —                | FR-001, Access Control          | done |
| S-03 | `watchlist-from-catalog`             | search the catalogue, add a game or a phrase to a watchlist, remove one      | F-01, F-03, S-02 | FR-003, FR-004, FR-010, US-01   | done |
| S-04 | `deals-matched-to-watchlist`         | see only deals for the games and phrases they watch, platform rule applied   | S-01, S-03       | US-01, FR-005, FR-010, Guardrails | done |
| S-05 | `game-search-and-pages`              | open any catalogue game's page and see its matching deals, found from a search on `/`; watch from there, manage the list in `/my-deals` | S-01, S-03, S-04 | FR-009, FR-003, FR-004, FR-010, MS-01–MS-05 | in-progress |

## Baseline

What's already in place in the codebase as of `2026-10-26` (auto-researched for M-2; M-1's baseline of 2026-09-21 is in git history).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next 16.3.5 App Router, Tailwind v4, shadcn/ui (eleven components in `src/components/ui/`) and Base UI 1.8.0. Product routes: `/` (the public, paged deals list), `/my-deals`, `/watchlist` (catalogue search and the list on one page), `/login`, `/signup`. There is no popover or overlay component yet, and nothing renders an image.
- **Backend / API:** present — Server Components read Supabase; Server Actions add and remove watchlist entries (`src/app/(app)/watchlist/actions.ts`). The catalogue is reached only through `src/lib/catalog/rawg.ts` behind a server-only wrapper, by signed-in users only. Nothing caches, throttles or retries catalogue calls, and the catalogue contract has a search call and no lookup of one game.
- **Data:** present — 15 migrations in `supabase/migrations/`: collected posts, extractions, deals, pipeline runs and watchlist entries, every table locked by default. Matching lives in Postgres: a view of the deals matching the signed-in caller's watchlist, and matching functions granted to signed-in users only. No public per-game match path exists.
- **Auth:** present — e-mail and password accounts; `src/proxy.ts` with `src/lib/auth/access.ts` keeps `/watchlist` and `/my-deals` private; per-user rows sit behind row-level security.
- **Deploy / infra:** present — `.github/workflows/ci.yml` gates `deploy` (Vercel Hobby, `fra1`) on `verify` (lint, format, `npm test`) and `e2e` (Playwright against a local Supabase stack); `collect.yml` collects and extracts every four hours; `database-tests.yml` runs the database test suite on every push that touches the schema. Development runs against a local Supabase stack on Docker.
- **Observability:** partial — the pipeline records each run in a table, and the deals views' freshness line reads it. Server-side failures go to `console.error`, which Hobby keeps for one hour. No error tracking, no metrics.
- **Deal collection (extra layer):** present — the collector runs from this repository and writes to the database (`F-02`, done).

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
- **Status:** done

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
- **Status:** done

## Slices

### S-01: A visitor sees physical-edition deals extracted from real collected posts

- **Outcome:** user opens the deals view and sees deals read automatically out of the collected posts — each one a game named by its original title, with its platform where the post states one, a price, a percentage discount where the post states one, and a link that goes to the shop, or to the aggregator post when the shop link is not in the text. Digital editions and key offers do not appear. A deal whose post gives an expiry date disappears after it; one without a date stays. The view states when the data was last refreshed.
- **Change ID:** `physical-deals-from-real-posts`
- **PRD refs:** `FR-005`, `FR-006`, `US-01` (acceptance criteria 3, 4 and 5); `## Business Logic`; the guardrails on digital editions not leaking and on links always resolving to the deal's origin; the non-functional requirements on responsiveness, visible progress and 6-hour freshness
- **Prerequisites:** F-01, F-02
- **Parallel with:** F-03, S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Whether v1 normalises posts from all three aggregators or collects from all three and normalises one (PRD open question 2). Owner: user. Block: no — the PRD defers it to after the first working extraction run, so this slice is what answers it. Answered 2026-10-06: all three are normalised. Extraction costs about $0.0002 a post, and the same deal from two aggregators affects 48 of 868 listed games (5.5%); those stay separate cards, and merging them is not part of v1 — see `context/archive/2026-09-28-physical-deals-from-real-posts/review.md`.
  - What share of wrong entries is acceptable (PRD open question 3). Owner: user. Block: no — same reason; the PRD says it is decided by looking at the first results. Answered 2026-10-06: up to 5% of the listed deals. The first random sample measured 2.9% (2 of 68 listed deals, both carrying a two-game set's price; no digital edition) — see `review.md`.
  - Which model does the extraction and at what cost per post — `.env.example` records that the choice was postponed to this point. Owner: user. Block: no. Answered 2026-09-29: `mistralai/mistral-small-3.2-24b-instruct` through OpenRouter, alone in `MODELS`, at about $0.0002 per post (prompt version 2). It had zero digital leaks on the 55-post labelled set, while `openai/gpt-4.1-nano` leaked in both runs — see `context/archive/2026-09-28-physical-deals-from-real-posts/evaluation.md`.
- **Risk:** This is the only part of the product whose outcome is genuinely unknown, which is why it is the north star and why it sits as early as its prerequisites permit. Two things decide whether it works: whether freehand Polish posts yield a reliable physical-versus-digital reading — a judgement the catalogue cannot help with, since it identifies games and not editions — and whether extraction runs once per post and stays run, because re-reading the whole corpus on every pass is how the cost guardrail gets broken quietly. One known wrinkle to plan around: the feeds overlap and the collector deduplicates per feed by design, so the same deal arrives several times under different sources.
- **Status:** done

### S-02: A collector creates an account and signs in

- **Outcome:** user registers with an e-mail address and a password, signs in, signs out, and is sent away from private views when not signed in. A prepared demo account can be handed to someone who wants to look at the product without building a watchlist of their own.
- **Change ID:** `email-password-accounts`
- **PRD refs:** `FR-001`; `## Access Control` (flat role model, no admin panel)
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, F-03, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The least uncertain slice in the milestone — the session plumbing is already wired and proven, so what remains is screens and route protection. Its value under a time constraint is that it depends on nothing at all and can fill any evening that the pipeline work leaves blocked. The one thing to get right is that signing out actually clears the session on the server and not only in the browser; the PRD's isolation guardrail is about what a URL can reach, not about what the interface shows.
- **Status:** done

### S-03: A collector keeps a watchlist of games from the catalogue

- **Outcome:** user searches the external catalogue by title, adds a game or a phrase to their watchlist and optionally pins it to one platform, sees their list, and removes an entry — which disappears from their view for good, while the record that they once tracked it survives in the data. A phrase covers what the catalogue does not know, such as a new release. Another user cannot reach that list, including by editing the address.
- **Change ID:** `watchlist-from-catalog`
- **PRD refs:** `FR-003`, `FR-004`, `FR-010`; `US-01`; `## Business Logic` (game identity comes from the catalogue, platform is a separate optional value); the guardrail on watchlist isolation
- **Prerequisites:** F-01, F-03, S-02
- **Parallel with:** F-02, S-01
- **Blockers:** —
- **Unknowns:**
  - What the user sees when the catalogue does not answer while they are searching (PRD open question 6). Owner: user. Block: yes — the PRD states it is "do rozstrzygnięcia przed implementacją FR-003", and the catalogue sits on the main path of adding a game, so the slice has no defined behaviour for its most likely failure until this is answered. Answered 2026-10-06: whatever the reason, one generic message says the catalogue is temporarily unavailable; the list keeps working, and the typed text can still be watched as a phrase.
  - Whether the chosen catalogue covers the Polish boxed titles this product exists for (PRD open question 7). Owner: user. Block: yes — a negative answer reopens the ruling that only catalogued games may be watched, which changes what this slice builds rather than when. `F-03` resolves it. Resolved by F-03 on 2026-09-26: PASS.
- **Risk:** Marked blocked rather than merely risky because both unknowns change the slice's shape, not its timing, and one of them the PRD explicitly puts before implementation. Both are cheap to resolve and `F-03` resolves the harder one, so this is a short block, not a stalled slice. Unblocked 2026-10-06: question 6 answered, question 7 resolved by `F-03`. Sequenced after `S-02` because the list belongs to a user, and after `F-01` because isolation here is enforced by the database rather than by application code.
- **Status:** done

### S-04: The deals list narrows to the collector's own watchlist

- **Outcome:** user opens their own deals view, `/my-deals`, and sees only deals for the games and phrases on their watchlist; `/` stays the public list of every deal. A watchlist entry pinned to a platform admits only that platform's offers; an entry with no platform admits any. When nothing matches, the view says so and states when the data was last refreshed, so an empty list reads as "no deals" rather than "something is broken".
- **Change ID:** `deals-matched-to-watchlist`
- **PRD refs:** `US-01` and its acceptance criteria 1 and 2; `FR-005` (the matching half); `FR-010` (what a phrase matches); `## Business Logic` (the second of the two filtering decisions); the guardrail on one user's matched deals never reaching another
- **Prerequisites:** S-01, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - No number has been set for what counts as the matching working well enough — how many hits on a watchlist in the first week (PRD open question 5). Owner: user. Block: no; the PRD records it as non-blocking. Answered 2026-10-09: at least 80% of the watched games' deals reach `/my-deals`, and at most 5% of the deals there are another game. This slice's acceptance measures both on production, with about 20 watched games.
  - Deals carry titles, not catalogue ids. S-01 stores each deal's original title and the alternative titles its post uses, with no RAWG call (`context/archive/2026-09-28-physical-deals-from-real-posts/plan.md`), so whether this slice resolves them to a RAWG `id` or matches by name is decided here, together with the edition and platform rules. Owner: user. Block: no — the titles are stored either way. Answered 2026-10-09: by name, with no catalogue call. A game entry matches a deal when the match key of its catalogue name equals the match key of the deal's `title`, `english_title` or one of its `alternative_titles`. A match key is the normalised text without a trailing "(YYYY)", one leading "the" or "gra [platform]", and trailing edition, platform and packaging words; Remake, Remastered and HD stay, because they name separate releases. The platform rule compares the entry's pin with the deal's own platform. Resolving deals to a catalogue id is parked (see Parked).
  - What a phrase on the watchlist matches (Open Roadmap Question 9). Owner: user. Block: no. Answered 2026-10-06: a phrase matches when it occurs in `title`, `english_title` or any entry of `alternative_titles`, ignoring letter case and Polish diacritics, and the platform rule applies to it as it does to a game. `ł` has no Unicode decomposition, so the diacritic folding must map it explicitly. Answered 2026-10-09: the normalisation is broadened to every Latin diacritic of one fixed table, `ł` included, and to punctuation. Apostrophes are removed, "&" reads "and", and every other run of characters outside letters and digits is one space, so „Dragon's Dogma” finds „Dragon’s Dogma 2” and „pokemon” finds „Pokémon”.
  - Two phrases that differ only in Polish diacritics can both sit on one watchlist (`watchlist-from-catalog` implementation review, F4, 2026-10-09). S-03 judges duplicates on letter case alone — `lower(phrase)` in the unique index, `isPhraseOnList` in the app — while matching also folds diacritics, so „Wiedzmin” and „Wiedźmin” match exactly the same deals. Matching must therefore show a deal once, however many entries match it. Whether the duplicate rule should fold diacritics too is decided here: changing it needs a new unique index, and a migration that settles any pair already stored. Owner: user. Block: no. Answered 2026-10-09: duplicates are judged on the same normalisation. A unique index on the folded phrase joins the `lower(phrase)` one, the migration marks the newer of any pair already stored as removed, and the view shows each deal once, however many entries match it.
- **Risk:** The slice that completes the PRD's primary success criterion, and the only one depending on both tracks, so it is last by necessity rather than by choice. The load-bearing detail is that one absent platform means "any platform" while a present one means "only this one" — a single field with two behaviours, which the PRD's own example (Silent Hill 2 with and without PS5) exists to pin down. Worth building against that example directly.
- **Status:** done

### S-05: Anyone opens a game's page with its matching deals, found from a search on the front page

- **Outcome:** user — signed in or not — opens a catalogue game's own page and sees every listed deal matching that game: the deals an entry for it with no platform would match, shown without watching it. They find the game from a search above the deals list on `/`, whose results open over the list without moving it; `/` stays the public list of every deal. A signed-in user watches a game, or the typed text as a phrase, straight from those results, optionally pinned to a platform; a visitor is sent to sign in. The watchlist lives in `/my-deals`, and `/watchlist` redirects there. The search and the game page show the game's image from the catalogue, and every page showing catalogue data credits the catalogue. In order of priority: the game page, the search on `/`, the merged watchlist, the images — if time runs short, the game page is what ships.
- **Change ID:** `game-search-and-pages`
- **PRD refs:** `FR-009`; `MS-01`, `MS-02`, `MS-03`, `MS-04`, `MS-05`; `FR-003`, `FR-004`, `FR-010` (the search, removal and the phrase offer move with the search and the list); `## Business Logic` (the game rule a game page applies unchanged); `## Access Control` and the guardrail on watchlist isolation (the merged `/my-deals` stays private)
- **Prerequisites:** S-01, S-03, S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Should search engines index game pages? Indexing invites crawler traffic, which spends the catalogue quota on every crawl unless something caches it. Owner: user. Block: no — `/10x-plan` puts it to him (`context/changes/game-search-and-pages/research.md`, Open Questions).
  - What does a game page show when the catalogue fails or the month's quota is spent? If the game's name comes only from the catalogue, the page cannot list its matches. PRD Open Question 6 settles this for the search only. Owner: user. Block: no — same route.
- **Risk:** Larger than this roadmap's rule of one main user action per slice: it covers four — open a game page, search and watch from `/`, keep the list in `/my-deals`, see images. Kept as one item by the user's decision of 2026-10-26: one change folder, one plan and one branch, merged into `main` only if it is done before the 2026-11-04 deadline; the plan's phases carry the split, game page first. The load-bearing risk is the public audience. It opens two things that were signed-in only: a way to read matched deals that the anonymous role can use — new database surface, under the rule that every function ships locked and is granted deliberately, with the matching truth table updated to match — and the shared catalogue quota of 20,000 requests a month, which visitors and crawlers can now spend. The register's accepted catalogue risk assumed one signed-in account (`infrastructure.md`, Risk Register). The merge's own cost is breadth, not depth: access rules, navigation, and the end-to-end test that gates deploy, which pins the search and the list to `/watchlist`.
- **Status:** in-progress

## Backlog Handoff

| Roadmap ID | Change ID                            | Suggested issue title                                           | Ready for `/10x-plan` | Notes                                                            |
| ---------- | ------------------------------------ | --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| F-01       | `schema-migrations-and-rls-baseline` | Put the schema in repo migrations, locked by default             | yes                   | Run `/10x-plan schema-migrations-and-rls-baseline` — unlocks S-01 |
| F-02       | `collector-into-repo-and-database`   | Move the RSS collector into this repo and write to the database  | no                    | Waits on F-01                                                     |
| F-03       | `game-catalog-provider-proven`       | Choose a game catalogue and prove its Polish coverage            | yes                   | No prerequisites — can run alongside anything                     |
| S-01       | `physical-deals-from-real-posts`     | Show physical-edition deals extracted from collected posts       | no                    | Waits on F-01, F-02. This is the north star                       |
| S-02       | `email-password-accounts`            | E-mail and password accounts with sign-in and sign-out           | yes                   | No prerequisites — fills an evening blocked on the pipeline       |
| S-03       | `watchlist-from-catalog`             | Watchlist of catalogue games and phrases, with optional platform | yes                   | Planned 2026-10-07: `context/archive/2026-10-07-watchlist-from-catalog/plan.md` |
| S-04       | `deals-matched-to-watchlist`         | Show each user the deals matching their watchlist, at /my-deals  | no                    | Waits on S-01 and S-03. Completes the primary success criterion   |
| S-05       | `game-search-and-pages`              | Public game pages with matched deals, search on /, watchlist in /my-deals, images | yes      | Framed and researched in `context/changes/game-search-and-pages/`; run `/10x-plan game-search-and-pages`. M-2's north star |

## Open Roadmap Questions

1. **Product name** — deliberately unresolved; the PRD's `project` frontmatter still carries a TODO placeholder while this roadmap uses the repository name. Owner: user. Block: none.
2. **v1 pipeline scope: collecting versus normalising** — collect from all three aggregators but normalise one, or normalise everything collected. Bears directly on extraction tuning cost and on the same deal arriving from several sources. Owner: user. Block: `S-01` (non-blocking — answered by running S-01). **Answered 2026-10-06: normalise all three.** Duplicates across sources affect 5.5% of listed games and stay separate cards in v1.
3. **Cleanliness threshold** — the acceptable share of entries that do not belong (digital editions, wrong game). Without a number there is no way to say the filter works. Owner: user. Block: `S-01` (non-blocking — answered by looking at S-01's output). **Answered 2026-10-06: up to 5% of the listed deals.** S-01's first sample measured 2.9%.
4. **Data volume** — undeclared; the raw-post set grows with time regardless of user count. Owner: user. Block: `F-01` (non-blocking).
5. **A measurable primary success criterion** — the PRD's criteria are binary; no number has been set for when matching is good enough. Owner: user. Block: `S-04` (non-blocking). **Answered 2026-10-09: at least 80% found, at most 5% wrong.** On production, at least 80% of the watched games' deals reach `/my-deals`, and at most 5% of the deals there are another game. `S-04`'s acceptance measures both, with about 20 watched games. **Measured 2026-10-12 on 20 games: 90.7% found (39 of 43), 0% wrong (0 of 39)** — see `context/archive/2026-10-09-deals-matched-to-watchlist/acceptance.md`.
6. **Behaviour when the catalogue is unreachable** — what the user sees when the catalogue does not answer during a search. Owner: user. Block: **`S-03` (blocking)** — the PRD places it before implementing `FR-003`. **Answered 2026-10-06: one generic message.** Whatever the reason, the user is told the catalogue is temporarily unavailable; the watchlist keeps working, and the typed text can still be watched as a phrase.
7. **Catalogue coverage of the Polish market** — whether the chosen catalogue knows the titles a Polish collector of boxed editions cares about. The ruling that only catalogued games may be watched makes this coverage the ceiling on the product's usefulness. Owner: user. Block: **`S-03` (blocking)** — `F-03` resolves it. **Answered 2026-09-26: PASS.** All 12 of the user's titles were found within the first five results, both Polish names included — see `context/archive/2026-09-26-game-catalog-provider-proven/coverage.md`.
8. **Is the old collector still running?** — surfaced by the baseline probe, not by the PRD. The collector runs from a different repository; these feeds retain roughly two days, so if it has been switched off, every day until `F-02` lands is lost permanently. Owner: user. Block: none — but the answer sets how urgent `F-02` is. **Answered 2026-09-23: yes, it ran throughout.** Confirmed against the data rather than from memory — the export staged for `F-02`'s import runs from 2026-09-16 to 2026-09-23 without a gap, so no collection days were lost between the baseline probe and the move into this repository.
9. **Watching keywords, not only catalogued games** — the user's idea (2026-09-26): besides games identified in the catalogue, let a user watch a keyword. It contradicts the PRD's ruling "Gra nieobecna w katalogu nie może zostać dodana do listy obserwowanych" (`prd.md:98`). `F-03` supplies the evidence: Fire Emblem: Fortune's Weave, a new release offered in collected posts, is not in RAWG — the catalogue lags new releases. Owner: user. Block: `S-03` (non-blocking — `F-03`'s verdict is PASS, so the ruling stands unless the user reopens it; a yes changes the shape of `S-03` and the matching in `S-04`). **Answered 2026-10-06: yes, as phrases.** Phrases join `S-03` as a second kind of watchlist entry, beside catalogue games; the PRD replaces the ruling above with `FR-010` and a phrase rule in `## Business Logic`. A phrase matches a deal when any of the deal's titles contains it, ignoring letter case and Polish diacritics, and a pinned platform narrows it as it does a game. It has no catalogue identity, so a typo silently matches nothing — the accepted cost of watching what the catalogue does not know.

## Parked

- **Marking a watched game as purchased** (`FR-007`) — Why parked: nice-to-have in the PRD, and not needed for the main flow. Under `main_goal: speed` it is deferred rather than sequenced late.
- **Querying shops for prices or availability** — Why parked: PRD `## Non-Goals`. Posts written by people are the only input; the price comes from the post and is not verified at the source.
- **Identifying a specific edition of a game** — Why parked: PRD `## Non-Goals`. The game is recognised, not its edition, region or box contents.
- **Judging whether a price is good** — Why parked: PRD `## Non-Goals`. Lowest-seen price returns to consideration only once several weeks of collection exist.
- **Notifications by e-mail or push** — Why parked: PRD `## Non-Goals`. The user opens the application themselves; this knowingly leaves one of the three layers of pain unaddressed.
- **Promising completeness** — Why parked: PRD `## Non-Goals`. A quality exclusion, not a functional one — some posts will be misread and some will never reach a source.
- **An admin panel** — Why parked: PRD `## Access Control` puts source lists and processing rules outside the interface in the MVP.
- **Observability beyond the user-facing freshness timestamp** — Why parked: the baseline reports none, and no requirement forces it. `US-01`'s "when was this last refreshed" is covered inside `S-01`. Under `top_blocker: time`, proper logging and error tracking wait.
- **Resolving deals to a catalogue id** — Why parked: `S-04` matches games by name, and the catalogue provider is not settled for good: RAWG serves the MVP, and IGDB may replace it. What it would unlock: matching by id rather than by name, and images on deal cards. What it costs: a pipeline step, the provider's key in GitHub Actions, about one catalogue search per deal, and parent lookups for editions that carry an id of their own (`context/archive/2026-09-26-game-catalog-provider-proven/coverage.md`, handoff to S-04). Update 2026-10-26: it would also unlock a link from each deal card to its game page; `S-05` gives deal cards neither an image nor that link, for this reason (`context/changes/game-search-and-pages/frame.md`).

## Milestone History

(Append-only. Carried forward verbatim into each successor milestone's roadmap; empty on the very first milestone.)

- **M-1: First matched physical deals** (`first-matched-physical-deals`) — closed 2026-10-26. Deals read automatically from real posts, physical editions only, narrowed at `/my-deals` to each user's watchlist of catalogue games and phrases; measured on production with 20 watched games, 90.7% of their deals found (39 of 43) and none wrong (0 of 39). Its items `F-01`–`F-03` and `S-01`–`S-04` stay in this file as `done`.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

- **F-01: (foundation) the database schema lives in migrations inside this repository and can be reproduced on a fresh local database and applied to the hosted project; every table added from here on starts with row-level security on and no policy, so access has to be granted deliberately rather than remembered. The first migration — storage for collected source posts — lands as the proof that the path works.** — Archived 2026-10-26 → `context/archive/2026-09-21-schema-migrations-and-rls-baseline/`. Lesson: —.
- **F-02: (foundation) the RSS collector runs from this repository on its schedule and appends collected posts to the database instead of a JSON file, with the 659 posts gathered so far imported. Deduplication behaves as it does today, so re-running changes nothing.** — Archived 2026-10-26 → `context/archive/2026-09-22-collector-into-repo-and-database/`. Lesson: —.
- **S-02: user registers with an e-mail address and a password, signs in, signs out, and is sent away from private views when not signed in. A prepared demo account can be handed to someone who wants to look at the product without building a watchlist of their own.** — Archived 2026-10-26 → `context/archive/2026-09-25-email-password-accounts/`. Lesson: —.
- **F-03: (foundation) one external game catalogue is selected, reachable with credentials, and checked against a handful of real boxed titles from the user's own list; a thin search call exists behind an interface the application can hold onto. The answer to "does this catalogue know the games this product is for" is on record either way.** — Archived 2026-10-26 → `context/archive/2026-09-26-game-catalog-provider-proven/`. Lesson: —.
- **S-01: user opens the deals view and sees deals read automatically out of the collected posts — each one a game named by its original title, with its platform where the post states one, a price, a percentage discount where the post states one, and a link that goes to the shop, or to the aggregator post when the shop link is not in the text. Digital editions and key offers do not appear. A deal whose post gives an expiry date disappears after it; one without a date stays. The view states when the data was last refreshed.** — Archived 2026-10-26 → `context/archive/2026-09-28-physical-deals-from-real-posts/`. Lesson: —.
- **S-03: user searches the external catalogue by title, adds a game or a phrase to their watchlist and optionally pins it to one platform, sees their list, and removes an entry — which disappears from their view for good, while the record that they once tracked it survives in the data. A phrase covers what the catalogue does not know, such as a new release. Another user cannot reach that list, including by editing the address.** — Archived 2026-10-26 → `context/archive/2026-10-07-watchlist-from-catalog/`. Lesson: —.
- **S-04: user opens their own deals view, `/my-deals`, and sees only deals for the games and phrases on their watchlist; `/` stays the public list of every deal. A watchlist entry pinned to a platform admits only that platform's offers; an entry with no platform admits any. When nothing matches, the view says so and states when the data was last refreshed, so an empty list reads as "no deals" rather than "something is broken".** — Archived 2026-10-26 → `context/archive/2026-10-09-deals-matched-to-watchlist/`. Lesson: —.
