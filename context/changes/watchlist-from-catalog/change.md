---
change_id: watchlist-from-catalog
title: Watchlist of catalogue games and phrases, with optional platform
status: implementing
created: 2026-10-07
updated: 2026-10-08
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
- **2026-10-07 — Phase 2 departures from the plan.**
  - `native-select.tsx` is the registry's file run through Prettier, which `format:check` applies to `src/components/ui`. Only the formatting differs.
  - `rules.ts` also exports `pinLabel`, `MAX_QUERY_LENGTH`, `characterCount`, `releaseYear`, the `NewGameEntry` and `NewPhraseEntry` types, and the hidden-field builders `gameEntryFields`, `phraseEntryFields` and `entryRemovalFields`, whose keys come from the schemas.
  - Lengths count code points, as Postgres's `char_length` does, and the 100-character cut never splits a surrogate pair.
  - A catalogue date that is not `YYYY-MM-DD` is treated as no date, so such a game can still be added.
  - The schemas cap `gameId` at the Postgres integer maximum and `entryId` at `Number.MAX_SAFE_INTEGER`, and trim `gameSlug` and `gameName`. An unknown or absent `platform` in an action reads as any platform, as in the URL.
  - The views add headings the plan does not name: "Wyniki dla „…”" over each search outcome and "Twoja lista" over each list state. The kitchen sink adds a "Wczytywanie listy" state.
  - `WatchlistError` reuses `RetryButton` from `src/components/deals`.
- **2026-10-07, Tomasz — RAWG images deferred.** S-03 ships without them, as `plan.md` says under What We're NOT Doing. Thumbnails in search results, and on the watchlist from a stored `game_image_url`, are a candidate for a separate change. Images on deal cards wait until S-04 decides whether deals get RAWG ids.
- **2026-10-07 — notes for Phase 3 and Phase 4.**
  - The search views take a non-empty query. Mount the results `Suspense` only when `query` is not null; otherwise `SearchResultsSkeleton` flashes "Szukamy w katalogu…" with nothing searched.
  - The props the page passes and the action type (`WatchlistAction`) are in `src/components/watchlist/` and `src/lib/watchlist/types.ts`; the schemas in `src/lib/watchlist/rules.ts` return `NewGameEntry`, `NewPhraseEntry` and `{ entryId }`.
  - Phase 4 needs `vercel env ls` and `vercel logs`, but `vercel` is not on PATH on Tomasz's machine. `.vercel/project.json` exists, so try `npx vercel` with his login. Step 4.6 reuses the reads in `checks/isolation.sql`.
- **2026-10-08 — Phase 3 departures from the plan.**
  - `catalog.ts` passes `{ RAWG_API_KEY: process.env.RAWG_API_KEY }` to `readRawgApiKey`, as `scripts/catalog/probe.mts` does. TypeScript refuses `process.env` itself against the function's all-optional parameter (TS2559).
  - `page.tsx` hands the three actions to `SearchResultsSection` and `WatchlistSection` as props, so `src/components` imports nothing from `src/app`.
  - When the list cannot be read, `SearchResultsSection` treats it as empty: every result offers "Obserwuj", the database still refuses a duplicate, and the list below shows the failure with its retry.
  - `queries.ts` is `server-only`, like `src/lib/deals/queries.ts`, and keeps its own copy of `codeOf`. `markEntryRemoved` stamps `removed_at` with the server's clock, because an update through PostgREST cannot ask for `now()`.
  - `loading.tsx` shows the heading over the list's skeleton, without the search form: a form in the fallback would be replaced by the page's own and drop what was typed into it.
  - `error.tsx` reads "Nie udało się wyświetlić listy obserwowanych", copy the plan did not word.
  - `src/proxy.ts` changed, though the plan kept it as is. Probed against `next start`: the proxy redirected a signed-out Server Action call to `/login`, the browser re-sent the POST there and got `200 application/json {}`, and Next's client rejects that answer. The user saw `error.tsx`, and the actions' own `redirect("/login")` never ran. `decideAccess` now takes `isServerAction` — a POST with a `next-action` header, Next's own test — and lets such a call through, so the action redirects. Tomasz chose this over recording the gap. `CLAUDE.md` says that every action checks the user itself.
  - `catalog-search-form.tsx`, a Phase 2 file, now reads the query's default once, at mount. Base UI's input keeps its first default anyway, and logged a console error in development on every search once the live page re-rendered the form with each new `q`.
  - `vercel` is on PATH now (`C:\Program Files\nodejs\vercel`), so Phase 4 can call it directly.
- **2026-10-08 — Phase 3 verified in dev.**
  - At Tomasz's request the agent ran `npm run dev` and drove 3.6–3.12 through Chrome DevTools, signed in as the test account `kolekcjoner@przyklad22.pl`. For 3.10, a temporary account `izolacja-s03@przyklad22.pl` was created in an isolated browser context; Tomasz deletes it in Authentication → Users, and its rows go with it (`on delete cascade`).
  - 3.11 ran `RAWG_API_KEY=invalid npm run dev` from Git Bash, not the plan's PowerShell line. The log read `Searching the game catalogue failed: misconfigured, status 401`, with no `rawg.io`, `key=` or key value anywhere in it.
  - The proxy fix held in the browser: with B signed out in another tab, "Usuń" in a stale tab landed on `/login`, not on `error.tsx`.
  - Observed, not changed: RAWG timed out (5 s) on 3 of about 15 searches. `refresh()` re-runs the search after an add or a removal, so such a timeout replaces the results with the outage message right after a successful add. The plan rules out caching and retries for this slice.
  - Observed, not changed: the first `/` render after a long idle logged `Reading pipeline_runs failed: PGRST303` once, and a reload cleared it. The deals read predates this change.
- **2026-10-08 — Phase 4 departures from the plan.**
  - Tomasz added `RAWG_API_KEY` in the Vercel dashboard as a Sensitive variable (`vercel env ls` type `Secret`), for Production and Preview.
  - The work happens on `main`, so "merge" is Tomasz's push of `main`. The phase's commit lands before that push, because the acceptance (4.3–4.8) needs the deployed code; its Progress rows land in the epilogue commit.
  - The app's first variable read only at runtime ships through `vercel build` + `vercel deploy --prebuilt`. The production search is the proof that it reaches the functions: a log line `misconfigured, status none` would mean it does not.
