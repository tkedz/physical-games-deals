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
