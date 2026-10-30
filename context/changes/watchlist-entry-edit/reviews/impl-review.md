<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit a watchlist entry: phrase text and platform

- **Plan**: context/changes/watchlist-entry-edit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria, rerun on 2026-10-30

- Gates on the branch head:
  - `npm test`: 638 passed;
  - `npm run lint` and `npm run format:check`: clean;
  - `npx next typegen && npx tsc --noEmit`: exit 0.
- Diff checks:
  - `git diff --stat main -- supabase/` is empty, so no migration;
  - `entry-edit-form.tsx` imports none of `rules`, `edit` or `queries`.
- E2E: CI on PR #6 ran the branch head `a6df54e` against a production build and passed 5 of 5 specs (`failOnFlakyTests` on). The only existing lines changed in `main-flow.spec.ts` are its header comment, and no assertion was removed or weakened.
- The deliberate break (removal skipped, step 6a red) rests on the Phase 2 implementer's report, recorded in `change.md`.
- Manual 2.8–2.12 were run by the orchestrator in a browser with observable evidence, recorded in `change.md`. Tomasz accepted 3.3 (FR-011). None of the rows is rubber-stamped, but 2.10 exercised the error lines only on entries with no platform pin, so it could not show F1.

## Checked and fine

- **Plan drift:** none. Every planned change exists and every departure is recorded in `change.md`. There is no migration, no grant or policy change, and no in-place update; the only `.update(` is `markEntryRemoved`'s `removed_at`.
- **Security:** `requireUser()` runs first, outside any try. A forged `entryId` reads nothing under RLS, so the answer is a refresh and no write. `kind`, `game_*` and `user_id` never come from the form. Validation is the same as on add (`toPhrase`, `platformField`, `positiveInteger`). There is no XSS path.
- **Insert, then remove:**
  - a duplicate or failed insert writes nothing;
  - a failed removal keeps both entries and shows the planned line;
  - an entry already removed refreshes;
  - a double submit is blocked while pending.

  No path loses an entry.
- **Patterns:** `loadActiveEntry` follows `loadActiveEntries`, `editEntry` follows its sibling actions, and the form follows `EntryActionButton`. The unit tests use the existing table style. E2E steps 6a/6b reuse the `toPass` pattern.

## Findings

### F1 — After an error line the platform select resets to „Dowolna platforma”, and the next „Zapisz” saves that

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/watchlist/entry-edit-form.tsx:162-183, 207-214 (and the comment at :51-53)
- **Detail**:
  - **Why:** the form submits through `<form action={formAction}>`. React 19 resets such a form (`form.reset()`) when the action's transition commits. A controlled `<input>` survives that reset, because React keeps its `defaultValue` in step. A controlled `<select>` does not: its options never get `defaultSelected`, so the reset selects the first option, `""`. React state still holds the old platform, so nothing re-renders the DOM back.
  - **Reproduced on the dev server on 2026-10-30:**
    1. „hades” was pinned to PS5, and the select opened on `ps5`.
    2. Typing „Hades” and pressing „Zapisz” returned the same-match line.
    3. The select now showed „Dowolna platforma” (`""`), while the phrase kept „Hades”.
  - **Effect:** a user who then fixes the text and presses „Zapisz” re-pins the entry to any platform without choosing it. The same happens after the duplicate, length and old-version-kept lines on any entry pinned to a platform. Nothing is lost, but the pin silently changes.
- **Fix**: Submit without React's automatic reset: `onSubmit` calls `event.preventDefault()`, then `startTransition(() => formAction(new FormData(event.currentTarget)))`, and `isPending` stays from `useActionState`. Correct the comment at :51-53, and add an E2E assertion to step 6a: after an error line on the PC-pinned phrase, the select still shows PC.
  - Strength: removes the reset at its source for both fields. The E2E assertion pins the regression in the deploy gate.
  - Tradeoff: a small change to the form's submission path. The form then needs the E2E and manual 2.10 rerun on a pinned entry.
  - Confidence: HIGH. Reproduced in the browser, and the mechanism was read in `react-dom` 19.2.8.
  - Blind spot: whether `requestSubmit`/Enter keeps working identically. It should, since `onSubmit` handles both.
- **Decision**: PENDING

### F2 — After a successful edit, focus falls to the page body

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/watchlist/entry-edit-form.tsx:91-101, 168
- **Detail**: On a null answer the form returns focus to the old row's „Edytuj”, but `refresh()` then removes that row. Keyboard and screen-reader users are left on `<body>`, while the new version appears at the top of the list unannounced. „Usuń” behaves the same today when its row goes.
- **Fix**: Accept, since it matches „Usuń”. Alternatively, move focus to the „Twoja lista” heading after a replace.
- **Decision**: PENDING

### F3 — Two tabs editing the same entry can leave two new versions

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/_watchlist/actions.ts:145-168
- **Detail**: Tabs A and B both read entry X. Each inserts its own version, and each removes X; the second removal changes zero rows and counts as done. The user then has two active entries from one edit. Nothing is lost, and each can be removed. Closing the race needs a database function, which the plan ruled out.
- **Fix**: Accept for the MVP and note it in `change.md` beside the other accepted limits.
- **Decision**: PENDING

### F4 — Kitchen-sink sample and one non-retrying E2E read

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/kitchen-sink/page.tsx:789-794; tests/e2e/main-flow.spec.ts (step 6a, `selectedLabel`)
- **Detail**: Two small points:
  - **Kitchen sink:** the "Edycja: fraza za krótka" state shows the valid phrase „Fire Emblem” under the too-short line.
  - **E2E:** step 6a reads the select's label once through `evaluate` (`expect(await selectedLabel(...)).toBe(...)`). The rest of the spec uses retrying locator assertions. It is safe in practice, because it follows a retrying `toHaveValue` on the same form.
- **Fix**: Give the kitchen-sink state a 2-character sample phrase, and replace the one-shot read with `await expect(platformField).toHaveValue("")`.
- **Decision**: PENDING
