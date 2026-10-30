<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Game pages, public search on `/`, merged watchlist and RAWG images

- **Plan**: context/changes/game-search-and-pages/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 7 observations

Phase 2's code and automated criteria were reviewed. Its two manual rows, 2.4 and 2.5, are Tomasz's hosted steps and are still open. They are a precondition, not a finding: from Phase 3 on the code calls `public.deals_for_game`, so the migration must reach the hosted project before the first PR (whose preview reads hosted Supabase) or the merge.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria, rerun on 2026-10-30

- `npm test`: 30 files, 599 tests passed.
- `npm run lint` (`--max-warnings 0`): exit 0. `npm run format:check`: clean. `npx next typegen && npx tsc --noEmit`: exit 0.
- `npx playwright test` (on port 3100, against a fresh production build with `RAWG_API_KEY=""`; port 3000 held another server): 5 passed.
- Against `next start` with a blank key:
  - `curl -sI /games/abc`, `/games/0` and `/games/99999999999` each answered `404 Not Found`;
  - a fresh game id carried `<meta name="robots" content="noindex, nofollow">`, `/?q=zz` carried `noindex`, and `/` carried no robots tag;
  - a guest's `curl -sI /watchlist` answered `307` with `location: /login`.
- Greps:
  - no Next or cache import under `src/lib/catalog/`;
  - no fetch-level `next:` option under `src/lib/games/`;
  - no `/watchlist` address under `src/` outside `access.ts`;
  - no `images` key in `next.config.ts`;
  - no `<img>` under `src/`;
  - no `loading.tsx` under `src/app/(app)/games/[id]/`.
- Manual rows 1.7–1.8 and 3.6–6.9 are checked with specific, observable evidence in `change.md` (requests, sizes, URLs, account used). Nothing looks rubber-stamped. 2.4 and 2.5 are pending (see above).

## Checked and fine

- The plan's scope boundaries hold. There is no WAF rule, no RAWG mock in E2E, no sitemap or `robots.ts`, and no return-to parameter. Deal cards have no image, the matching rule and `isGameOnList` are unchanged, and there is no index on `deals`, no `cacheComponents`, `'use cache'` or fetch-level cache, and no `images` key.
- The plan's Critical Implementation Details hold:
  - failures are thrown inside the cache callback and never stored;
  - the thrown error text carries the reason and status only;
  - React `cache()` is outermost;
  - no `cookies()` call sits inside the callback;
  - `notFound()` runs before any Suspense boundary;
  - the overlay stays out of `<Form>`'s subtree;
  - `CATALOG_SHAPE_VERSION` was bumped in the Phase 6 commit.
- `deals_for_game` as `anon` works because `anon` holds table-level SELECT on `public.deals`, and it exposes no row or column that `/rest/v1/deals` does not. Each call costs one `game_match_key` (capped at 1,000 characters) and one scan of `deals`, the same cost class as a filtered `GET /rest/v1/deals`.
- The definer helper is safe: it pins `search_path = ''`, its body is fully qualified, and it uses revoke-then-grant. `private` is absent from `config.toml`'s `schemas` and `extra_search_path`.
- The migration's revert line is complete, the change is additive and backward-compatible, and the grants hold whichever side of 2026-10-30 it is pushed on.
- No injection path, open redirect or XSS. All three actions call `requireUser()`, `/my-deals` stays private, and `/watchlist` redirects through `redirectTo()`.
- The RAWG key reaches no cache key, error message, log line or client bundle.
- Every departure that changes behaviour is recorded in `change.md` and keeps the plan's intent, except the two in F3.

## Findings

### F1 — Closing the overlay leaves a pending search that reopens it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/search/search-overlay.tsx:166
- **Detail**: The search form submits 300 ms after the last keystroke. It clears that timer on a keystroke, on a submit and on unmount (`catalog-search-form.tsx:76-99`). `close()` only hides the overlay and calls `router.replace(closeHref)`. The form has no `key` (`(deals)/page.tsx:58-63`), so it stays mounted and its timer survives the close. Failure scenario:
  1. On `/?q=zelda`, the user types " b".
  2. Within 300 ms they press Esc, click outside the overlay, or press ×.
  3. The URL becomes `/` and the overlay hides.
  4. The timer then fires `requestSubmit()`, and the URL becomes `/?q=zelda+b` with the overlay open again.

  `search.spec.ts` presses „Szukaj” before Esc, which cancels the timer, so E2E never reaches this path. It undercuts manual criterion 4.6 ("Esc closes them").
