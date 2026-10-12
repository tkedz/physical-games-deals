# Deals Matched to the Watchlist — Plan Brief

> Full plan: `context/changes/deals-matched-to-watchlist/plan.md`

## What & Why

`/` still shows every deal to everyone. So the product's central claim is not yet shown end to end: that a collector sees only boxed-edition deals for the games on their own list, read out of posts nobody has to read.

This change adds the second filter, matching to the user's watchlist, in a private view. It completes US-01 and the PRD's primary success criterion, and it answers S-04's open questions in the roadmap.

## Starting Point

- **S-01** lists every physical, priced deal publicly at `/` (1,162 on 2026-10-06). Each deal carries only titles (`title`, `english_title`, `alternative_titles`), never a catalogue id.
- **S-03** lets a signed-in user keep catalogue games (RAWG id and name) and phrases on a private `/watchlist` behind RLS. Each entry can be pinned to a platform.

## Desired End State

A signed-in user follows „Moje okazje” to `/my-deals`. They see only the deals for the games and phrases on their list, newest first, each once, with the platform rule applied.

If the list is empty, the view says so and links to `/watchlist`. If nothing on it matches, the view says that too, under the last refresh time. Visitors are sent to `/login`, and `/` is unchanged.

On production, at least 80% of the watched games' deals reach the view, and at most 5% of what it shows is another game.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where the matched deals live | A private `/my-deals`. `/` stays public, and sign-in still lands there | Tomasz chose a separate view over narrowing `/` | Plan (Tomasz) |
| How a game entry matches | Its catalogue name's key equals a deal title's key. The key drops a trailing "(YYYY)", a leading "the" or "gra …", and trailing edition, platform and packaging words. Remake, Remastered and HD stay | On S-01's sample it catches 17–19 of 22 edition-suffixed deals and keeps series apart (Elden Ring ≠ Nightreign), with no catalogue calls | Plan (Tomasz) |
| Catalogue id on deals | Not now. Parked in the roadmap, provider-neutral | Tomasz is not committing to RAWG, and IGDB may replace it | Plan (Tomasz) |
| Where matching runs | Postgres: immutable functions, keys stored on deals as generated columns, and a `security_invoker` view | One paged query avoids the Data API's silent 1,000-row cap, RLS isolates users, and PGlite can run the truth table | Plan (Tomasz; stored keys: Plan) |
| Normalisation, for games and phrases | Letter case, every Latin diacritic (ł included) and punctuation set aside; apostrophes removed | „Dragon's Dogma” must find „Dragon’s Dogma 2”, and „pokemon” must find „Pokémon” | Plan (Tomasz) |
| Phrase duplicates | Judged by the same normalisation. A new folded index is added, the old one kept, and newer duplicates are marked removed | Two entries that match the same deals are one entry (S-03 review F4) | Plan (Tomasz) |
| Platform rule | A pin must equal the deal's platform. A deal with no platform, or `other`, reaches unpinned entries only. Switch 2 ≠ Switch | The PRD says „wyłącznie oferty na PS5”, and S-03 compares the pin directly | PRD / S-03 |
| Phrases and `alternative_titles` | Phrases match all three title fields | Tomasz's rule of 2026-10-06. Junk alternative titles count against the 5% | Roadmap |
| PRD question 5 (threshold) | At least 80% found and at most 5% wrong, measured on production with about 20 games | It measures silent misses, the main risk of the name rule | Plan (Tomasz) |
| What a deal card shows | Unchanged: no "matched because" line | That line would show RAWG names, and RAWG's terms would then require a rawg.io link | Plan |

## Scope

**In scope:**
- **Database.** A migration with the match functions, generated keys on `deals`, a folded phrase index, and the `matched_deals` view with its grants. The truth table `supabase/checks/matching.sql`.
- **App.** `/my-deals` with every state, the header link „Moje okazje” and a private path. A TypeScript mirror of the fold for the phrase pre-check, and the new phrase rule line on `/watchlist`.
- **Records.** The PRD, the roadmap and `CLAUDE.md`, and the production measurement in `acceptance.md`.

**Out of scope:**
- **Matching rules.** Platform compatibility, filtering alternative titles, and numeral equivalence ("Hades II" against "Hades 2").
- **Catalogue and pipeline.** Catalogue ids and card images, merging one offer listed on two aggregators, indexes on `deals`, prompt changes and re-extraction.
- **Other views.** Any change to `/` or to the sign-in landing.
- **Tooling.** A test runner, or any new dependency.

## Architecture / Approach

```
extractor inserts deals ──generated──▶ deals.match_keys[], deals.match_text
caller's watchlist_entries (RLS) ──keyed once per query──┐
                                                         ▼
   public.matched_deals (security_invoker): listed deals some active entry
   matches under the platform rule — each deal once
                                                         ▼
   /my-deals: getActiveEntries ‖ loadMatchedDealsPage ‖ loadLastRefresh
              → results | no matches | empty list | past the end | error
```

The page reads the view exactly as `/` reads `deals`, and it reuses S-01's card, freshness line and pagination.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Decisions on record and matching in the database | The PRD, roadmap and `CLAUDE.md` updated. The migration and its truth table proven in PGlite, then pushed and checked by Tomasz | EXECUTE grants for functions used in generated columns and indexes; edition words the list misses |
| 2. `/my-deals` states in the kitchen sink | Every state from sample data, pagination by base path, the phrase rule line, the screenshot gate | Copy and layout at 375 px |
| 3. `/my-deals` end to end in dev | The route, the read, the private path, the header link, and the fold mirror with its parity check | The TypeScript fold drifting from the SQL one |
| 4. Production acceptance and records | Deployment, the 80% / 5% measurement in `acceptance.md`, and the results in the PRD and roadmap | Recall under 80%: one tuning round, then stop |

**Prerequisites:** S-01 and S-03 are implemented, and Node 24 is active. Tomasz runs the push loop and the SQL editor, signs in, pushes `main`, and deletes the temporary accounts.
**Estimated effort:** about 4–5 sessions across 4 phases. Phases 1 and 4 are the heavy ones.

## Open Risks & Assumptions

- **Recall depends on `english_title`.** It names another game in 4 of 68 sample rows, and edition names missing from the qualifier list are missed silently. A phrase is the workaround, and the measurement shows how much this costs.
- **Stripping the year merges games that share a name.** „Silent Hill 2 (2001)” finds the remake's deals, but „Hades (2016)” would also find Hades (2020).
- **The grants rest on an assumption.** The plan assumes Postgres checks EXECUTE for functions inside generated columns and index expressions, against the role that inserts the row. It grants accordingly, and the PGlite run proves it.
- **Keys can go stale silently.** A matching function changed later without recomputing the keys leaves stale keys and raises no error. `CLAUDE.md` will state the recompute.
- **The demo account may show no Metroid deals.** Its Metroid Prime 4: Beyond is pinned to Switch 2. If that game's only deals are `switch`, the view shows none of them, which is the rule as decided.
- **The measurement sample is small.** Twenty games, chosen systematically: the first 20 that are on `/` and in the catalogue.

## Success Criteria (Summary)

- **No further step.** A signed-in user who adds a game sees its physical deals on `/my-deals`. A pinned entry narrows them to that platform, and the PRD's Silent Hill 2 example holds in the truth table.
- **Isolation.** No user ever sees another's matches, and visitors are sent to `/login`.
- **Measured quality.** On production, at least 80% of the watched games' deals reach the view, and at most 5% of what it shows is another game.
