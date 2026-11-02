<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Watchlist above the matched deals, and removal on a game's page

- **Plan**: context/changes/watchlist-on-top-and-game-remove/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Evidence for the PASS rows:
- Every planned item exists. All departures (the `WatchOption` shape, `addAction` renamed, the rem-computed `max-height` with `role="region"`, `longSampleEntries`, the filtered heading assertion) are recorded in change.md.
- No file changed outside the plan's list. The search on `/` keeps its disabled „Na liście”.
- The removal path calls `requireUser()`, validates `entryId` with zod, and writes through RLS (`using (auth.uid() = user_id and removed_at is null)`). A crafted id matches zero rows.
- Checks run on 2026-11-02:
  - `npm test`: 643 passed.
  - `npm run lint`, `npm run format:check` and `npx tsc --noEmit`: clean.
  - Grep for `WATCHLIST_ANCHOR`, `MyDealsNoEntries` and „Zmień listę obserwowanych”: no hits.
  - `npx playwright test` (`E2E_PORT=3100`): 5/5.
- The manual checks 1.7–1.13 and 2.6–2.10 have specific observations in change.md (measured px sizes, the button sequence).

## Findings

### F1 — `removeAction` is optional on the server control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/games/game-watch-control.tsx:37
- **Detail**: `GameWatchControl` requires `addGameAction` but takes `removeAction?: WatchlistAction`. A caller that leaves it out ships a „Usuń z listy obserwowanych” button that posts nothing, with no type error. The sibling `WatchlistSection` requires both of its actions. The only place the optional prop is needed is `GameWatchView` in the kitchen sink.
- **Fix**: Make `removeAction` required on `GameWatchControl`, and keep it optional on `GameWatchView`.
- **Decision**: FIXED

### F2 — Keyboard focus falls to the document after a removal on a game page

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/games/game-watch-picker.tsx:93-113
- **Detail**: The button is keyed `${platform}:${state}`. After `refresh()` flips the state, the button that had focus unmounts, and keyboard and screen-reader users lose their place. The plan accepted this under „What We're NOT Doing”, as matching the existing add behaviour. That was cheaper to accept before this change, when the add swapped to a disabled „Na liście”. Now both states are focusable buttons, so one fix covers both directions.
- **Fix**: Keep the decision for now and revisit it in an a11y pass.
  - Strength: The plan chose this explicitly. The behaviour matches the add path and costs nothing before the 2026-11-04 deadline.
  - Tradeoff: A keyboard user who removes or adds the game has to tab back from the top of the page.
  - Confidence: MED — the plan's reasoning holds, but its premise (a disabled target) no longer does.
  - Blind spot: How a screen reader announces the swap has not been tested.
- **Decision**: SKIPPED

### F3 — „Okazje z Twojej listy” shows while loading, then disappears for an empty list

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/deals/my-deals-section.tsx:1-5, 205-209
- **Detail**: `MyDealsSkeleton` draws the heading inside `MyDealsFrame`. For a user with an empty list, `MyDealsSection` then returns null, so the heading flashes and goes away. The file header says „the heading stays put while the deals load”, which is true only when the list has entries.
- **Fix**: Narrow the header comment to „for a list with entries”, and accept the brief flash. It affects only users with an empty list.
- **Decision**: FIXED

### F4 — Stale or loose doc comments

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/watchlist/rules.ts:245; tests/unit/watchlist/watch-state.test.ts:1-5; src/app/kitchen-sink/page.tsx:207-208, 219-222, 932
- **Detail**:
  - The `gameWatchOption` comment ends „The state is watchState's”, but the function does not call `watchState`. Both functions derive the state from `findGameEntry` / `isGameOnList`.
  - The test file's header still says „a game's watch control” shows a disabled „Na liście”. That is now true only of the search on `/`.
  - A few edited kitchen-sink comment lines are not re-wrapped.
- **Fix**: Reword the two comments: the state agrees with watchState's through findGameEntry, and the disabled state belongs to the search on `/`. Re-wrap the kitchen-sink lines.
- **Decision**: FIXED

### F5 — The list's scroll region is a tab stop even when nothing scrolls

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/watchlist/watchlist-entries.tsx:117-123
- **Detail**: `tabIndex={0}` and `role="region"` apply with five or fewer entries too, which adds one tab stop that does nothing. The region is named correctly, and the `p-1` padding holds the focus rings. This satisfies axe's scrollable-region-focusable rule. Making the stop conditional would need a client-side overflow measurement in a server-rendered component.
- **Fix**: Accept as is. Plan item 4 asked for an always-focusable container.
- **Decision**: ACCEPTED — the plan asked for an always-focusable container, and a conditional tab stop would need a client-side overflow measurement.

## Triage summary (2026-11-02)

- Fixed: F1, F3, F4
- Skipped: F2
- Accepted: F5
