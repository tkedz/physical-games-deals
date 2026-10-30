# Watchlist above the matched deals, and removal on a game's page — Implementation Plan

## Overview

Two small UI changes, wanted before the 2026-11-04 deadline:

1. On `/my-deals`, the watchlist (games and phrases) becomes the first section, above the matched deals, in a scroll container about five entries tall.
2. On a game's page, `/games/<id>`, a game that is on the list for the platform chosen in the select offers „Usuń z listy obserwowanych” in place of the disabled „Na liście”.

There is no migration and no hosted step. The change ships as one PR, with `main` fast-forwarded as for `watchlist-entry-edit`.

## Current State Analysis

- `/my-deals` renders the matched deals first and the list below them, each in its own Suspense boundary. The list sits inside `<div id={WATCHLIST_ANCHOR}>` (`src/app/(app)/my-deals/page.tsx:44-56`). `loading.tsx` stacks the two skeletons in the same order (`src/app/(app)/my-deals/loading.tsx:13-20`). The page's intro reads „…a pod nimi sama lista” (`src/components/deals/my-deals-page.tsx:19-22`).
- The matched deals have no heading of their own. The only `h2` on the page is the list's „Twoja lista” (`src/components/watchlist/watchlist-entries.tsx:63-75`, `ListFrame`).
- The matched deals' first-page empty state, `MyDealsEmpty`, has „Zmień listę obserwowanych”, a jump to `#lista` (`src/components/deals/my-deals-section.tsx:131-152`). `WATCHLIST_ANCHOR` is used only there and in `page.tsx`.
- With an empty list, both sections show an empty state. The matched deals show `MyDealsNoEntries` („Twoja lista obserwowanych jest pusta”, `my-deals-section.tsx:178-195`). The list shows `WatchlistEmpty` („Twoja lista jest pusta”, `watchlist-entries.tsx:106-120`). `tests/e2e/main-flow.spec.ts:145,270` assert the first of the two.
- After an edit, `EntryEditForm` moves focus to the list's `h2`, found through `closest("section")` (`src/components/watchlist/entry-edit-form.tsx:186-196`). The new version is the first entry, because the list is newest first.
- On a game's page, the server half of the watch control, `GameWatchControl`, builds one `WatchOption` per platform: the state from `watchState`, plus the add fields from `gameEntryFields` (`src/components/games/game-watch-control.tsx:61-90`). The client half, `GameWatchPicker`, shows „Obserwuj” or a disabled „Na liście” for the chosen platform (`src/components/games/game-watch-picker.tsx:116-131`). The control receives `addGameEntry` only (`src/app/(app)/games/[id]/page.tsx:94-96`). It knows no entry id, so it cannot post a removal.
- Removal already exists. `removeEntry` takes `entryId` (`src/app/(app)/_watchlist/actions.ts:105-116`), `entryRemovalFields` builds that field (`src/lib/watchlist/rules.ts`), `markEntryRemoved` writes `removed_at` under RLS and counts zero rows as done (`src/lib/watchlist/queries.ts:248-262`), and `EntryActionButton` already has the `remove` intent with „Usuwanie…” (`src/components/watchlist/entry-action-button.tsx:10-13`).
- `watchlist_entries_active_game` is a unique index over active rows on (user, game, platform), with null as a value of its own (`supabase/migrations/20261007141021_create_watchlist_entries.sql:33`). A game on a given platform is therefore at most one active row.
- The E2E server has no RAWG key, so a signed-in game page cannot render a game in CI (`tests/e2e/game-page.spec.ts:1-8`).

## Desired End State

- `/my-deals` reads, top to bottom: „Moje okazje”, the intro, then „Twoja lista” (`h2`) with its entries, then „Okazje z Twojej listy” (`h2`) with the freshness line, the deals and the pagination.
  - Up to five one-line entries, the list is as tall as its content. Beyond that it scrolls inside its own container.
  - The container can be reached and scrolled from the keyboard, and screen readers announce it by name.
  - Paging the deals leaves the list in place.
  - With an empty list, the page shows „Twoja lista jest pusta” and nothing below it.
  - „Zmień listę obserwowanych” and the `#lista` anchor are gone.
