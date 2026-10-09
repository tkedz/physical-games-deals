<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Watchlist from the Catalogue

- **Plan**: context/changes/watchlist-from-catalog/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Evidence

- Automated criteria re-run on 2026-10-09:
  - `npm run lint` and `npm run format:check` exit 0, and `npm run build` succeeds.
  - The build lists `/watchlist` as dynamic, and `.next/server/app/kitchen-sink.meta` holds status 404.
  - `grep -rn "NEXT_PUBLIC_RAWG" src` prints nothing. Both files carry `server-only`.
  - The colour grep prints nothing. `package.json`, `package-lock.json`, `components.json` and `globals.css` are unchanged since `cea2f1a^`, and `native-select.tsx` is the only addition to `src/components/ui`.
- Production:
  - `curl -sI https://physical-games-deals.vercel.app/watchlist` answers `307` with `Location: /login`.
  - `vercel env ls` lists `RAWG_API_KEY` (type Secret) for Production and Preview.
  - A guest POST to `/watchlist` with a forged `next-action` header answers `404 Server action not found.` without rendering the page.
- Not re-run:
  - 3.5 (dev curl): production's 307 covers the same rule.
  - 4.4 (`vercel logs`): the check is bound to the acceptance hour, and change.md records its result.
- Plan drift: every intent-level departure is recorded in change.md (the proxy change included), and "What We're NOT Doing" is respected. F10 lists the only undocumented ones.

## Findings

### F1 — Dev server can print the RAWG URL, key included

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: next.config.ts:3, src/lib/watchlist/catalog.ts:13-16
- **Detail**: Under `next dev`, Next's Server Components HMR cache covers every `fetch`, `no-store` included. The option is experimental and defaults to true (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverComponentsHmrCache.md`; `config-shared.js:267`).
  - For a 200 response, Next clones the body into that cache. If reading the clone fails, it runs `console.warn("Failed to set fetch cache", input, error)` (`node_modules/next/dist/server/lib/patch-fetch.js:202-206`). Here `input` is `${SEARCH_URL}?${params}`, which carries `key=`.
  - `rawg.ts:147-155` expects exactly that trigger: "the timeout can still fire, or the connection drop, while the body streams in". Next's guard skips the warning only when the incoming request was aborted, not RAWG's fetch.
  - The key then reaches the dev terminal, which agents read in this repo (Phase 3 ran `npm run dev`). That breaks CLAUDE.md's "request URLs are never logged".
  - catalog.ts:13-16 names `logging.fetches` as the only Next path that prints URLs. Production is unaffected: the clone path is dev-only, and `logging.fetches` is off.
- **Fix**: Set `experimental: { serverComponentsHmrCache: false }` in next.config.ts. Extend the catalog.ts comment to name both Next paths that print fetch URLs.
- **Decision**: FIXED — next.config.ts sets `serverComponentsHmrCache: false`, and the catalog.ts header names both paths. Lint and format pass; the build lists the experiment as `⨯ serverComponentsHmrCache`.

### F2 — Per-account abuse of the shared RAWG quota and table is not bounded or recorded

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007141021_create_watchlist_entries.sql:50-55, src/lib/watchlist/queries.ts:87-92
- **Detail**: Registration is open (prd.md).
  - **RAWG quota.** A script that requests `/watchlist?q=…` as one signed-in account can spend the shared 20,000 requests a month. Every user then sees "Katalog gier jest chwilowo niedostępny" (`rate_limited`).
  - **Table growth.** The same account can loop add-and-remove through the actions, or through PostgREST directly with its own JWT and the publishable key. Soft removal keeps every row, so the table grows without bound. `game_name` and `game_slug` have no length check, so each row can be large.
  - **Read limit.** `loadActiveEntries` has no `.limit()`, so PostgREST's max-rows setting would cut a very long list without a word.
  - plan-brief.md:71 records the quota cost of normal use. The plan's "No caching, throttling or retries" is a cost decision. Neither document records abuse by a single account.
- **Fix A ⭐ Recommended**: Record it as an accepted MVP risk in the infrastructure risk register, naming the trigger to act (e.g. RAWG `rate_limited` in the logs, or an unexpected row count).
  - Strength: matches the plan's explicit no-throttling stance, and costs no code or migration.
  - Tradeoff: the risk stays open, and one account can still deny search to everyone.
  - Confidence: HIGH — consistent with how the plan treats quota cost.
  - Blind spot: actual sign-up volume and whether anyone would bother.
