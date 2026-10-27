---
change_id: game-search-and-pages
title: Catalogue search on the front page, game pages with matched deals, game images
status: implementing
created: 2026-10-26
updated: 2026-10-27
archived_at: null
---

## Notes

- **2026-10-26, Tomasz — the intent, as given.**
  1. Move the game search out of `/watchlist` onto the front page.
  2. A signed-in user adds a game to the watchlist straight from that search; `/watchlist` keeps only the list. Open question: should the list then merge into `/my-deals`?
  3. Clicking a game opens its own page, which shows the deals matched to that game without watching it.
  4. The search and the game page show an image of the game from RAWG. Any image will do; it need not be the box cover.
- **2026-10-26 — workflow.** The work lives on branch `game-search-and-pages`, off `main`, and merges into `main` only if it is done before the course deadline. Steps run in order `/10x-frame` → `/10x-research` → `/10x-plan` → `/10x-plan-review` → `/10x-implement`; each step's artifact is committed on the branch when the step ends, so a fresh session resumes from the first artifact missing in this folder.
- **2026-10-26 — framed.** Tomasz's four answers are in `frame.md` (Narrowing Signals): search and game pages are public, an account is needed only to watch; the search sits above the deals list on `/`, with its results in an absolutely positioned container that does not shift the layout; the watchlist merges into `/my-deals`; the game page comes first if time runs short.
- **2026-10-26 — researched.** `research.md` lists the choices it leaves to `/10x-plan` (Open Questions) and two product questions for Tomasz there: whether search engines index game pages, and what a game page shows when RAWG fails. `frame.md`'s log-retention anchor now points at `infrastructure.md:116,130`, not `:133`.
- **2026-10-26 — roadmap.** `/10x-roadmap` closed M-1 and opened M-2 (`public-game-pages`), whose one item S-05 carries this change's ID, status `ready`. Tomasz chose one item over four. Next step: `/10x-plan game-search-and-pages`.
- **2026-10-26 — planning interview done, plan not yet written.** Complexity HIGH, budget 8 questions. Decisions:
  - Match path (settled from CLAUDE.md and the S-04 review, not asked): one public invoker function `public.deals_for_game(name)` with a `security definer` key helper in a new non-exposed schema `private`; the grants on `game_match_key` and `fold_for_matching` stay as they are.
  - Game URL: `/games/<RAWG id>`, no provider prefix. The id is provider-specific, as `watchlist_entries.game_id` already is.
  - RAWG quota: a cache only, provider-neutral — it wraps the `GameCatalog` contract with the provider in its keys (search 24 h, game 7 days, failures never stored), so a switch to IGDB leaves it unchanged. No WAF for now; a Risk Register row in `infrastructure.md` records it with a trigger.
  - RAWG failure on a game page: a game seen before renders from the cache with live deals; an unseen one shows the one generic catalogue message with a link to `/`.
  - Indexing: `noindex` on `/games/…` and `/?q=…`, no sitemap.
  - Search URL: `?page=` and `?q=`/`platform` coexist; closing the overlay drops `q` and `platform`.
  - Images: RAWG's own resized files (`/media/resize/420/-/…`) through `next/image` `unoptimized`; the resize knowledge stays in `rawg.ts`.
  - A guest who wants to watch gets a sign-in link and lands on `/` afterwards; no return parameter.
  - The game page also gets the watch control, as in the search results (Tomasz chose this over the recommendation).
- **2026-10-27 — planned.** `plan.md` (six phases; Phases 1–3 are the minimal mergeable set) and `plan-brief.md` (Key Decisions). Tomasz skipped `/10x-plan-review` and went straight to `/10x-implement`.
- **2026-10-27 — Phase 1 departures from the plan.**
  - `src/lib/games/catalog.ts` wraps its two exports in React `cache` itself, rather than passing `cache` into `cached-catalog.ts`. React `cache` stays outermost. `cached-catalog.ts` takes the provider name, a `connect()` that builds the provider's catalogue, an `unstable_cache`-shaped function and a log function.
  - `CATALOG_PROVIDER` lives in `catalog.ts`, next to the `createRawgCatalog` call, so a provider switch touches one file. `CATALOG_SHAPE_VERSION` lives in `cached-catalog.ts`, where Phase 6 bumps it. Key parts are strings, as `unstable_cache` requires, so the version enters the key as `String(CATALOG_SHAPE_VERSION)`.
  - The RAWG key is read inside the cache callback, on a miss only. A missing key fails only what is not stored yet, so stored answers are still served without a key.
  - `rawg.ts` shares one request skeleton (`getJson`) and one mapping (`toCatalogGame`) between search and lookup; `SEARCH_URL` became `API_URL`. Three extra `searchGames` tests pin that search still treats a 404 as `unavailable` and sends the same query parameters.
  - Only a `CatalogFailureError` becomes `{ ok: false }` outside the cache. Any other error is rethrown, so Next's control-flow errors and real bugs do not read as "catalogue unavailable". A unit test pins it.
  - `tests/hooks/agent-hooks.test.ts` is unchanged: it does not pin the `SUITE_PATHS.unit` list.
- **2026-10-27 — Phase 1 verified in dev.** The agent ran 1.7 and 1.8 through Chrome DevTools against the local stack, signed in as a local test account it created, `agent-check@przyklad22.pl` (it goes with `npm run local:reset`). 1.7: „elden ring” listed results and „Obserwuj” added Elden Ring. 1.8: under `RAWG_API_KEY=`, „hollow knight silksong” showed the catalogue message and the phrase offer. Beyond the plan, „Elden  Ring” under the blank key was served from the cache (case and spacing normalised), and the server log held one line, `Searching the game catalogue failed: misconfigured, status none`, with no URL or key.
