---
change_id: deals-matched-to-watchlist
title: Deals matched to the watchlist, in a private view
status: implementing
created: 2026-10-09
updated: 2026-10-12
archived_at: null
---

## Notes

- **2026-10-09 — planned.** The decisions taken in the planning interview are in `plan-brief.md` (Key Decisions Made). Tomasz asked for the catalogue-id idea to be kept for later rather than dropped: RAWG serves the MVP, but IGDB may replace it, so the pipeline does not resolve deals to RAWG ids now. Phase 1 records it under Parked in `context/foundation/roadmap.md`.
- **2026-10-12 — Phase 1 departures from the plan.**
  - `public.matched_deals` also carries `kind` and `edition`, after `published_at`. Phase 3 has the page's query state the listed predicate itself (`.eq("kind", "game").eq("edition", "physical")`), and PostgREST answers 42703 on a view without those columns.
  - `game_match_key` reads the plan's leading "gra [platform]" as "gra" with an optional platform word, so pepper titles such as „Gra Final Fantasy X X-2 HD Remaster na PS4 Płyta Blu-ray” lose the "gra" too. The platform words are written once, in a subquery, and both patterns use them. The trailing pattern is the plan's, character for character.
  - `deal_match_keys` sorts in "C" order, so the stored array does not depend on the locale. `deal_match_text` leaves out a title that folds to nothing.
  - The migration's revert line also re-runs the S-03 comment on `watchlist_entries.phrase`.
  - `supabase/checks/matching.sql` covers more than the plan's tables:
    - fold cases that together cover every letter of the translate table and all six apostrophes, for Phase 3's parity check;
    - three more key cases: „Gra … na PS4 Płyta Blu-ray”, „Wiedźmin … (GOTY) | Pudełkowa” and „Pokémon Gold”;
    - one fixture deal per case, so that no broken rule hides behind another entry's match. The Witcher deal that a game and a phrase both match is the one deliberate exception;
    - EXECUTE privileges per role, the privileges on the view, and a note line with the server version and collation.
  - PRD `## Business Logic` drops „Dzięki temu dopasowanie gry przestaje być porównaniem dwóch dowolnych ciągów znaków”, which name matching makes untrue, and points to S-04 in the roadmap.
  - The roadmap keeps S-04's heading and its Backlog Handoff "Ready" cell as they were. The contract does not name them.
- **2026-10-12 — Phase 1 verified in PGlite** (0.5.8, PostgreSQL 18.3, collation C; the hosted project runs 17.6). The scratch harness applies every migration with stub Supabase roles, `auth.users`, `auth.uid()` and Supabase's default privileges, so the migration's revokes are exercised.
  - 1.1: `matching.sql` passed all 71 checks. With the `service_role` EXECUTE grant dropped, it failed 21 of them, starting with `42501 permission denied for function deal_match_keys` on the fixture insert: Postgres checks EXECUTE inside a generated column against the role that inserts the row, as the plan assumed. With the view's platform condition removed, it failed 4, naming the three pinned cases. The migration was restored from the index both times.
  - 1.2: of two phrases that fold alike, the newer was marked removed, and a tie on `created_at` went to the lower id. The same folded text on another platform or for another user, and „!!!” and „???”, stayed active. The folded index built.
  - With `auth.users` refusing inserts, the check took its fallback (the two oldest users, their entries marked removed until the rollback), passed all 71 checks, and left those entries active.
  - Tuning against the 68 listed rows of S-01's sample left the plan's qualifier pattern unchanged. All 26 rows with edition, platform or packaging words reach their game's bare key through at least one title. Of the 22 rows with edition words, the title alone does so in 18; the plan expected 17–19. Two rows miss with no qualifier to blame: „Colors Live + Pióro (Aplikacja do Rysowana)”, a game with a stylus, and „Zestaw Forza Horizon 6 + EA SPORTS FC 26”, a two-game set from prompt version 2.
- **2026-10-12 — Phase 1 verified on the hosted project.**
  - 1.5 and 1.7: Tomasz ran the push loop and read the PRD, roadmap and `CLAUDE.md` changes, and reported both as expected.
  - 1.6: `supabase/checks/matching.sql` in the SQL editor passed all 71 checks and rolled back, on PostgreSQL 17.6 with collation `en_US.UTF-8`. `auth.users` took the two fixture users, so the fallback did not run. The fold gave the same text as in PGlite under collation C.
  - 1.3: `npx supabase gen types typescript --linked --schema public` lists `deals.match_keys` and `deals.match_text`, the `matched_deals` view with its 15 columns, `kind` and `edition` included, and the four functions.
