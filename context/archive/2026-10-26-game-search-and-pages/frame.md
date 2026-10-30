# Frame Brief: Catalogue search on the front page, game pages with matched deals, game images

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Tomasz's intent, as recorded in `change.md` on 2026-10-26:

1. Move the game search out of `/watchlist` onto the front page.
2. A signed-in user adds a game to the watchlist straight from that search; `/watchlist` keeps only the list. Open question: should the list then merge into `/my-deals`?
3. Clicking a game opens its own page, which shows the deals matched to that game without watching it.
4. The search and the game page show an image of the game from RAWG. Any image will do; it need not be the box cover.

## Initial Framing (preserved)

- **User's stated cause or approach**: this is UI work assembled from parts that already exist. The search component moves, a page is added, and a field the catalogue already returns (`CatalogGame.imageUrl`) is shown.
- **User's proposed direction**: one change on branch `game-search-and-pages` that delivers all four items. It merges into `main` only if it is done before the course deadline.
- **Pre-dispatch narrowing**: Step 1.5 did not run before dispatch. The orchestrator batches the questions it puts to Tomasz, so Step 1.5 and Step 4 were merged into one round, asked after the Step 3 investigation. The scope question in that round named the leading concern. Tomasz chose "Strona gry z okazjami": the game page with its deals is the core of the change and goes first if time runs short.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Audience** — who may search and open a game page. Today a single user check keeps visitors off RAWG.
2. **Data path for a game page** — how a page gets the deals for a game that is on no watchlist, and where it gets that game's name.
3. **What the search carries** — the platform pin, the phrase offer, the duplicate checks, `refresh()` after an action, the URL state and the E2E steps. ← initial framing ("move the component")
4. **What `/` is** — the roadmap promises that `/` stays the public list of every deal. ← initial framing
5. **Images** — a parsed field that nothing renders yet. ← initial framing
6. **Watchlist and `/my-deals`** — whether the list page survives as a page of its own.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Public search and game pages turn RAWG into a dependency anyone can spend | The only guard is `search-results.tsx:61`, which returns before RAWG when there is no user, together with `/watchlist` being private (`access.ts:10`). The quota is 20,000 requests a month, shared (`game-catalog-provider-proven/plan.md:15`). Nothing caches, throttles or retries (`watchlist-from-catalog/plan.md:95`). Any GET `?q=` calls RAWG, and the form searches after a 300 ms pause in typing (`catalog-search-form.tsx:21-24,79-97`). The accepted risk assumes one signed-in account (`infrastructure.md:137`), and Hobby keeps logs for one hour (`infrastructure.md:116,130`). | STRONG |
| 2. A game page needs a match path and a catalogue lookup that do not exist | `matched_deals` keys on `auth.uid()` (`20261013145356_hide_expired_deals.sql:31`). `anon` and `authenticated` can read `deals.match_keys` (`20260930061813_create_deals.sql:34-35`). Only `authenticated` may execute `game_match_key`, and `anon` gets nothing (`20261012070050_match_deals_to_watchlist.sql:196-205`); the truth table asserts exactly this (`supabase/checks/matching.sql:596-601`). A TypeScript copy of the key was ruled out (`deals-matched-to-watchlist/plan.md:109`). `GameCatalog` has `searchGames` only (`src/lib/catalog/types.ts:45-50`), so for a game nobody watches the name comes from a new RAWG call per view or from the URL. | STRONG |
| 3. The search is more than a game finder | `PhraseOffer` is the only way to add a phrase (FR-010, must-have), and it renders only inside search outcomes (`search-results.tsx:158,191,219`). The duplicate checks need the user's list on the same page (`:63-66`). `refresh()` re-renders whichever page posted (`watchlist/actions.ts:55-62`), so on `/` an add reruns the deals read and a RAWG call. `?q=` and `?page=` drop each other (`catalog-search-form.tsx:100-104`, `src/lib/deals/page.ts:40-42`). `tests/e2e/main-flow.spec.ts:147-154`, which gates deploy, expects the search and the list on one page. | STRONG |
| 4. Search on `/` breaks the roadmap's promise for `/` | "`/` stays the public list of every deal" (`roadmap.md:178`; `deals-matched-to-watchlist/plan.md:11,100`). The promise breaks only if the search replaces or filters the list. | WEAK |
| 5. Images are a risk of their own | `imageUrl` is parsed at `rawg.ts:98` and rendered nowhere. There is no `images.remotePatterns`, no `next/image` and no CSP. All six kitchen-sink games have `imageUrl: null`. RAWG's terms ask for attribution of "the data and/or images" (`game-catalog-provider-proven/plan.md:18`). | WEAK |
| 6. Merging the list into `/my-deals` is a wide change | It touches `access.ts:10` (the redirect type allows only `/` and `/login`, `access.ts:2-3`), CLAUDE.md (Supabase), `layout.tsx:48`, `my-deals-section.tsx:138,182`, `watchlist-entries.tsx:92`, `test-plan.md:102,446` and `main-flow.spec.ts`. Nothing records why the two pages are separate. | WEAK |

