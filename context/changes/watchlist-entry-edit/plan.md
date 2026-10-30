# Edit a watchlist entry: phrase text and platform — Implementation Plan

> Date: 2026-10-30. Branch: `watchlist-entry-edit`, cut from `main` at 98bc657. Upstream: no `frame.md` and no `research.md`; Tomasz's decisions of 2026-10-30 and the planner's own are recorded in `change.md`.

## Overview

A signed-in user can change an entry on their watchlist from the list on `/my-deals`: a phrase entry its text and its platform, a game entry its platform. Each row gets „Edytuj”, which opens an inline form (`Fraza`, `Platforma`, „Zapisz”, „Anuluj”; a game row has no `Fraza`). Saving is a **replace**: the action inserts the new version through the existing insert path, then marks the old one removed through the existing `markEntryRemoved`. Nothing in the database changes.

This is the "U" of the watchlist's CRUD for the 10xDevs certification; it has to merge before 2026-11-04, so the plan keeps to three phases and adds no migration.

## Current State Analysis

- **Create, read, delete exist; update does not.** `src/app/(app)/_watchlist/actions.ts` holds `addGameEntry`, `addPhraseEntry` and `removeEntry`, each `requireUser()` → zod parse → write as the user → `answer()` (which calls `refresh()` on success).
- **The database allows no in-place edit.** `authenticated` holds `update (removed_at)` only, and the policy "owners remove their entries" admits an update only when it leaves the row removed (`supabase/migrations/20261007141021_create_watchlist_entries.sql:52-82`). `created_at` is not insertable either (`:53-54`).
- **Uniqueness is enforced by three partial unique indexes on active rows:** `watchlist_entries_active_game` (user, game, platform), `watchlist_entries_active_phrase` (user, `lower(phrase)`, platform) (`20261007141021…sql:33-39`), and `watchlist_entries_active_phrase_folded` (user, `fold_for_matching(phrase)`, platform, non-empty fold only) (`20261012070050_match_deals_to_watchlist.sql:159-161`). `insertGameEntry` / `insertPhraseEntry` map 23505 to `"duplicate"` (`src/lib/watchlist/queries.ts:120-191`).
- **`isPhraseOnList` already states the index rule in TypeScript** (fold-equal and non-empty, or equal after trim + lower case, same platform; null equals null) (`src/lib/watchlist/rules.ts:217-241`).
- **The list.** `WatchlistSection` → `WatchlistEntries` → `WatchlistEntryRow` (`src/components/watchlist/watchlist-entries.tsx:35-87`, `watchlist-entry-row.tsx`). The row is a server-safe component with one client island, `EntryActionButton` („Usuń”). The list is ordered newest first by `created_at`, then `id` (`queries.ts:78-79`).
- **Client bundles stay free of zod.** `vocabulary.ts` (`PINNABLE_PLATFORMS`, `pinLabel`, `characterCount`, `MAX_QUERY_LENGTH`) is the browser-safe half; `rules.ts` builds zod schemas at load (`vocabulary.ts:1-14`, game-search-and-pages Phase 3 note in its `change.md`).
- **The deploy-gating E2E** (`tests/e2e/main-flow.spec.ts`) watches a deal title as a phrase (step 5), finds it with „Usuń” and the deal among the matched ones on `/my-deals` (step 6), removes it (step 7).
- **Migrations are blocked in practice this week.** A migration dated ≥ 2026-10-30 breaks `tests/db/rule-change.test.ts` (its `SYNTHETIC` version must sort after the last real migration and before `20261030000000`, `:50-58`), and it would need a hosted `db:push`.

## Desired End State

- On `/my-deals`, every entry row shows „Edytuj” next to „Usuń”. Clicking it hides „Edytuj” and opens a form under the row's text:
  - phrase row: `Fraza` (prefilled with the phrase), `Platforma` (prefilled with the pin, „Dowolna platforma” for none), „Zapisz”, „Anuluj”;
  - game row: `Platforma`, „Zapisz”, „Anuluj”.
