# Watchlist above the matched deals, and removal on a game's page — Plan Brief

> Full plan: `context/changes/watchlist-on-top-and-game-remove/plan.md`

## What & Why

On `/my-deals` the editable watchlist sits at the bottom, under a long list of matched deals, which is not intuitive. It moves to the top. A game's page lets a signed-in user add the game to the list but not take it off. It gets „Usuń z listy obserwowanych”. Both should ship before the 2026-11-04 deadline.

## Starting Point

- `/my-deals` renders the matched deals (no heading of their own), then „Twoja lista” under a `#lista` anchor. The deals' empty state has „Zmień listę obserwowanych”, a jump down to that anchor.
- An empty list shows two empty states, one per section.
- On `/games/<id>`, the watch control shows „Obserwuj” or a disabled „Na liście” for the platform chosen in its select. It knows no entry id.
- Removal itself exists already: `removeEntry` and `EntryActionButton`'s `remove` intent.

## Desired End State

`/my-deals` shows „Twoja lista” first, in a container about five entries tall that scrolls beyond that, then „Okazje z Twojej listy”. With an empty list, it shows only „Twoja lista jest pusta”.

On a game's page, a game on the list for the chosen platform shows „Usuń z listy obserwowanych”. Pressing it removes that one entry and brings „Obserwuj” back.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| „Zmień listę obserwowanych” | Removed, with `#lista` and `WATCHLIST_ANCHOR` | With the list above, the jump would point at something already in view. |
| Long list | Scroll container capped at five one-line entries (fixed CSS `max-height`) | Keeps the deals close to the top with no client-side measuring. A wrapped or open row shows fewer entries at once, which is accepted. |
| Empty list | Only the list's „Twoja lista jest pusta”; the deals section renders nothing | One message, in the section it is about. The E2E text changes in a reviewed diff. |
| Matched deals' heading | New `h2` „Okazje z Twojej listy”, framing every state of that section | Below the list's `h2`, the deals would otherwise read as part of the list. |
| After an edit | The list's container scrolls back to the top | The new version is first, and focus already moves to the list's heading. |
| What „Usuń” removes | The game entry for exactly the chosen platform | It undoes what „Obserwuj” added; the unique index makes it one row. Phrases and other platforms stay. |
| Game page control | „Usuń z listy obserwowanych” replaces the disabled „Na liście” | Tomasz's wording: the label says both the state and the action. The search on `/` keeps „Na liście”. |
| Phases | Two, one PR, fast-forward `main` | As agreed for `watchlist-entry-edit`. Documents ride with their phase. |

## Scope

**In scope:**
- The reorder of `/my-deals` and its loading state, the new intro line and the deals' heading.
- The scroll container, its keyboard access and name, and scrolling back to the top after an edit.
- Removing the jump link and `MyDealsNoEntries`.
- A pure per-platform option function in `rules.ts` with unit tests, and the remove button on the game page.
- Kitchen sink, `main-flow.spec.ts`, `test-plan.md` §6.5, `change.md` notes.

**Out of scope:**
- „Usuń” in the search on `/`.
- Removing a game on every platform at once.
- A confirmation dialog, and focus management after a removal.
- A measured container height, or collapsing the list.
- PRD and roadmap edits, migrations, hosted steps.

## Architecture / Approach

Phase 1 is markup and one container. The two Suspense boundaries swap places (the deals' stays keyed by page), and the redundant pieces go.

Phase 2 moves the control's per-platform decision into one pure function. It returns the add fields for „Obserwuj” or the removal fields of the matching entry for „Usuń z listy obserwowanych”. The client picker renders an `EntryActionButton` posting the existing `removeEntry`, whose `refresh()` re-renders the page while the chosen platform stays.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. The list on top of `/my-deals` | List first, in a five-entry scroller; deals with their own heading; one empty state | Clipped focus rings inside `overflow`, or an edited entry landing out of view |
| 2. „Usuń z listy obserwowanych” on a game's page | Removal of the chosen platform's entry from the game page | Posting the wrong entry's id (any-platform vs pinned), covered by unit tests; no E2E path, because CI has no RAWG key |

**Prerequisites:** The local Supabase stack for `npx playwright test`. `RAWG_API_KEY` in `.env.local` for the manual game-page checks on `npm run dev`.
**Estimated effort:** About one session for both phases.

## Open Risks & Assumptions

- The five-entry cap is a fixed height measured on one-line rows. On a phone, or with long phrases, fewer entries show before the container scrolls.
- The signed-in game page has no E2E coverage. The unit tests and the manual steps carry it.
- After a removal on the game page, focus falls to the document, as it already does after an add.

## Success Criteria (Summary)

- A user opening `/my-deals` sees and edits their list first, without scrolling past the deals.
- A user on a game's page can take the game off the list for the chosen platform, and nothing else is removed.
- `npm test`, lint, format, `tsc` and `npx playwright test` pass.