- **Fix**: Make a close cancel the form's pending search. SearchOverlay hands the form a cancel hook, for example a small context that `CatalogSearchForm` registers `cancelPendingSearch` with, and `close()` calls it before `router.replace`.
- **Decision**: FIXED (2026-10-30)
  - **What changed**: `catalog-search-form.tsx` exports `PendingSearchContext`, which carries the pending search's timer. SearchOverlay provides it around the form, and `close()` clears it.
  - **Reproduction, against a production build with a blank key**: on `/?q=zelda`, typing " b" and pressing Esc, or clicking ×, at once ended at `/?q=zelda+b&platform=` with the overlay open.
  - **After the fix**: both cases end at `/` with the overlay closed. Typing „hades” on `/?page=2` still searches after the pause (`/?page=2&q=hades&platform=`).
  - **Gates**: lint, format, types and all five E2E specs pass.

### F2 — The trigger for the accepted RAWG-quota risk is unlikely to fire

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/infrastructure.md:138 (with src/lib/catalog/rawg.ts:49-54)
- **Detail**: The new risk row accepts that anonymous traffic can spend the 20,000-a-month quota. It acts "when the log shows `rate_limited`" or on a report of the catalogue message. There are two weak points:
  - only HTTP 429 becomes `rate_limited`. `rawg.ts:49-50` itself says RAWG documents nothing about quotas, so an exhausted quota answered with 401 or 403 is logged as `misconfigured`;
  - Hobby keeps runtime logs for one hour, and the register's own row at `:130` says not to rely on them.

  Failure scenario: a script walks `/games/1..N`, and RAWG answers the spent quota with 403. Every unseen game and search shows „Katalog gier jest chwilowo niedostępny” until the month turns. The only log line is `…failed: misconfigured, status 403`, which is gone within the hour and is not the line the row watches for.
- **Fix**: Reword the row's trigger so it can fire:
  - any catalogue failure line counts, `misconfigured` with a status included, since the key worked before;
  - name the 429 assumption and the one-hour retention;
  - name the realistic trigger: a user report, or `vercel logs --level error` checked after each deploy.
- **Decision**: SKIPPED (2026-10-30)

### F3 — Two departures from the plan are not recorded in change.md

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/(app)/(deals)/error.tsx; .claude/hooks/post-edit-tests.mjs:59
- **Detail**: Two departures are missing from `change.md`, which `lessons.md` requires ("Record every departure from the plan in change.md"):
  - Phase 4 #5's intent was that "the list's `loading.tsx` and `error.tsx` never touch" the search. The `loading.tsx` half was handled and recorded. The `error.tsx` half cannot hold as written, because `error.tsx` is segment-level: an unexpected throw in `DealsSection` or `SearchResultsSection` replaces the whole page, search included. Failed reads render inline, so only real bugs reach it, but the gap is not recorded.
  - Phase 4 added `src/lib/search/` to the hook's `SUITE_PATHS.unit`. The change is harmless and in line with Phase 1 #5, but also unrecorded.
- **Fix**: Append a dated note to `change.md` naming both.
- **Decision**: FIXED (2026-10-30): `change.md` gained the note "2026-10-30 — implementation review", which names both departures and also records F1's triage fix.

### F4 — Schema `private` has no "ships locked" rule for future functions

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261027085911_deals_for_game.sql:34; CLAUDE.md:61
- **Detail**: `anon` and `authenticated` now hold USAGE on `private`, and Postgres grants every new function to PUBLIC. `private.game_key` revokes and grants correctly. However, CLAUDE.md's rule ("Every new function in `public` ships locked") names only `public`, so the next definer helper added to `private` without the revoke pair would be executable by `anon`. Today it is reachable only through an invoker function or view in `public`, but directly the day someone exposes the schema.
- **Fix**: Extend CLAUDE.md's function rule to `private`. Optionally, have the next migration run `alter default privileges in schema private revoke execute on functions from public`.
- **Decision**: FIXED (2026-10-30): CLAUDE.md's rule now reads "Every new function in `public` or `private` ships locked too" and says why `private` needs it. No migration now.

### F5 — Stored catalogue answers are keyed on the callback's source text

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/games/cached-catalog.ts:173-174
- **Detail**: `unstable_cache` builds its stored key as `${cb.toString()}-${keyParts}` (`node_modules/next/dist/server/web/spec-extension/unstable-cache.js:58`). Any edit to the callback in `cachedAnswer`, or a minifier renaming inside it, silently changes every key. After such a deploy every game and query is a miss:
  - the quota is spent again;
  - the promise that "a game seen before renders while RAWG is down" does not hold until the cache warms again.

  It errs safe (never stale), but the plan's "stored answers outlive deployments" and the `CATALOG_SHAPE_VERSION` comment imply that only the version changes keys.
- **Fix**: Add one line to `CATALOG_SHAPE_VERSION`'s doc comment: the callback's source is also part of every key, so editing it starts the cache cold.
- **Decision**: FIXED (2026-10-30): `CATALOG_SHAPE_VERSION`'s doc comment in `cached-catalog.ts` gained a paragraph saying so.

