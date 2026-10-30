---
change_id: watchlist-on-top-and-game-remove
title: Watchlist above the matched deals, and „Usuń” on a game's page
status: new
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

- **2026-10-30, Tomasz — the intent, as given.** Two small changes, shipped before the 2026-11-04 deadline if they make it, later otherwise:
  1. On `/my-deals`, move the watchlist (the games and phrases being watched) to the top, above the matched deals. Today the editable section sits at the bottom, under a long list of deals, which is not intuitive.
  2. A game's page already lets a signed-in user add the game to the list, and shows when it is on the list („Na liście”, disabled). It has no way to remove it; add „Usuń” there when the game is on the list.
- **2026-10-30 — workflow.** Branch `watchlist-on-top-and-game-remove`, cut from `main` at `c87b0a8` after `watchlist-entry-edit` (PR #6) merged and both finished changes were archived. One change, two phases (the list on top; „Usuń” on the game page), one PR. `/10x-frame` and `/10x-research` are skipped, as for `watchlist-entry-edit`: no migration and no hosted step is expected. Next step: `/10x-plan watchlist-on-top-and-game-remove`.
- **2026-10-30 — roadmap.** Not a roadmap item: no item carries this Change ID, so `/10x-archive` will leave `roadmap.md` alone. M-2's only slice, `S-05`, is `done`. Its outcome says „watch from there, manage the list in `/my-deals`”; „Usuń” on the game page extends that slightly and does not contradict it. Tomasz postponed closing M-2 and refreshing the roadmap's Baseline (it still lists `/watchlist`) to a later `/10x-roadmap` run.
- **2026-10-30 — points for the plan to settle with Tomasz** (raised in the session, not decided):
  - What happens to „Zmień listę obserwowanych”, the link in the matched deals that jumps down to the list, once the list is on top. Also whether a long list pushes the deals too far down.
  - Which entry „Usuń” on a game's page removes. The proposal is the game entry for exactly the platform chosen in the page's select, the one „Na liście” shows today. A phrase entry with the game's name is not a game entry and stays out of it.
