# Edit a watchlist entry: phrase text and platform — Plan Brief

> Full plan: `context/changes/watchlist-entry-edit/plan.md`

## What & Why

A signed-in user can change an entry on their watchlist from `/my-deals`: a phrase its text and platform, a game its platform. Users can already create, read and remove entries but not update them; the 10xDevs certification asks for CRUD that fits the domain, and the course deadline is 2026-11-04.

## Starting Point

The list on `/my-deals` shows each entry with „Usuń”. The three Server Actions (`addGameEntry`, `addPhraseEntry`, `removeEntry`) live in `src/app/(app)/_watchlist/actions.ts`. The database lets `authenticated` update `removed_at` only, and the RLS policy only admits an update that leaves the row removed, so an in-place edit is impossible without a migration.

## Desired End State

Every row on `/my-deals` has „Edytuj”, which opens an inline form (`Fraza`/`Platforma` for a phrase, `Platforma` for a game) with „Zapisz” and „Anuluj”. Saving replaces the entry: the new version appears at the top of the list, the old one keeps its row as removed (FR-004's history), and the matched deals above follow in the same response. Duplicates, bad lengths and changes that matching would not notice answer with one line and change nothing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Edit mechanism | Replace: insert the new version, then `markEntryRemoved` the old | No migration (none can land this week without breaking `rule-change.test.ts` and needing a hosted push), and FR-004's history stays | Tomasz |
| Order | Insert first, remove second | A refused insert leaves everything as it was; a failed removal leaves two entries and an error line (accepted for MVP) | Tomasz |
| What is editable | Phrase: text + platform. Game: platform only | A game's identity comes from the catalogue; a different game is remove + add | Tomasz |
| No-op | Same trimmed phrase and same platform: no write, form closes | Nothing to change | Tomasz |
| Case- or diacritic-only phrase change, same platform | Refused with „Ta fraza znajdzie te same okazje co obecna…” | Insert-first would collide with the entry itself on the unique indexes; matching would see no difference anyway | Planner |
| Game fields on a game edit | Copied from the old row read under RLS, never from the form | A forged form cannot rename a game | Planner |
| Bad phrase length | User-facing line „Fraza musi mieć od 3 do 100 znaków.” | The phrase is typed, not a hidden field, so it is not a forged request | Planner |
| Entry gone (other tab / not the caller's) | Refresh, no message; the row disappears | Same as removal's "zero rows is done" | Planner |
| List position after edit | The new version moves to the top | `created_at` is not insertable; it is a new entry | Planner |
| Logic placement | Pure `decideEntryEdit` in `src/lib/watchlist/edit.ts`, unit-tested | lessons.md: logic out of I/O and components | Tomasz |
| E2E | Main flow gains an edit round trip (text + platform away, then back) | The deploy gate proves the replace and that matched deals follow both ways | Tomasz / Planner (shape) |
| Documents | PRD FR-011 (Polish), test-plan main-flow description, one CLAUDE.md bullet; roadmap untouched | The roadmap is `/10x-roadmap`'s; the CLAUDE.md line keeps a future change from adding an update grant | Planner |

## Scope

**In scope:**
- `decideEntryEdit`, `editEntrySchema`, `loadActiveEntry`, the `editEntry` action, unit tests
- `EntryEditForm` client component in each list row on `/my-deals`; kitchen-sink states
- Edit round trip in `tests/e2e/main-flow.spec.ts`
- PRD, test plan, CLAUDE.md and `change.md` notes

**Out of scope:**
- Any migration, grant or policy change; in-place updates
- Changing which game a game entry is
- Keeping an edited entry's list position; a transaction across insert + remove
- Edit controls in search results or on game pages
- Roadmap edits and milestone closing

## Architecture / Approach

The form posts `entryId`, `phrase` (phrase rows) and `platform` to `editEntry`. The action checks the user, parses the form, reads the old entry as the caller (RLS confines it), asks the pure `decideEntryEdit` what the edit means (`invalid_phrase`, `unchanged`, `same_match`, `replace`), and for a replace calls the existing `insertGameEntry`/`insertPhraseEntry` and then `markEntryRemoved`. `refresh()` re-renders the page, list and matched deals together. The client form imports only `vocabulary.ts`, so zod stays out of the bundle.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Edit decision, read and action | Pure decision + unit tests, schema, single-entry read, `editEntry` | Self-collision on the unique indexes, handled by `same_match` |
| 2. Inline form, kitchen sink, E2E | „Edytuj” on every row, form states, main-flow edit round trip | Hydration timing in the E2E (opened inside `toPass`, „Edytuj” hidden while open) |
| 3. Documents | FR-011, test-plan wording, CLAUDE.md bullet, change log | FR-011 wording is Tomasz's call |

**Prerequisites:** branch `watchlist-entry-edit` from `main` at 98bc657; local Supabase stack for E2E; Node 24.
**Estimated effort:** ~1–2 sessions across 3 phases; no hosted step.

## Open Risks & Assumptions

- A failed removal after a successful insert leaves two entries until the user removes one (accepted for MVP).
- Two tabs editing one entry at once can leave two new entries.
- An edited entry jumps to the top of the list; a user may read that as "moved".
- Refusing case-only phrase corrections is a planner decision Tomasz may want to reverse (it would need remove-first for that case, which risks losing the entry).

## Success Criteria (Summary)

- On `/my-deals`, a user edits a phrase's text and platform, or a game's platform, and sees the list and the matched deals follow at once.
- Bad, duplicate or no-op edits change nothing and say why (or simply close).
- The deploy-gating E2E proves the round trip, and every gate stays green with no migration.
