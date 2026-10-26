---
change_id: game-search-and-pages
title: Catalogue search on the front page, game pages with matched deals, game images
status: preparing
created: 2026-10-26
updated: 2026-10-26
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
