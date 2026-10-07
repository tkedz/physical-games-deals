---
change_id: watchlist-from-catalog
title: Watchlist of catalogue games and phrases, with optional platform
status: implementing
created: 2026-10-07
updated: 2026-10-07
archived_at: null
---

## Notes

- **2026-10-06, Tomasz — two answers given before planning.** PRD and roadmap question 6: when the catalogue does not answer, the user sees one generic message that the catalogue is temporarily unavailable. Roadmap question 9: yes — besides catalogue games, a user can watch phrases (keywords). This reverses the PRD ruling that only catalogued games may be watched (`context/foundation/prd.md:98`). Phase 1 of `plan.md` records both answers in the PRD and the roadmap.
- **2026-10-07 — planned.** The decisions taken in the planning interview are in `plan-brief.md` (Key Decisions Made).
- **2026-10-07 — Phase 1 departures from the plan.**
  - PRD `## Business Logic`: the kept sentences on catalogue identity now say "gra dodana do listy obserwowanych" and "dopasowanie gry", so the phrase rule does not make them untrue.
  - PRD `:96`, `:104` and FR-005 now name games and phrases. The plan did not list them; Tomasz chose to align them in this phase.
  - Roadmap: `FR-010` joins the PRD refs of S-03 and S-04 (At a glance and both bodies) and the milestone's scope anchors, and the S-03 Backlog Handoff title names phrases. The plan's contract did not list these index updates.
  - `CLAUDE.md:47` grants `authenticated` "select plus column-level insert and update on just the columns they write", not "only the columns it writes", because the select grant is table-wide.
  - The migration places its four justification points as `create_deals.sql` places each kind of note — the platform mirror above `create table`, no delete in the grants comment, Vercel and RLS above the policies — rather than in one block.
- **2026-10-07 — Phase 1 verified on the hosted project.**
  - 1.3 and 1.6: Tomasz ran the push loop and read the PRD and roadmap changes, and reported both as expected.
  - 1.4: `checks/grants.sql` shows `authenticated` with table-level SELECT, INSERT on the seven writable columns and UPDATE on `removed_at` only, and nothing on the table for `anon` or `service_role`. All three roles hold USAGE on `watchlist_entries_id_seq` through Supabase's default privileges, as for the existing tables.
  - 1.5: `checks/isolation.sql` passed all 15 checks and rolled back. Because `authenticated` already holds that sequence usage, the insert alone cannot show that an identity column needs no sequence grant. A local PGlite run without default privileges shows it: the insert passed with usage `false`.
  - 1.2: `npx supabase gen types typescript --linked --schema public` lists `watchlist_entries` with the planned columns and nullability.