### F6 — RAWG image URLs off RAWG's host pass through unchecked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/catalog/rawg.ts:73, 99-104
- **Detail**: `background_image` is any `z.string()`. `rawgImage` passes anything not on `https://media.rawg.io/media/` through unchanged as both URLs, and `next/image unoptimized` emits it unvalidated in production. No XSS is possible: the value only lands in `<img src>`. But a relative, protocol-relative or plain-`http` value from RAWG would make visitors' browsers request it. The app already scheme-checks `shop_url` (`links.ts`).
- **Fix**: In `rawgImage`, return null for anything that is not an absolute `https:` URL, and add one row to `rawg-image.test.ts`.
- **Decision**: FIXED (2026-10-30)
  - **What changed**: `rawgImage` returns null unless the URL is absolute `https:` (`isHttpsUrl`, through `URL.canParse`).
  - **Tests**: `rawg-image.test.ts` gains "gives no image for" rows: a path without a host, a scheme-relative URL, and plain `http` on RAWG's host. The last row moved there from "uses … as the original for both", as the decision chosen in triage. Unit: 504 passed.

### F7 — Opening a game from the search shows no feedback while the page waits for RAWG

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/games/game-link.tsx:13
- **Detail**: The game route has no `loading.tsx`, on purpose, to keep a real 404, and `GameLink` shows no pending state. The search answer is stored under `…/search/<q>`, and a game lookup under `…/game/<id>`, so a result just seen in the search is still a miss on its game page. A visitor who searches „elden ring” and clicks the first result therefore costs a second RAWG request. The click appears to do nothing for RAWG's latency, up to the 5 s timeout.
- **Fix**: Give `GameLink` a pending hint through `useLinkStatus` (a small client component). Accept the second request, which the 7-day game cache bounds.
- **Decision**: FIXED (2026-10-30)
  - **What changed**: `game-link.tsx` is a Client Component. Its `PendingName` dims the name to 60% after 100 ms and pulses it (`motion-safe`) while the link's navigation is pending, following `deals-pagination.tsx`'s `PendingArrow`. The second RAWG request is accepted.
  - **Verification**: checked on the dev server with the game page's request held back for 1.5 s. The name carried the pending classes throughout, in a search result on `/?q=hades` and in the kitchen sink's list and result rows, and the page then opened. A first probe clicked before the kitchen sink had hydrated and saw no hint. Lint, format and types pass.

### F8 — rule-change.test.ts's version window closes today

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/db/rule-change.test.ts:49-50
- **Detail**: The synthetic migration must be "dated after the last real migration and before 20261030000000". It is now `20261029000000`. Any migration made from 2026-10-30 on sorts after it, so the comment's invariant can no longer hold. `change.md` records this known limit, but `change.md` is archived with the change, and the next migration's author will meet the test, not that note.
- **Fix**: Move the known limit into the test's doc comment: how the next migration settles the version, for example deriving it from the last real migration and passing the default-privileges cut-off explicitly.
- **Decision**: FIXED (2026-10-30): `SYNTHETIC`'s doc comment says the window closes with the first real migration dated 2026-10-30 or later, and that this migration settles how the version is picked and whether it still needs the old default grants. The test's behaviour is unchanged.

### F9 — The search's components still live in components/watchlist/

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/watchlist/{catalog-search-form,search-results,search-result-row,rawg-attribution}.tsx
- **Detail**: These now serve the public search on `/` and the shared layout's footer, not the watchlist. The new parts sit in `src/components/search/` (the overlay) and `src/components/games/`. A reader looking for the search on `/` finds half of it under `watchlist/`. This is naming only, with no behaviour change.
- **Fix**: Move them to `src/components/search/` (and `rawg-attribution.tsx` to `src/components/games/` or a shared folder) in a follow-up.
- **Decision**: FIXED (2026-10-30), in this triage rather than a follow-up, by Tomasz's choice.
  - **What moved**: `catalog-search-form.tsx`, `search-results.tsx` and `search-result-row.tsx` to `src/components/search/`, and `rawg-attribution.tsx` to `src/components/games/` (`git mv`). Imports in six files changed, kept in path order.
  - **What stays**: `phrase-offer.tsx`, `sign-in-to-watch.tsx` and `entry-action-button.tsx`, the watch actions, stay in `watchlist/`. Historical documents keep the old paths.
  - **Gates**: lint, format, types, `npm test` (601) and all five E2E specs pass on a fresh build.

## Triage summary (2026-10-30)

| Outcome | Findings |
|---------|----------|
| Fixed | F1, F3, F4, F5, F6, F7, F8, F9 |
| Skipped | F2 |