- On `/games/<id>`, a signed-in user sees, for the chosen platform:
  - „Obserwuj” when the list does not hold the game on exactly that platform;
  - „Usuń z listy obserwowanych” when it does. Pressing it reads „Usuwanie…”, removes that one entry, re-renders the page and shows „Obserwuj” again for the same platform.
- A failed removal shows „Nie udało się zapisać zmiany. Spróbuj ponownie.” under the control.
- The search on `/` keeps its disabled „Na liście”.

Verified by `npm test` (new unit tests of the game watch option), `npx playwright test` (main flow: the empty state's new text and the order of the two `h2`s), lint, format and type checks, and the manual steps in Testing Strategy.

### Key Discoveries:

- `removeEntry` and `EntryActionButton`'s `remove` intent cover the whole write path. Phase 2 adds no action and no query.
- `GameWatchPicker` keeps the chosen platform in client state, which survives the `refresh()` that follows a successful action (`game-watch-picker.tsx:41-44`). After a removal, the same platform therefore shows „Obserwuj”.
- `rules.ts` is pure and imports `CatalogGame` as a type only, so the per-platform option can be decided there and unit-tested beside `watchState` (`tests/unit/watchlist/watch-state.test.ts`).
- `WatchlistEntryRow` uses `useId` without `"use client"`, so an id for the list's heading is available in the server-rendered `WatchlistEntries` as well.

## What We're NOT Doing

- No „Usuń” in the search on `/`: its result rows keep the disabled „Na liście”.
- „Usuń z listy obserwowanych” never removes the game on other platforms, the game's „Dowolna platforma” entry when a platform is chosen (or the other way round), or a phrase entry carrying the game's name.
- No confirmation before removal, as on the list in `/my-deals`. Adding the game back is one click on the same page.
- No focus management after a removal on the game page. The button swaps for „Obserwuj” and focus falls to the document, as it already does when „Obserwuj” turns into „Na liście”.
- No measured height. The scroll container's maximum height is a fixed CSS value equal to five one-line entries. A wrapped phrase, an open edit form or a narrow screen shows fewer entries at once.
- No collapsing or „Pokaż wszystkie” for the list, and no change to the list's skeleton (three rows, already under five).
- No PRD change: FR-004 already covers removing an entry. No roadmap change: M-2 closure and the Baseline refresh are a later `/10x-roadmap` run.
- No migration, no hosted step, no `CLAUDE.md` change.

## Implementation Approach

Phase 1 is a reorder plus one new container. It also removes what the reorder makes redundant (the jump link, the anchor, the second empty state), adds the matched deals' heading, and moves the E2E main flow and the test plan's description along with it.

Phase 2 moves the "what does the control offer for this platform" decision into one pure function in `rules.ts`. The function now returns the removal fields when the game is on the list, and it is unit-tested. The picker renders a remove button for that state, posting the existing `removeEntry`.

Each phase records its departures and verification in `change.md` in the commit that makes them (`context/foundation/lessons.md`).

## Critical Implementation Details

- **Focus rings in the scroller.** `overflow-y: auto` clips anything painted outside the container's padding box. Without inner padding, the cards' and buttons' focus indicators get cut at the top, bottom and sides. The container needs enough padding to hold the ring and its offset.
- **Scroll position after an edit.** A replaced entry comes back as the first row. When the user had scrolled the container down, the new version would sit out of view while focus goes to the heading above it. After a replace, the form that already moves focus to the `h2` also scrolls the list's container back to the top.

## Phase 1: The list on top of `/my-deals`

### Overview

The list moves above the matched deals, inside a scroll container about five entries tall. The matched deals get their own heading. The jump link, its anchor and the duplicate empty state go.

### Changes Required:

#### 1. Route and its loading state

**File**: `src/app/(app)/my-deals/page.tsx`, `src/app/(app)/my-deals/loading.tsx`

**Intent**: Render the list's boundary first and the matched deals' boundary after it, and drop the anchor wrapper. `loading.tsx` stacks the skeletons in the same order, so nothing moves when the page takes over.

**Contract**:
- The list's Suspense boundary stays unkeyed, and the matched deals' boundary stays keyed by `page`, so paging still leaves the list in place.
- `WATCHLIST_ANCHOR` is no longer imported.
- The route's doc comment describes the new order and drops the anchor paragraph.

#### 2. Page frame

**File**: `src/components/deals/my-deals-page.tsx`

**Intent**: The intro states the new order.

**Contract**: The one-line intro reads „Twoja lista obserwowanych, a pod nią okazje na gry i frazy z niej, od najnowszych.” The doc comment says list, then matched deals.

#### 3. Matched deals section

**File**: `src/components/deals/my-deals-section.tsx`

**Intent**:
- Give the matched deals a heading of their own, „Okazje z Twojej listy”, which stays put across loading, results, the empty state and an error, as `ListFrame` does for the list.
- Remove the jump link and the empty-list state, which the list's own empty state now covers.

**Contract**:
- A frame component (an `h2` „Okazje z Twojej listy” in a `section`) wraps `MyDealsResults`, `MyDealsError` and `MyDealsSkeleton`. The skeleton's status line stays as it is.
- `MyDealsSection` returns `null` for a list with no active entries, as it does without a user.
- `MyDealsNoEntries`, `WATCHLIST_ANCHOR` and the „Zmień listę obserwowanych” link are deleted. `MyDealsEmpty` on page 1 keeps „Zobacz wszystkie okazje” only.
- The doc comments say "below the watchlist" where they said "above".

#### 4. Watchlist section and its scroll container

**File**: `src/components/watchlist/watchlist-entries.tsx`

**Intent**: Hold the entries in a container whose height is capped at five one-line entries and that scrolls beyond them. Make it reachable from the keyboard and named for screen readers.

**Contract**:
- In `WatchlistEntries`, the `<ul>` sits in a container with a fixed `max-height` (five one-line entry rows plus the gaps between them plus the container's own padding, measured in the browser and written in rem) and `overflow-y: auto`.
- The container has `tabIndex={0}` and is labelled by the list's `h2`: `ListFrame` gives the heading an id, and the container references it.
- The inner padding keeps focus rings inside the box (see Critical Implementation Details).
- The empty, error and skeleton states are unchanged. The file's doc comments say the list is shown above the matched deals.

#### 5. Edit form: back to the top after a replace

**File**: `src/components/watchlist/entry-edit-form.tsx`

**Intent**: After an edit replaces an entry, the list's scroll container returns to the top, so the new version, which is first, is in view. This is the same moment the form already moves focus to the list's heading.

**Contract**: On a replace, the container that holds the row is scrolled to its top before focus moves. Closing with „Anuluj” or an answer that keeps the row changes no scroll position. The doc comment says so.

#### 6. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the states as they now look, and drop the deleted one.

**Contract**:
- The `MyDealsNoEntries` sample and import are removed.
- The matched-deals samples render inside their new heading frame, because the frame is part of the state components.
- The „Lista obserwowanych” sample shows the scroll container. If the sample has five entries or fewer, add one more entry so the scroll is visible.

#### 7. E2E main flow

**File**: `tests/e2e/main-flow.spec.ts`

**Intent**:
- The empty state the flow checks (steps 4 and 7) is now the list's own.
- Step 6 proves the new order, which is the risk this phase takes.

**Contract**:
- Steps 4 and 7 assert „Twoja lista jest pusta” in place of „Twoja lista obserwowanych jest pusta”.
- In step 6, the level-2 headings in `main` read, in order, „Twoja lista” then „Okazje z Twojej listy”, asserted via `getByRole("heading", { level: 2 })` with `toHaveText([...])`.
- The diff is a reviewed change of expected text that follows the planned behaviour. It is not an assertion bent to match a bug.

#### 8. Documents

**File**: `context/foundation/test-plan.md`, `context/changes/watchlist-on-top-and-game-remove/change.md`

**Intent**: The test plan's description of the main flow matches the new page, and the change log records the phase.

**Contract**:
- §6.5's main-flow paragraph says the entry and its „Usuń” sit in the list above the matched deals, and names the new empty-state text and the heading-order check.
- `change.md` gets a dated note for Phase 1: what departed from the plan, if anything, and what was verified.

### Success Criteria:

#### Automated Verification:

- Unit, db and hooks suites pass: `npm test`
- Lint passes with zero warnings: `npm run lint`
- Formatting passes: `npm run format:check`
- Types check: `npx tsc --noEmit`
- No reference to `WATCHLIST_ANCHOR`, `MyDealsNoEntries` or „Zmień listę obserwowanych” remains under `src/` or `tests/`
- The E2E suite passes against the local stack, main flow included: `npx playwright test`

#### Manual Verification:

- On `/my-deals` with six or more entries, „Twoja lista” is above „Okazje z Twojej listy”. The list shows about five entries and scrolls inside its container, while the page scrolls normally around it.
- With five or fewer entries, the container has no scrollbar and no empty space below the last entry.
- Tab reaches the container and its buttons. Focus rings are not clipped at the container's edges. Arrow keys scroll the focused container.
- Editing an entry while the container is scrolled down brings the new version into view at the top, with focus on „Twoja lista”.
- Going to page 2 of the deals leaves the list in place.
- With an empty list, only „Twoja lista jest pusta” shows. With entries but no matches, „Brak okazji na gry z Twojej listy” shows with „Zobacz wszystkie okazje” only.
- At 375 px width, the list and the deals fit without horizontal scrolling.

**Implementation Note**: After this phase and its automated verification, pause for Tomasz to confirm the manual checks before Phase 2.

---

## Phase 2: „Usuń z listy obserwowanych” on a game's page

### Overview

The watch control on `/games/<id>` removes the game's entry for the chosen platform when the list holds it, using the existing `removeEntry`.

### Changes Required:

#### 1. The per-platform offer, decided in one pure function

**File**: `src/lib/watchlist/rules.ts`, `src/lib/watchlist/types.ts`

**Intent**: Decide in one place, from data, what the game control offers for one platform and which hidden fields its button posts. When the game is on the list for that platform, the fields carry the id of exactly that entry.

**Contract**:
- A lookup returns the active game entry for (game id, platform), or null. Null platform means "any platform", a value of its own, as in the unique index. `isGameOnList` is expressed through it.
- A function builds the option for one platform from `{ signedIn, entries, game, platform }`:
  - `guest`: no fields;
  - `can_watch`: `gameEntryFields(game, platform)`;
  - `on_list`: `entryRemovalFields(entry)` of the entry the lookup found.
- `WatchOption` moves from `game-watch-picker.tsx` to `types.ts`, as a union discriminated by `state`, so the client half keeps importing types only.
- `watchState` keeps its signature for the search on `/`.
- The `WatchState` and `watchState` doc comments say that the game page offers removal where the search shows „Na liście”.

#### 2. Unit tests

**File**: `tests/unit/watchlist/watch-state.test.ts`

**Intent**: Pin the near misses, where removing the wrong entry would be the silent failure.

**Contract**: New cases for the option function:
- on the list for PS5 with PS5 chosen → `on_list` with that entry's id;
- the same game on „any platform” and on PS5, PS5 chosen → the PS5 entry's id, and any platform chosen → the other entry's id;
- a phrase entry equal to the game's name with no game entry → `can_watch` with the add fields;
- a different game on the list → `can_watch`;
- a visitor → `guest`, whatever the entries hold.

#### 3. Server half of the control and the route

**File**: `src/components/games/game-watch-control.tsx`, `src/app/(app)/games/[id]/page.tsx`

**Intent**: Pass `removeEntry` to the control, and build the options with the new function.

**Contract**:
- `GameWatchControl` and `GameWatchView` take `removeAction?: WatchlistAction` beside `addGameAction`.
- `GameWatchView` maps `[null, ...PINNABLE_PLATFORMS]` through the option function.
- The route imports `removeEntry` from `../../_watchlist/actions` and passes it.
- The doc comments name both actions.

#### 4. Client half of the control

**File**: `src/components/games/game-watch-picker.tsx`

**Intent**: For `on_list`, show „Usuń z listy obserwowanych” in place of the disabled „Na liście”.

**Contract**:
- For `on_list`, an `EntryActionButton` with `intent="remove"`, `label="Usuń z listy obserwowanych"`, `action={removeAction}`, the option's fields and `describedBy` the game's name.
- The button is keyed by platform and state, so a message from one platform's or one state's attempt goes away with it.
- `initialMessage` seeds whichever button shows, for the kitchen sink.
- The disabled „Na liście” branch is removed. The doc comment describes add and remove.

#### 5. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the remove state and its failure without posting.

**Contract**:
- „Obserwowanie: już na liście” now shows „Usuń z listy obserwowanych”.
- A new „Obserwowanie: nieudane usunięcie” renders `GameWatchView` with the sample game on the list and `initialMessage` set to the write-failed line.

#### 6. Actions' doc comment and change log

**File**: `src/app/(app)/_watchlist/actions.ts`, `context/changes/watchlist-on-top-and-game-remove/change.md`

**Intent**: The actions' header says the removal also comes from a game's page. The change log records Phase 2.

**Contract**:
- The module comment's list of who posts each action includes `/games/<id>` for the removal, and `removeEntry`'s one-line comment names both buttons. No behaviour changes.
- `change.md` gets a dated Phase 2 note with departures and verification.

### Success Criteria:

#### Automated Verification:

- Unit tests, the new option cases included, and the rest of the suite pass: `npm test`
- Lint passes with zero warnings: `npm run lint`
- Formatting passes: `npm run format:check`
- Types check: `npx tsc --noEmit`
- The E2E suite still passes: `npx playwright test`

#### Manual Verification:

- On `npm run dev`, signed in, a game's page with PS5 chosen: „Obserwuj” → „Usuń z listy obserwowanych” → pressing it shows „Usuwanie…” and then „Obserwuj” again, with PS5 still chosen. `/my-deals` no longer lists the game on PS5.
- With the game on the list for both „Dowolna platforma” and PS5, removing it on PS5 leaves the „Dowolna platforma” entry on the list and on the page.
- A phrase entry with the game's name stays on the list after a removal on the game page.
- Signed out, the page still shows „Zaloguj się, aby obserwować”.
- The kitchen sink shows the remove state and the failed-removal line.

**Implementation Note**: After this phase, the branch is ready for `/10x-impl-review`, the PR to `main`, and a fast-forward merge as for `watchlist-entry-edit`.

---

## Testing Strategy

### Unit Tests:

- The game watch option for one platform (Phase 2.2): which entry's id the removal posts, the any-platform/PS5 distinction, phrase entries ignored, guests.
- Existing `watchState` and `phraseWatchState` cases stay green unchanged.

### Integration Tests:

- `tests/e2e/main-flow.spec.ts`: the list's empty state before the add and after the removal, and the order of the two `h2`s on `/my-deals` with one entry. The game page's signed-in path cannot run in E2E, because the test server has no RAWG key. It is covered by the unit tests and by hand.

### Manual Testing Steps:

1. On `/my-deals` with 6+ entries: the list is on top, it scrolls within about five entries, keyboard focus reaches the container and its buttons, and the focus rings are whole.
2. Scroll the list down, edit an entry, save: the container is back at the top, the new version is first, and focus is on „Twoja lista”.
3. With an empty list: only „Twoja lista jest pusta” shows.
4. On a game's page, for one platform: add, then remove with „Usuń z listy obserwowanych”, and confirm on `/my-deals`.
5. Same game on „Dowolna platforma” and PS5: removing it on PS5 leaves the other entry.
6. At 375 px: no horizontal scroll on either page, and the game control's select shrinks rather than overflowing.

## Performance Considerations

None. The game page reads the same cached list it reads today, and the removal is the existing single-row update.

## Migration Notes

No schema change. Rollback is a plain `vercel rollback`: both phases are UI-only and use the existing `removeEntry`.

## References

- Change log and intent: `context/changes/watchlist-on-top-and-game-remove/change.md`
- Previous change on the same list: `context/archive/2026-10-30-watchlist-entry-edit/plan.md`
- Route order: `src/app/(app)/my-deals/page.tsx:44-56`
- Jump link and empty states: `src/components/deals/my-deals-section.tsx:131-195`
- List frame and states: `src/components/watchlist/watchlist-entries.tsx:63-120`
- Edit focus after replace: `src/components/watchlist/entry-edit-form.tsx:186-196`
- Game control: `src/components/games/game-watch-control.tsx:61-90`, `src/components/games/game-watch-picker.tsx:116-131`
- Removal action and query: `src/app/(app)/_watchlist/actions.ts:105-116`, `src/lib/watchlist/queries.ts:248-262`
- Unique active-game index: `supabase/migrations/20261007141021_create_watchlist_entries.sql:33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: The list on top of `/my-deals`

#### Automated

- [x] 1.1 Unit, db and hooks suites pass: `npm test` — 30d26cf
- [x] 1.2 Lint passes with zero warnings: `npm run lint` — 30d26cf
- [x] 1.3 Formatting passes: `npm run format:check` — 30d26cf
- [x] 1.4 Types check: `npx tsc --noEmit` — 30d26cf
- [x] 1.5 No reference to `WATCHLIST_ANCHOR`, `MyDealsNoEntries` or „Zmień listę obserwowanych” remains under `src/` or `tests/` — 30d26cf
- [x] 1.6 The E2E suite passes against the local stack, main flow included: `npx playwright test` — 30d26cf

#### Manual

- [x] 1.7 On `/my-deals` with six or more entries, „Twoja lista” is above „Okazje z Twojej listy”, and the list scrolls inside its container at about five entries — 30d26cf
- [x] 1.8 With five or fewer entries, the container has no scrollbar and no empty space below the last entry — 30d26cf
- [x] 1.9 Tab reaches the container and its buttons, focus rings are not clipped, and arrow keys scroll the focused container — 30d26cf
- [x] 1.10 Editing an entry while the container is scrolled down brings the new version into view at the top, with focus on „Twoja lista” — 30d26cf
- [x] 1.11 Going to page 2 of the deals leaves the list in place — 30d26cf
- [x] 1.12 With an empty list only „Twoja lista jest pusta” shows; with entries but no matches, „Brak okazji na gry z Twojej listy” shows with „Zobacz wszystkie okazje” only — 30d26cf
- [x] 1.13 At 375 px width, the list and the deals fit without horizontal scrolling — 30d26cf

### Phase 2: „Usuń z listy obserwowanych” on a game's page

#### Automated

- [x] 2.1 Unit tests, the new option cases included, and the rest of the suite pass: `npm test` — bb901be
- [x] 2.2 Lint passes with zero warnings: `npm run lint` — bb901be
- [x] 2.3 Formatting passes: `npm run format:check` — bb901be
- [x] 2.4 Types check: `npx tsc --noEmit` — bb901be
- [x] 2.5 The E2E suite still passes: `npx playwright test` — bb901be

#### Manual

- [x] 2.6 Signed in on a game's page with PS5 chosen: „Obserwuj” → „Usuń z listy obserwowanych” → „Usuwanie…” → „Obserwuj”, and `/my-deals` no longer lists the game on PS5 — bb901be
- [x] 2.7 With the game on „Dowolna platforma” and PS5, removing it on PS5 leaves the „Dowolna platforma” entry — bb901be
- [x] 2.8 A phrase entry with the game's name stays on the list after a removal on the game page — bb901be
- [x] 2.9 Signed out, the page still shows „Zaloguj się, aby obserwować” — bb901be
- [x] 2.10 The kitchen sink shows the remove state and the failed-removal line — bb901be