## Narrowing Signals

Answers from the merged round (2026-10-26):

- **Audience.** "Wszyscy, konto tylko do „Obserwuj”": the search on `/` and the game pages are public, and an account is needed only to watch. This brings dimensions 1 and 2 in at full size. An `anon`-reachable match path is new database surface. Visitors and crawlers spend RAWG on every search and every game page view. The no-migration shortcut is ruled out: a signed-in RPC to `game_match_key` was hardened as an attack surface, not adopted as an API (`deals-matched-to-watchlist/reviews/impl-review.md:51,63`, F1).
- **Front page.** "Wyszukiwarka nad listą, ale nie chcę żeby przesuwała układ tylko pojawiała się w kontenerze pozycjonowanym absolutnie": the search sits above the deals list. Its results open in an absolutely positioned container that does not push the list down, and the list stays as it is. Dimension 4 dissolves: `roadmap.md:178` stays true. The repository has no popover or dropdown pattern yet (`src/components/ui/`); `@base-ui/react` is installed.
- **List.** "Tak, scalamy": the watchlist merges into `/my-deals` in this change, and `/watchlist` goes away behind a redirect. Dimension 6 is in scope.
- **Priority.** The game page comes first (see Pre-dispatch narrowing).

Settled by the documents, not asked:

- **FR-009 may start now.** It enters "po domknięciu głównego przepływu, jeśli zostanie czas" (`prd.md:84`), and every M-1 item is `done` (`roadmap.md:154-160`).
- **"Matched to that game" is the existing rule.** A game page shows what an unpinned game entry with the RAWG name would match (`prd.md:100`, Business Logic; FR-009 "wszystkie znalezione dla niej oferty"). There is no new matching rule. Deals are still the listed ones: game, physical, priced and not expired, a predicate already stated in three places (CLAUDE.md).
- **The platform select and the phrase offer stay with the search**, wherever its results render, because FR-010 is must-have. For a visitor, watching leads to sign-in. When RAWG fails, everyone still gets the one generic message and can still watch the typed text as a phrase (PRD Open Question 6).
- **Every page showing RAWG data carries the RAWG credit**, `/` and the game page included (CLAUDE.md, Game catalogue).
- **The image is `imageUrl` as it stands**: background art, not a box cover (`types.ts:23`).
- **Deal cards get no image and no link to a game page.** Deals carry no RAWG id, and resolving them to one is parked (`roadmap.md`, Parked).
- **Isolation is unchanged.** Game pages read only publicly listed deals. The merged `/my-deals` stays private, its rows behind RLS.

## Cross-System Convention

S-04 put matching in Postgres and kept TypeScript out of the game key (`deals-matched-to-watchlist/plan.md:109`). CLAUDE.md requires every new function to ship locked and be granted deliberately to each role that calls it, and every migration to be additive. A public match path follows that convention: database surface, granted deliberately to `anon`, with the truth table in `supabase/checks/matching.sql` updated to match.

For RAWG, the project has accepted the provider's failure modes (`prd.md:70`) and settled on one generic failure message. It recorded that a cache, if added, keys on the query inside `searchCatalog`, never at fetch level, because the URL carries the key (`watchlist-from-catalog/reviews/impl-review.md:112`, F5). The accepted quota risk assumed signed-in callers, which can be throttled per user. Public callers fall outside that convention, so it needs extending, not just reusing.

Pressure test (Step 5):