- „Zapisz”:
  - with a real change, the old row disappears and the new version appears at the top of the list (it is a new entry, newest first), and the matched deals above follow it in the same response;
  - with nothing changed (same trimmed phrase, same platform), nothing is written and the form closes;
  - with a phrase that is too short or too long, the form stays open with „Fraza musi mieć od 3 do 100 znaków.”;
  - with a phrase that differs from the current one only in what matching ignores (letter case, Polish diacritics, punctuation), on the same platform, the form stays open with „Ta fraza znajdzie te same okazje co obecna. Wpisz inną albo zmień platformę.”;
  - with a version already on the list, the form stays open with „Ta pozycja jest już na liście.” and nothing changes;
  - when the insert lands but the removal fails, both entries stay, the list refreshes, and the old row's form shows „Zapisaliśmy nową wersję, ale poprzednia została na liście. Usuń ją ręcznie.”;
  - when the old entry is no longer active (removed in another tab, or not the caller's), the list refreshes and the row is gone.
- „Anuluj” closes the form without a request and returns focus to „Edytuj”.
- The old version keeps its row with `removed_at` set (FR-004's history); no row is ever updated other than `removed_at`.
- `npm test`, lint, format, types and every E2E spec pass; the main flow includes an edit round trip.

### Key Discoveries:

- **Insert-first collides with the entry being edited.** The old entry is still active when the new one is inserted, so any new phrase that the unique indexes treat as equal to the old one (case-only or diacritic-only changes, same platform) would be refused as a duplicate of itself. The pure decision catches that case first (`same_match`) by running `isPhraseOnList([old], newPhrase, newPlatform)`, so the user gets an honest line instead of "already on the list" (`rules.ts:217-241`, indexes above).
- **The game's catalogue fields come from the old row, not from the form.** The edit form sends `entryId`, `phrase` (phrase rows only) and `platform`. For a game, the action copies `game_id`, `game_slug`, `game_name`, `game_released` from the row it read under RLS, so a forged form cannot rename a game.
- **A typed phrase is user input, unlike the add path's hidden field.** `addPhraseEntrySchema` treats a bad phrase as forged (`INVALID_INPUT`). The edit schema takes the phrase as a raw string, and the pure decision turns a bad length into a user-facing line.
- **A row's form closes in two ways.** On a real change or a vanished entry, `refresh()` re-renders the list and the row (keyed by `entry.id`) unmounts or is replaced. On "nothing changed" there is no refresh, so the client closes the form itself when the action answers with no message.
- **`refresh()` re-renders the whole page in the action's response** (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`), so the list and the matched deals update together; the E2E relies on that ordering.
- **„Edytuj” must hide while the form is open.** The E2E opens the form inside `toPass()` (a click before hydration does nothing, as main-flow's sign-out step already handles); a button that stayed visible would toggle the form shut on a retry.

## What We're NOT Doing

- No migration, no new grant, no RLS change, no `update` privilege on `phrase` or `platform`.
- No editing a game's identity (which catalogue game it is): that is remove + add from the search.
- No keeping the entry's place in the list: `created_at` is not insertable, so an edited entry moves to the top, as a newly added one does.
- No transaction around insert + remove: a failed removal after a successful insert leaves both entries (accepted for the MVP, with an error line).
- No guard against two tabs editing the same entry at once (both may insert; the second removal is a no-op). Same as today's add/remove semantics.
- No edit control anywhere but the list on `/my-deals` (not in search results, not on game pages).
- No client-side pre-check against the user's other entries; the database's unique indexes stay the arbiter, as for adds.
- No roadmap edit: the change is not a roadmap item; recording it is `/10x-roadmap`'s job.
- No closing of milestone M-2 or slice S-05.

## Implementation Approach

Logic first, then UI, then documents. Phase 1 adds a pure decision (`decideEntryEdit`) with its unit tests, a form schema, a single-entry read under RLS, and the `editEntry` Server Action that composes the existing insert and removal. Phase 2 adds the client form to the row, the kitchen-sink states and the E2E edit round trip in `main-flow.spec.ts`. Phase 3 updates the documents. Nothing needs a hosted step: the change ships with the normal CI deploy after merge.

## Critical Implementation Details

- **State sequencing in `editEntry`.** Read the old entry → decide → insert → only on `"ok"` call `markEntryRemoved(old.id)`. Never remove first: a removal followed by a refused insert would lose the entry. `refresh()` runs on success, on the half-done case (so both rows show) and on a vanished entry; it does not run on "unchanged", "same match", "invalid phrase", "duplicate" or a failed insert.
- **User experience spec.** Opening the form moves focus to its first field (`Fraza`, or `Platforma` on a game row). „Anuluj” returns focus to „Edytuj”. While saving, „Zapisz” reads „Zapisywanie…” and the fields and both buttons are disabled. The message line is `role="alert"`. Labels are tied to their controls with ids from `useId`, so several open forms on one page never share an id.

## Phase 1: Edit decision, single-entry read and the `editEntry` action

### Overview

Everything the edit does, with no UI: a pure decision with unit tests, the form schema, a read of one active entry under RLS, and the Server Action.

### Changes Required:

#### 1. Pure edit decision

**File**: `src/lib/watchlist/edit.ts` (new)

**Intent**: Decide, without I/O, what an edit of one entry means, so the action only performs it (lessons.md, "Separate logic from I/O").

**Contract**:
- `decideEntryEdit(entry: WatchlistEntry, input: { phrase: string | undefined; platform: PinnablePlatform | null }): EntryEdit`, where `EntryEdit` is one of:
  - `{ outcome: "invalid_phrase" }` — a phrase entry whose `toPhrase(input.phrase ?? "")` is null;
  - `{ outcome: "unchanged" }` — the platform is the same and either the entry is a game or the trimmed phrase equals the stored phrase exactly;
  - `{ outcome: "same_match" }` — a phrase entry, same platform, a different phrase that `isPhraseOnList([entry], phrase, platform)` reports as on the list;
  - `{ outcome: "replace", game: NewGameEntry }` — a game entry on another platform, its catalogue fields copied from `entry`;
  - `{ outcome: "replace", phrase: NewPhraseEntry }` — a phrase entry with a new phrase and/or platform, the phrase trimmed.
- `input.phrase` is not read for a game entry.
- Imports `toPhrase` and `isPhraseOnList` from `./rules`; pure, no framework import.

#### 2. Form schema

**File**: `src/lib/watchlist/rules.ts`

**Intent**: Parse the edit form the way the other three forms are parsed.

**Contract**:
- `editEntrySchema = z.object({ entryId, phrase, platform })`: `entryId` as in `removeEntrySchema`; `phrase` an optional raw string (length is judged by `decideEntryEdit`, not here); `platform` through the existing `platformField`.
- `entryEditFields(entry)` returning the hidden field `entryId`, named as the schema reads it (the visible fields carry their own `name`s: `phrase`, `platform`).
- The header comment's "three Server Actions" becomes four.

#### 3. Read one active entry

**File**: `src/lib/watchlist/queries.ts`

**Intent**: Let the action read the entry being edited as the caller, so RLS confines it to the caller's rows.

**Contract**: `loadActiveEntry(client, entryId): Promise<{ ok: true; entry: WatchlistEntry | null } | { ok: false }>` — the same `ENTRY_COLUMNS` and `entryRow` parse as `loadActiveEntries`, filtered by `id` and `removed_at is null`, at most one row. `null` means not found, removed or not the caller's (indistinguishable by design). Failures log PostgREST's code only, as the file's other reads do.

#### 4. The Server Action

**File**: `src/app/(app)/_watchlist/actions.ts`

**Intent**: The fourth watchlist change: replace an entry with its edited version.

**Contract**: `editEntry(_state: WatchlistActionState, formData: FormData): Promise<WatchlistActionState>`, in order:
1. `requireUser()` (outside any `try`);
2. `editEntrySchema.safeParse` → `INVALID_INPUT` on failure;
3. `loadActiveEntry` with a fresh `createClient()` → `WRITE_FAILED` on `{ ok: false }`; on `entry: null`, `refresh()` and `{ message: null }`;
4. `decideEntryEdit`:
   - `invalid_phrase` → „Fraza musi mieć od 3 do 100 znaków.”;
   - `unchanged` → `{ message: null }`, no refresh;
   - `same_match` → „Ta fraza znajdzie te same okazje co obecna. Wpisz inną albo zmień platformę.”;
   - `replace` → `insertGameEntry` or `insertPhraseEntry`; `"duplicate"` → `DUPLICATE`; `"failed"` → `WRITE_FAILED`; `"ok"` → `markEntryRemoved(old.id)`; on `"failed"` → `refresh()` and „Zapisaliśmy nową wersję, ale poprzednia została na liście. Usuń ją ręcznie.”; on `"ok"` → `refresh()`, `{ message: null }`.
- The file's doc comment names four changes and states the replace (insert first, then remove; why there is no in-place update).
- `src/lib/watchlist/types.ts`: the comments on `WatchlistAction` / `WatchlistActionState` name four actions; the type itself is unchanged.

#### 5. Unit tests

**File**: `tests/unit/watchlist/entry-edit.test.ts` (new)

**Intent**: Pin every outcome of the decision and the schema's reading of form data.

**Contract**, at least these rows:
- game: same platform → `unchanged`; other platform → `replace` with `gameId`, `gameSlug`, `gameName`, `gameReleased` copied and the new platform; any platform (null) ↔ pinned both ways; a `phrase` sent for a game is ignored.
- phrase: identical → `unchanged`; identical with surrounding spaces → `unchanged`; 2 characters, blank, absent, 101 code points (an emoji counts once) → `invalid_phrase`; exactly 3 and exactly 100 code points → accepted; case-only change, same platform → `same_match`; diacritic-only („wiedzmin” → „Wiedźmin”), same platform → `same_match`; case-only change on another platform → `replace`; a new text → `replace` with the phrase trimmed; two phrases that fold to empty but differ („!!!” → „???”) → `replace`; platform-only change → `replace` with the same phrase.
- `editEntrySchema`: `entryId` digits only („1e3”, „ 7”, „0” refused); empty or unknown platform → null; absent `phrase` passes as `undefined`.

### Success Criteria:

#### Automated Verification:

- The new unit tests pass: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint passes: `npm run lint`
- Formatting passes: `npm run format:check`
- Types check: `npx next typegen && npx tsc --noEmit`
- No migration added: `git diff --stat main -- supabase/` is empty

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Inline edit form on `/my-deals`, kitchen sink and E2E

### Overview

The row gets „Edytuj” and its inline form; the kitchen sink shows the form's states; the deploy-gating main flow gains an edit round trip.

### Changes Required:

#### 1. The edit form

**File**: `src/components/watchlist/entry-edit-form.tsx` (new, `"use client"`)

**Intent**: The row's „Edytuj” control and the inline form it opens, posting `editEntry` through `useActionState`, as `EntryActionButton` posts the other actions.

**Contract**:
- Props: `entry: WatchlistEntry`, `action?: WatchlistAction`, `describedBy?: string`, and for the kitchen sink only (read when `action` is undefined) `initialView?: "closed" | "open" | "saving"` and `initialMessage?: string | null`.
- Closed: a ghost „Edytuj” button described by the row's name id. Open: „Edytuj” is not rendered; a form with the hidden `entryId`, a `Fraza` text input (`name="phrase"`, phrase rows only, prefilled, `maxLength` `MAX_QUERY_LENGTH`), a `Platforma` `NativeSelect` (`name="platform"`, „Dowolna platforma” plus `PINNABLE_PLATFORMS` with `pinLabel`, prefilled), „Zapisz” (default variant) and „Anuluj” (ghost). No outline or destructive variants (focus contrast, `context/archive/2026-09-24-ui-init/change.md`).
- The form closes when the action answers `{ message: null }`; a message keeps it open under a `role="alert"` line.
- Imports only from `vocabulary.ts` and `types.ts` of `src/lib/watchlist/`, never `rules.ts` (keeps zod out of the bundle).
- Focus and pending behaviour as in Critical Implementation Details.

#### 2. The row and the list

**Files**: `src/components/watchlist/watchlist-entry-row.tsx`, `src/components/watchlist/watchlist-entries.tsx`, `src/app/(app)/my-deals/page.tsx`

**Intent**: Every row offers „Edytuj” beside „Usuń”, with the form spanning the row's width under its text.

**Contract**:
- `WatchlistEntryRow` takes `editAction?: WatchlistAction` (and passes the kitchen-sink props through); `WatchlistEntries` and `WatchlistSection` take `editAction` beside `removeAction`; `/my-deals` passes `editEntry`.
- On a 375 px screen the row does not overflow, and „Usuń”'s alert line still spans the row.
- Doc comments of the row, the list and the page mention editing (and that an edited entry moves to the top).

#### 3. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the form's states without posting.

**Contract**: In the „Moje okazje” section, beside the list states: a phrase row with the form open; a game row with the form open; a row with the form saving; a phrase row with the form open and „Fraza musi mieć od 3 do 100 znaków.”; a row with „Ta pozycja jest już na liście.”.

#### 4. E2E: edit round trip in the main flow

**File**: `tests/e2e/main-flow.spec.ts`

**Intent**: Prove in the deploy gate that an edit replaces the entry and that the matched deals follow it, both ways. Every existing assertion stays as it is (a reviewed diff; record it in `change.md`).

**Contract**: a new step between step 6 and step 7 (numbered `6a`/`6b` or renumbered with the header comment updated), on `/my-deals`:
- 6a — on the title's row, open „Edytuj” inside `expect(…).toPass()` until the `Fraza` field is visible; assert it holds the title and `Platforma` reads „Dowolna platforma”; fill `Fraza` with `e2e-edit-<Date.now()>` and choose „PC”; „Zapisz”. Assert: a row with „e2e-edit-…” and a „PC” badge is visible, the title's row is hidden, and then „Brak okazji na gry z Twojej listy” is visible (the row assertions come first: `refresh()` updates list and matched deals in one response).
- 6b — on the new row, „Edytuj”; `Fraza` back to the title, `Platforma` „Dowolna platforma”; „Zapisz”. Assert: the title's row is visible with „Dowolna platforma”, the „e2e-edit-…” row is hidden, and the matched cards again contain `{ price, links }` (the same `expect.poll` as step 6).
- Step 7 then removes the restored entry exactly as today.
- Locators by role, label and text only; no `waitForTimeout`; the edit phrase is unique per run.
- The spec's header comment lists the edit.

### Success Criteria:

#### Automated Verification:

- The whole suite passes: `npm test`
- Lint passes: `npm run lint`
- Formatting passes: `npm run format:check`
- Types check: `npx next typegen && npx tsc --noEmit`
- Every E2E spec passes locally, the extended main flow included: `npx playwright test`
- Deliberate break: with `markEntryRemoved` temporarily skipped in `editEntry`, `npx playwright test tests/e2e/main-flow.spec.ts` fails at the step 6a assertion that the title's row is hidden; the break is reverted and the spec passes again
- `entry-edit-form.tsx` does not import `src/lib/watchlist/rules.ts` (grep)

#### Manual Verification:

- On `npm run dev`, signed in with a list holding a phrase and a game: „Edytuj” opens the form with focus in its first field, „Anuluj” closes it with focus back on „Edytuj”, and no request is sent
- A game row offers only `Platforma`; changing it moves the game to the top of the list with the new badge, and the game's link still opens its page
- A phrase edit to an entry already on the list shows „Ta pozycja jest już na liście.” and leaves both entries as they were; a 2-character phrase shows the length line; „hades” → „Hades” on the same platform shows the same-matches line; saving with nothing changed closes the form
- At 375 px a row with the form open has no horizontal overflow
- The kitchen sink shows the open, saving and error states of the form

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Documents

### Overview

The product and testing documents say that an entry can be edited and how.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md` (Polish)

**Intent**: Record the requirement the change fulfils.

**Contract**: Under „Lista obserwowanych”, after FR-010: `FR-011: Użytkownik może zmienić pozycję na swojej liście obserwowanych: frazie tekst i platformę, grze platformę. Priority: must-have`, with a quoted note dated 2026-10-30 saying the edit is stored as removal of the old version plus a new entry, so FR-004's record of what was tracked holds, and that it came from the course's CRUD requirement. No other FR is renumbered or reworded.

#### 2. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: The main flow's description includes the edit.

**Contract**: The Phase 5 row (`:117`) and §6.5's description of `main-flow.spec.ts` mention the edit round trip; no other row changes.

#### 3. Rules file

**File**: `CLAUDE.md` (Supabase section)

**Intent**: Keep a future change from "fixing" the replace with an update grant.

**Contract**: One bullet: a watchlist entry is never updated in place — an edit inserts the new version and then marks the old one removed (`editEntry` in `src/app/(app)/_watchlist/actions.ts`); `authenticated` may update `removed_at` only.

#### 4. Change log

**File**: `context/changes/watchlist-entry-edit/change.md`

**Intent**: Departures and verifications, per `lessons.md`, in the commits that make them.

**Contract**: Dated notes for each phase's departures and verification; the E2E diff recorded as reviewed.

### Success Criteria:

#### Automated Verification:

- The whole suite passes: `npm test`
- No markdown in the documents step breaks a gate: `npm run lint` and `npm run format:check`

#### Manual Verification:

- Tomasz reads FR-011's wording in `prd.md` and accepts it or rewrites it

**Implementation Note**: After this phase, the branch is ready for `/10x-impl-review` and the PR to `main`.

---

## Testing Strategy

### Unit Tests:

- `decideEntryEdit`: every outcome, the boundaries of phrase length in code points, the self-collision cases (case-only, diacritic-only), fold-to-empty phrases, game vs phrase input handling.
- `editEntrySchema`: id parsing, platform reading, absent phrase.

### Integration Tests:

- None new at the db layer: no SQL changes, and the indexes the edit relies on are already pinned by `supabase/checks/matching.sql` and `tests/db/`.
- E2E: the main flow's edit round trip (phrase text and platform, matched deals following both ways), gated in CI.

### Manual Testing Steps:

1. Sign in on `npm run dev`, add a phrase and a game from the search on `/`.
2. On `/my-deals`, edit the phrase's text and platform; check the row moves to the top and the matched deals change.
3. Edit the game's platform; check the badge and the link.
4. Try a duplicate, a 2-character phrase, a case-only change and a no-op save; check each message or the closed form.
5. Open the form, press „Anuluj”, check focus.
6. Resize to 375 px with a form open.
7. Open `/kitchen-sink` and check the form's states.

## Performance Considerations

An edit costs one select, one insert and one update, then the same page re-render as any other watchlist action. Nothing else.

## Migration Notes

None. No schema change, no data change, no hosted step. Rollback is `vercel rollback`; rows written by edits are ordinary entries and removals, readable by the previous deployment.

## References

- Watchlist table, grants and policies: `supabase/migrations/20261007141021_create_watchlist_entries.sql:27-82`
- Folded phrase index: `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:159-161`
- Migration-date limit: `tests/db/rule-change.test.ts:50-58`
- Existing actions: `src/app/(app)/_watchlist/actions.ts`
- Inserts, removal, 23505: `src/lib/watchlist/queries.ts:115-216`
- Index rule in TypeScript: `src/lib/watchlist/rules.ts:217-241`
- Button pattern: `src/components/watchlist/entry-action-button.tsx`
- Platform select pattern: `src/components/search/catalog-search-form.tsx:154-169`
- Deploy-gating flow: `tests/e2e/main-flow.spec.ts`
- Next 16: `node_modules/next/dist/docs/01-app/02-guides/forms.md` (`useActionState`), `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`
- Previous plan in this format: `context/changes/game-search-and-pages/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Edit decision, single-entry read and the `editEntry` action

#### Automated

- [x] 1.1 The new unit tests pass: `npm test -- --project unit` — 9c7c1c0
- [x] 1.2 The whole suite passes: `npm test` — 9c7c1c0
- [x] 1.3 Lint passes: `npm run lint` — 9c7c1c0
- [x] 1.4 Formatting passes: `npm run format:check` — 9c7c1c0
- [x] 1.5 Types check: `npx next typegen && npx tsc --noEmit` — 9c7c1c0
- [x] 1.6 No migration added: `git diff --stat main -- supabase/` is empty — 9c7c1c0

### Phase 2: Inline edit form on `/my-deals`, kitchen sink and E2E

#### Automated

- [x] 2.1 The whole suite passes: `npm test` — 6620831
- [x] 2.2 Lint passes: `npm run lint` — 6620831
- [x] 2.3 Formatting passes: `npm run format:check` — 6620831
- [x] 2.4 Types check: `npx next typegen && npx tsc --noEmit` — 6620831
- [x] 2.5 Every E2E spec passes locally, the extended main flow included: `npx playwright test` — 6620831
- [x] 2.6 Deliberate break: with `markEntryRemoved` temporarily skipped in `editEntry`, `npx playwright test tests/e2e/main-flow.spec.ts` fails at the step 6a assertion that the title's row is hidden; the break is reverted and the spec passes again — 6620831
- [x] 2.7 `entry-edit-form.tsx` does not import `src/lib/watchlist/rules.ts` (grep) — 6620831

#### Manual

- [x] 2.8 On `npm run dev`, signed in with a list holding a phrase and a game: „Edytuj” opens the form with focus in its first field, „Anuluj” closes it with focus back on „Edytuj”, and no request is sent — 6620831
- [x] 2.9 A game row offers only `Platforma`; changing it moves the game to the top of the list with the new badge, and the game's link still opens its page — 6620831
- [x] 2.10 A phrase edit to an entry already on the list shows „Ta pozycja jest już na liście.” and leaves both entries as they were; a 2-character phrase shows the length line; „hades” → „Hades” on the same platform shows the same-matches line; saving with nothing changed closes the form — 6620831
- [x] 2.11 At 375 px a row with the form open has no horizontal overflow — 6620831
- [x] 2.12 The kitchen sink shows the open, saving and error states of the form — 6620831

### Phase 3: Documents

#### Automated

- [x] 3.1 The whole suite passes: `npm test` — 83300d5
- [x] 3.2 No markdown in the documents step breaks a gate: `npm run lint` and `npm run format:check` — 83300d5

#### Manual

- [x] 3.3 Tomasz reads FR-011's wording in `prd.md` and accepts it or rewrites it — 83300d5