- **Fix B**: An additive migration with a per-user row cap (a BEFORE INSERT trigger raising `check_violation`) and length checks on `game_name`/`game_slug` (`not valid`, then `validate`), plus a matching `.limit()` in `loadActiveEntries`.
  - Strength: closes table growth, and F3, in one migration. The action already maps a check violation to "Nie udało się zapisać zmiany".
  - Tradeoff: a new migration and push loop for Tomasz, and it does nothing for the RAWG quota.
  - Confidence: MED — the cap value is a guess.
  - Blind spot: the right cap, and how a capped user is told.
- **Decision**: FIXED via Fix A — a new open row at the end of the Risk Register in context/foundation/infrastructure.md, accepted for the MVP, with `rate_limited` in the log or an outsized row count as the trigger to act.

### F3 — Game fields: the app's limits are not the database's, and the comment says they are

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/watchlist/rules.ts:8-10, supabase/migrations/20261007141021_create_watchlist_entries.sql:12-14
- **Detail**: rules.ts says "the limits here are the database's own", which holds for phrases only.
  - zod holds `gameSlug`/`gameName` to 1–200 trimmed characters. The table accepts any length, an empty string or an untrimmed value.
  - Only the account itself can harm this way. A direct PostgREST insert with an out-of-range `game_released` (e.g. `10000-01-01`) fails `z.iso.date()` in `entryRow`. `z.array(entryRow)` then fails as a whole, so the list shows `WatchlistError` on every visit and the row cannot be removed from the UI.
  - In the other direction, a RAWG name over 200 code points, or blank after trimming, gets "Coś poszło nie tak" on every click (unlikely).