- **The inverse holds.** If the weight sits in the game page, no public per-game read should exist today, and none does: the view is keyed on `auth.uid()`, `anon` has no execute grant, and the catalogue has no lookup by id.
- **The initial framing still fits the relocation.** The search move needs no new data, because it reuses `searchCatalog`, the actions and the rules. Its cost is coupling (phrase offer, URL state, `refresh()`, E2E), not new surface.
- **The overlay changes nothing above.** It is how the outcomes are presented. The phrase offer, the platform pin and the duplicate checks still travel with them.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: give anyone, signed in or not, a page per catalogue game that lists the deals matching it, without public traffic exhausting the shared RAWG quota — and re-home the search and the watchlist around that page.

The initial framing holds for items 1, 2 and 4, together with the merge. They are relocation and presentation over parts that exist, and their cost is the known coupling in dimension 3 and the touch points in dimension 6. It does not hold for item 3 once the audience is public. A game page needs a match path that `anon` cannot use today and a catalogue lookup the contract lacks. Public search and public game pages also turn RAWG from an accepted signed-in risk into an unprotected public one. Treating the change as UI work would leave both problems unplanned.

## Confidence

**HIGH** — strong file-level evidence for dimensions 1–3, decisive answers to all four questions, and a reframe that follows S-04's convention for where matching lives.

## What Changes for /10x-plan

The plan is about the game page first: its `anon`-safe match path, the game identity its URL carries and the RAWG lookup that implies, and RAWG protection that holds for visitors and crawlers. After that come the search above the list on `/` with its results in an overlay, the watchlist merged into `/my-deals`, and the images.

Documents the plan must update:

- `context/foundation/roadmap.md:219` — FR-009 leaves Parked, because its precondition is met. Separately, M-1 still reads `milestone_status: open` (`roadmap.md:12`) with every item done, and this change has no roadmap ID. Settle both with /10x-roadmap.
- `context/foundation/infrastructure.md:137` — the row's premise, "one signed-in account", no longer holds. It needs a dated status or a new row covering visitors and crawlers. Its trigger relies on logs Hobby keeps for one hour (`:116`, `:130`).
- `CLAUDE.md` (Supabase, "Every path is public except `/watchlist` and `/my-deals`") together with `src/lib/auth/access.ts:10`, once `/watchlist` becomes a redirect.
- `context/foundation/test-plan.md:102` (risk #6's decision table names `/watchlist`), `:446` (describes "a `/watchlist` search" under the blank key), and `:88`/`:103` (risk #7's watchlist wording).
- `tests/e2e/main-flow.spec.ts:118-119`, `:147-154` and `:176-178` — steps pinned to `/watchlist`. Change them in a reviewed diff and record the change in `change.md` (lessons.md).
- `supabase/checks/matching.sql:596-601` — the grant truth table, if grants on the matching functions change.

## References

- Source files: `src/components/watchlist/search-results.tsx:61,63-66,158,191,219`; `src/components/watchlist/catalog-search-form.tsx:21-24,79-104`; `src/app/(app)/watchlist/actions.ts:55-62`; `src/lib/auth/access.ts:2-3,10`; `src/lib/catalog/types.ts:23,45-50`; `src/lib/catalog/rawg.ts:98`; `src/lib/deals/page.ts:40-42`; `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:196-205`; `supabase/migrations/20261013145356_hide_expired_deals.sql:14-16,31`; `supabase/migrations/20260930061813_create_deals.sql:34-35`; `supabase/checks/matching.sql:596-601`; `tests/e2e/main-flow.spec.ts:118-119,147-154,176-178`
- Documents: `context/foundation/prd.md:14,70,84,100`; `context/foundation/roadmap.md:12,178,219`; `context/foundation/infrastructure.md:116,130,137`; `context/foundation/test-plan.md:88,102,103,446`; `context/archive/2026-10-07-watchlist-from-catalog/` (`plan.md:95`, `change.md:33,52`, `reviews/impl-review.md:112`); `context/archive/2026-10-09-deals-matched-to-watchlist/` (`plan.md:11,100,109`, `reviews/impl-review.md:51,63`); `context/archive/2026-09-26-game-catalog-provider-proven/plan.md:15,18`
- Related research: none yet (`/10x-research` follows)
- Investigation tasks: three read-only sub-agents. Data path: `a88f8af1277cea1fd`. RAWG exposure and images: `a5a46a8f62a19cdae`. Coupling of search, watchlist and `/my-deals`: `a068bca601cb023c6`.
