---
change_id: watchlist-entry-edit
title: "Edit a watchlist entry: phrase text and platform"
status: planned
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

- **2026-10-30, Tomasz — the intent, as given.** Let a signed-in user edit an entry on their watchlist: a phrase entry its phrase text and its platform, a game entry its platform only. Today an entry can be created, read and removed, but not updated; the 10xDevs certification asks for CRUD "in a way sensible for the domain", and the course deadline is 2026-11-04.
- **2026-10-30 — workflow.** The work lives on branch `watchlist-entry-edit`, cut from `main` at 98bc657 after PR #5 (`game-search-and-pages`) merged, and goes to `main` in one PR before the submission. `/10x-frame` and `/10x-research` were skipped; `/10x-plan` ran with its own focused code reading, by an agent that could not interview Tomasz.
- **2026-10-30, Tomasz — decisions given before planning (settled).**
  - „Edytuj” on every entry of the list on `/my-deals`. A phrase entry edits its text and platform; a game entry its platform only. The form opens inline: `Fraza [....] Platforma [▾] [Zapisz] [Anuluj]`, or `Platforma [▾] [Zapisz] [Anuluj]` for a game.
  - Implemented as a replace with no database change: insert the new entry through the existing insert path, then mark the old one removed through `markEntryRemoved`. `authenticated` may update `removed_at` only, a migration would need a hosted `db:push`, and one dated 2026-10-30 or later breaks `tests/db/rule-change.test.ts` (its `SYNTHETIC` comment). The old version keeps its row (FR-004).
  - Insert first, then remove. A duplicate (23505) changes nothing and answers „Ta pozycja jest już na liście.”; a removal that fails after the insert leaves both entries and an error line (accepted for the MVP).
  - An unchanged edit (same phrase, same platform) writes nothing and closes the form.
  - Validation reuses `src/lib/watchlist/rules.ts`; the action calls `requireUser` and reads the old entry under RLS.
  - The decision of what an edit does is a pure function with a unit test (lessons.md).
  - Tests: unit for the decision and the schema; an edit step in `tests/e2e/main-flow.spec.ts` in a reviewed diff, no existing assertion weakened; kitchen-sink states for the form.
  - A short documents step; milestones are not closed here.
- **2026-10-30 — decided by the planner, not asked.**
  - „Unchanged” means the trimmed phrase equals the stored phrase exactly, with the same platform. A phrase that differs only in what the unique indexes ignore (letter case, Latin diacritics, punctuation — `isPhraseOnList` against the old entry), on the same platform, gets its own answer, „Ta fraza znajdzie te same okazje co obecna. Wpisz inną albo zmień platformę.”, and the form stays open. Reason: insert-first would collide with the entry being edited, and „already on the list” would mislead. Cost: a case-only correction („hades” → „Hades”) cannot be saved; remove and add again does it.
  - A too-short or too-long phrase answers „Fraza musi mieć od 3 do 100 znaków.”, not the generic forged-input line, because the edit's phrase is typed, not a hidden field. The edit schema therefore takes the phrase as a raw string and the pure decision judges its length.
  - A game edit copies `game_id`, `game_slug`, `game_name` and `game_released` from the row read under RLS; the form sends only `entryId`, `phrase` (phrase rows) and `platform`.
  - An entry that is no longer active (removed in another tab, or not the caller's) answers with a refresh and no message, so the row disappears — as `markEntryRemoved` treats zero rows as done.
  - An edited entry moves to the top of the list (`created_at` is not insertable; it is a new entry). Accepted.
  - A removal that fails after the insert answers „Zapisaliśmy nową wersję, ale poprzednia została na liście. Usuń ją ręcznie.” and refreshes, so both rows show.
  - The pure decision lives in a new `src/lib/watchlist/edit.ts` (`decideEntryEdit`), the schema in `rules.ts` (`editEntrySchema`), the read in `queries.ts` (`loadActiveEntry`), the form in a new client component `src/components/watchlist/entry-edit-form.tsx` that imports `vocabulary.ts` only, keeping zod out of the bundle.
  - „Edytuj” is hidden while its form is open, „Anuluj” returns focus to it, and opening moves focus to the first field. Several rows' forms may be open at once.
  - E2E shape: step 6a edits the phrase to `e2e-edit-<timestamp>` on „PC” and expects „Brak okazji na gry z Twojej listy”; step 6b edits it back to the title on „Dowolna platforma” and expects the deal's price and links again; step 7 is unchanged.
  - Documents: a new FR-011 in `prd.md` (Polish, must-have, with a note on the replace), the main flow's description in `test-plan.md`, and one `CLAUDE.md` bullet that an entry is never updated in place. `roadmap.md` is left to `/10x-roadmap`: no item carries this change ID.
- **2026-10-30 — planned.** `plan.md` (three phases: the decision and action; the form, kitchen sink and E2E; documents) and `plan-brief.md`. No migration, no hosted step. Next step: `/10x-plan-review watchlist-entry-edit` or `/10x-implement watchlist-entry-edit phase 1`.
- **2026-10-30 — Tomasz confirmed the planner's open points.** A phrase edit that differs only in what the unique indexes ignore (case, diacritics, punctuation) on the same platform is refused with the planned line, not handled by removing first. An edited entry moving to the top of the list is accepted. He skipped `/10x-plan-review`; next step `/10x-implement`, phase by phase.