- **Fix**: Correct the rules.ts comment to say the limits match the database for phrases. The game-field checks belong in F2's migration if Fix B is chosen.
- **Decision**: FIXED — the rules.ts header now says the database holds the limits on a phrase, the game id and the platform, and that the slug and name are an accepted risk (F2's Risk Register row). The database checks are not added.

### F4 — The phrase duplicate rule folds case but not diacritics, while matching folds both

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20261007141021_create_watchlist_entries.sql:37-39, src/lib/watchlist/rules.ts:140-152
- **Detail**: Duplicates are judged on `lower(phrase)` and on JS `trim().toLowerCase()`. FR-010 matching ignores both case and Polish diacritics.
  - "Wiedzmin" and "Wiedźmin" can therefore both sit on one list and match exactly the same deals in S-04, which must then not report one deal twice.
  - Postgres `lower()` depends on the database's LC_CTYPE, and JS `toLowerCase()` does not, so the two can disagree for non-ASCII letters. Either way the result is only a stricter UI or a DUPLICATE line.
- **Fix**: Add an answered unknown to roadmap S-04: phrase duplicates fold case only, so matching must dedupe per deal. S-04 also decides whether the duplicate rule should fold diacritics too.
- **Decision**: FIXED — a new unknown under S-04 in context/foundation/roadmap.md: matching shows a deal once, and S-04 decides whether the duplicate rule should fold diacritics.

### F5 — Add and remove wait for a RAWG round-trip while results are open

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/watchlist/actions.ts:60, src/app/(app)/watchlist/page.tsx:46-56
- **Detail**: The plan accepts the extra RAWG request that `refresh()` costs (plan.md:662), but not its latency.
  - The results' Suspense key does not change on `refresh()`, and the action's re-render is a transition. React therefore keeps the old UI until the RAWG-dependent boundary resolves, so "Usuwanie…" or "Dodawanie…" stays up for RAWG's latency (128–2034 ms in F-03), and up to the 5 s timeout.
  - change.md already records the related symptom: a timeout replaces the results with the outage message right after a successful add.
  - This follows from React's transition rules. It has not been measured.
- **Fix**: Measure "Usuń" with a search open in dev. If the delay shows, open a follow-up change for a short-TTL cache of `searchCatalog`, keyed by the query. Never cache at fetch level: Next stores `url` in the fetch-cache entry (patch-fetch.js:193), which would persist the key.
  - Strength: decides on evidence and keeps this slice's "No caching" boundary intact.
  - Tradeoff: one more manual check, and a later change if it matters.
  - Confidence: MED — the transition behaviour is well defined, but the observed delay may be small.
  - Blind spot: whether users perceive it at RAWG's usual latency.
- **Decision**: FIXED (measured, recorded in change.md) — on 2026-10-09, in dev with live RAWG, as the demo account with a throwaway phrase „metroid”. With a search open, adding took 971 ms and 864 ms and removing 1047 ms, from the click to the updated list. Removing with no search open took 539 ms. RAWG adds about 0.4–0.5 s at today's latency. No follow-up change: the delay is moderate, and change.md already records the 5 s timeout tail.

### F6 — A "duplicate" answer leaves a stale tab stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/watchlist/actions.ts:55-62
- **Detail**: `answer()` calls `refresh()` only on success.
  - In the stale second tab of 3.7, "Ta pozycja jest już na liście." shows, but "Obserwuj" stays enabled and the list does not show the entry, until a manual reload.
  - The message is what the plan specified, so this is a refinement rather than drift.
- **Fix**: Call `refresh()` on `duplicate` as well, and check that the row then reads "Na liście".
- **Decision**: SKIPPED. After a refresh the row swaps `EntryActionButton` for the disabled "Na liście" button, so the `role="alert"` line unmounts. The message would likely never show, a screen reader would announce nothing, and focus would drop. It would also change 3.7's specified behaviour. Keeping the message beside "Na liście" would need reworked components, which is out of proportion to a two-tab case.

### F7 — A client component pulls zod and the deals formatters into the browser bundle

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/watchlist/catalog-search-form.tsx:12-17, src/lib/watchlist/rules.ts:12-14
- **Detail**: `CatalogSearchForm` (`"use client"`) imports `rules.ts`, which builds zod schemas at module load and imports `@/lib/deals/format`.
  - That module's header says "Call these from Server Components only", so that locale-dependent text never differs on hydration.
  - It is harmless today, because `platformLabel` is a fixed map. But it breaks a stated rule, and every visitor to `/watchlist` downloads zod.
- **Fix**: Move what the form needs (`PINNABLE_PLATFORMS`, `pinLabel`, `MAX_QUERY_LENGTH`, `characterCount`) into a module without zod and without the deals formatters, and let `rules.ts` re-export it.
- **Decision**: FIXED. Before the fix, `/watchlist` loaded a client chunk with zod (417 KB raw, about 98 KB gzipped) that the deals page did not.
  - New `src/lib/watchlist/vocabulary.ts`, without zod, holds `PINNABLE_PLATFORMS`, `parsePlatform`, `pinLabel`, `MAX_QUERY_LENGTH` and `characterCount`. `rules.ts` imports them and re-exports four, and `catalog-search-form.tsx` imports from vocabulary.ts.
  - It still imports `platformLabel` from deals/format: a fixed map, which the header explains.
  - After the fix, no client chunk of `/watchlist` contains zod; only `/login` and `/signup` load it, as before. Lint, format and build pass. In dev, the select lists its eight labels and the live search works.

### F8 — infrastructure.md still calls previews writing to production "harmless"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/infrastructure.md:110
- **Detail**: The line says previews reading and writing the production project are "harmless while the one table holds no rows and no deployed code reads it".
  - Since this change, a signed-in user on a preview or under `next dev` writes real watchlist rows into production, which S-04 will act on.
  - Phase 4 edited the very next line (`:111`) and left this one.
  - Previews sit behind Vercel Authentication, so in practice only Tomasz reaches them.
- **Fix**: Reword the line to say previews and dev write real user data. Note that Vercel Authentication is what keeps others out, and that a separate Supabase project remains the fix.
- **Decision**: SKIPPED.

### F9 — Phase 2 manual items 2.7 and 2.8 have no written evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/watchlist-from-catalog/change.md (Phase 2 notes)
- **Detail**: Phases 1, 3 and 4 each have a dated "verified" note in change.md. Phase 2 has none.
  - 2.6 is evidenced by the two kitchen-sink screenshots.
  - 2.7 (Tab order, with visible focus) and 2.8 (Tomasz accepted the Polish copy) are `[x]` with nothing observable behind them.
  - Separately, `screenshots/watchlist-live-1280.png` shows the Next dev overlay's "1 Issue" badge, which nothing explains.
- **Fix**: If Tomasz confirms both ran, add a dated "Phase 2 verified" line to change.md. Otherwise re-run the Tab pass on the kitchen sink.
- **Decision**: FIXED. Tomasz confirmed on 2026-10-09 that 2.7 and 2.8 ran in Phase 2, and change.md now records it. The "1 Issue" badge in the live screenshot stays unexplained.

### F10 — Three small departures are not in change.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/watchlist/rules.ts:229-232, src/components/watchlist/*.tsx, context/foundation/infrastructure.md:111
- **Detail**: Under the lessons.md rule on recording departures:
  - `removeEntrySchema` has no `platform`, where the plan says the three schemas are "each with `platform` parsed as above". A removal by id needs none, so this is correct, but unrecorded.
  - The action buttons carry `aria-describedby` pointing at the game name or phrase, and the form has `role="search"`.
  - infrastructure.md:111 adds a sentence that rotating the key needs a redeploy.

  All three are harmless.
- **Fix**: Add one dated line to change.md naming the three.
- **Decision**: FIXED — change.md records the three under "2026-10-09 — departures not recorded at the time".

## Triage summary

- Fixed: F1, F2 (Fix A), F3, F4, F5 (measured and recorded), F7 (Fix A), F9, F10
- Skipped: F6, F8
