# Game pages, public search on `/`, merged watchlist and RAWG images — Implementation Plan

> Date: 2026-10-27. Branch: `game-search-and-pages`. Upstream: `frame.md` (authoritative on what to build), `research.md` (codebase baseline), the planning interview recorded in `change.md` (2026-10-26).

## Overview

Anyone, signed in or not, gets a page per catalogue game, `/games/<RAWG id>`, listing every listed deal that game matches, and a catalogue search above the deals list on `/` that leads there. Watching stays the one thing that needs an account. It is offered in the search results and on the game page. The watchlist moves into `/my-deals`, `/watchlist` becomes a redirect, and the search and the game page show RAWG's image of the game. A provider-neutral cache keeps public traffic from draining the shared RAWG quota of 20,000 requests a month.

Phases are ordered by Tomasz's priority. **Phases 1–3 are the minimal set that can be merged** if the 2026-11-04 deadline arrives first. Phase 4 can follow on its own, Phase 5 needs Phase 4, and Phase 6 can be dropped on its own.

## Current State Analysis

From `frame.md` (Hypothesis Investigation) and `research.md`, re-checked on the planning branch:

- **No public match path.**
  - `public.matched_deals` keys on `auth.uid()` (`supabase/migrations/20261013145356_hide_expired_deals.sql:31`).
  - `anon` may read `deals.match_keys` (`20260930061813_create_deals.sql:34-35`) but holds EXECUTE on none of the matching functions (`20261012070050_match_deals_to_watchlist.sql:196-211`). `supabase/checks/matching.sql:596-626` asserts exactly that matrix.
  - A signed-in RPC to `game_match_key` was hardened as an attack surface (S-04 review F1).
- **The catalogue has a search and no lookup.**
  - `GameCatalog` has `searchGames` only (`src/lib/catalog/types.ts:45-50`).
  - Its one caller is `searchCatalog` (`src/lib/watchlist/catalog.ts:36-51`), behind a user gate (`src/components/watchlist/search-results.tsx:61`).
  - Nothing caches, throttles or retries. The request URL carries the key, so a cache may only sit at function level, never at fetch level (`watchlist-from-catalog` review F5).
- **The search lives on private `/watchlist`.**
  - The URL drives it (`next/form` GET, `?q=`, `?platform=`), and it shares the page with the list.
  - On `/`, `?q=` and `?page=` would drop each other (`catalog-search-form.tsx:100-104`, `src/lib/deals/page.ts:40-42`).
- **The list and the redirect.**
  - `/my-deals` already reads the active entries through the same React-cached `getActiveEntries` (`my-deals-section.tsx:63`).
  - The access rule allows redirects to `/` and `/login` only (`src/lib/auth/access.ts:2-3,10`).
- **Images.** `imageUrl` is parsed (`rawg.ts:98`) and rendered nowhere. A plain `<img>` fails `npm run lint` (`@next/next/no-img-element` is `warn`, and the lint runs with `--max-warnings 0`).
- **Tests pin the old shape.**
  - `tests/e2e/main-flow.spec.ts` (deploy gate) pins `/watchlist` as the search host and as private. E2E runs with `RAWG_API_KEY: ""` (`playwright.config.ts:85`), so no catalogue result ever renders there.
  - `test-plan.md:605-607` excludes any RAWG mock from E2E until rollout Phase 3 ships. It has not.
  - No unit test covers `decideAccess`.

## Desired End State

- `/games/3498` (any RAWG id) is public and `noindex`. It shows the game's name, release year, platforms and image, the watch control, then the listed deals that an unpinned watchlist entry with that game's catalogue name would match. Order and paging are as on `/`.
- Game lookups:
  - An id RAWG does not know, or a malformed one (`/games/abc`), gives a 404.
  - A game seen before still renders from the cache when RAWG fails.
  - A game never seen while RAWG is down shows „Katalog gier jest chwilowo niedostępny. Spróbuj ponownie później.” with a link to `/`.
- `/` keeps the public, paged list of every deal. Above it, a search anyone can use opens its results in an overlay that does not move the list.
  - `/?page=2&q=elden&platform=ps5` keeps both states. Closing the overlay (Esc, a click outside, ×) drops `q` and `platform`. A `?q=` view is `noindex`.
  - Each result links to its game page and shows a 420 px RAWG thumbnail.
  - A signed-in user watches a game, or the typed text as a phrase, from the results. A guest sees „Zaloguj się, aby obserwować” linking to `/login`, and lands on `/` after signing in.
- `/my-deals` shows the matched deals and, below them, the watchlist with „Usuń”. Its game rows link to game pages. `/watchlist` redirects (307) to `/my-deals`, or to `/login` for a guest. The header has no „Obserwowane”.
- RAWG is reached only through one provider-neutral, server-only module:
  - search answers are cached for 24 h, game answers (found or not found) for 7 days, and failures are never stored;
  - every cache key carries the provider.
- Every app page carries the RAWG credit in a shared footer.

Verified by the per-phase criteria below. The decisive checks:
- a db test that the game page's function returns exactly what `matched_deals` returns for an unpinned entry;
- unit tests of the adapter, the cache wrapper and the pure rules;
- E2E for the guest paths and the redirect;
- manual checks against the local stack with a real RAWG key.

### Key Discoveries:

- **The `private` schema needs one harness line.** The PGlite harness refuses `create schema` because `migrator` has no CREATE on the database. A one-line `grant create on database` in `tests/db/stub/supabase-prelude.sql` (after `:39`) lets the whole `private` sequence run. A probe showed the definer helper running as its owner, as it would hosted.
- **The four-function matrix stays untouched.** It is a hard-coded `values` list (`supabase/checks/matching.sql:596-626`), so new functions trip nothing until rows are added.
- **The advisors stay quiet.** Supabase advisors 0028/0029 (definer executable by anon or authenticated) are WARN and look only at exposed schemas (`config.toml:13`). 0011 needs a pinned `search_path`. With `private` unexposed, `npm run db:check` stays clean.
- **pg_graphql exposes schemas by `search_path` plus grants** (Context7 `/websites/supabase_github_io_pg_graphql`). So `private` must never appear in `config.toml` `schemas` (`:13`) or `extra_search_path` (`:15`), nor in the hosted API settings.
- **`unstable_cache` behaviour** (`node_modules/next/dist/server/web/spec-extension/unstable-cache.js`):
  - a thrown error is never stored (`:224-233`);
  - a stale entry whose revalidation throws keeps being served, and the error plus the invocation key are logged (`:193-219`);
  - it has no in-flight dedup (`:224`);
  - it works in dynamic renders and persists in Vercel's Data Cache across deployments.
- **Only function-level caching is possible.** The `(app)` layout reads cookies (`src/app/(app)/layout.tsx:40-41`), so every page under it is dynamic; route-level ISR is impossible.
- **`next/image` without the optimiser.** `unoptimized` needs no `images.remotePatterns` (`node_modules/next/dist/shared/lib/get-img-props.js:96-124`).
- **RAWG serves resized files** at `media.rawg.io/media/resize/420/-/…` (39 KB against 222 KB for the original) and `/resize/640/-/…`. `/resize/500/` redirects to a 404. These paths are undocumented.
- **The deals read can take an RPC.** `readRows` accepts any thenable (`src/lib/deals/queries.ts:97`), but `loadListedDealsPage` is hard-wired to `client.from(relation)` (`:158-170`). postgrest-js sends `rpc()` as POST unless `{ get: true }`, and only GET is retried.
- **The watch building blocks already exist.** `EntryActionButton` posts hidden fields from `gameEntryFields(game, platform)` (`src/lib/watchlist/rules.ts:306-318`), and `isGameOnList` compares the platform exactly (`:179-190`). Both serve the game page's control as they are.
- **Sign-in always lands on `/`.** `src/components/auth/sign-in-form.tsx:58-61` has no return parameter.
- **Seed data for manual checks.** "Elden Ring" keys to deal D1 (ps5, listed), and "Hollow Knight: Silksong" to D2 (`supabase/seed.sql:93-114`).

## What We're NOT Doing

- No Vercel WAF rate-limit rule, and no Bot Protection. They are deferred, with a dated row and trigger in `infrastructure.md`'s Risk Register.
- No RAWG mock or fake catalogue in E2E (`test-plan.md:605-607`; its trigger, "rollout Phase 3 ships", is unmet). The game page's success path is proven below the browser and by hand.
- No sitemap, no `robots.ts`. The pages carry `noindex`, so indexing stays off.
- No return-to parameter after sign-in. A guest who wanted to watch lands on `/` and searches again.
- No image or game-page link on deal cards. Deals carry no RAWG id, and resolving them stays parked (`roadmap.md`, Parked).
- No new matching rule, no matching on `alternative_names` or `name_original`. A game page matches on the catalogue `name`, exactly like an unpinned entry.
- No platform filter on the game page. Its deals are the unpinned matches. The watch control's platform select is the pin to watch with, not a filter.
- No index on `deals`. S-04's thresholds for revisiting still apply (`deals-matched-to-watchlist/plan.md:736-738`).
- No switch of `cacheComponents`, no `'use cache'`, no fetch-level cache.
- No `images` key in `next.config.ts` and no Vercel image optimisation.
- No change to `isGameOnList`'s exact-platform duplicate rule.

## Implementation Approach

- **Order.** The data path comes first (catalogue lookup plus cache, then the database function), then the page that consumes both. After that come the relocation and merge, which are presentation over existing parts, then images.
- **Logic out of components.** Per `lessons.md`, every decision the UI depends on lives in a pure function with its own unit test: id parsing, the watch control's state, URL building, the cache keys and failure handling, the RAWG image mapping. Components and route files only fetch and display.
- **Matching stays in Postgres.** Following S-04's convention: an invoker function in `public` that `anon` may execute, a definer key helper in a schema PostgREST and pg_graphql never expose, and the listed predicate left to the RLS policy and the page query. The predicate stays in its three places.
- **One way into the catalogue, provider-neutral.** The cache wraps the `GameCatalog` contract, never `rawg.ts`. One constant names the provider and goes into every key, so switching to IGDB means a new adapter plus that one place.
- **Every phase is verified locally** (local stack, `npm test`, lint, format, typecheck, local E2E, manual checks). No phase deploys on its own: the branch merges into `main` only if it is done before 2026-11-04. The hosted steps are ordered in **Migration Notes**.

## Critical Implementation Details

- **Failures stay out of the cache, and the key out of the logs.**
  - Inside the `unstable_cache` callback, a catalogue failure must be *thrown* so it is never stored, then caught outside the cache and returned as `{ ok: false }`.
  - The thrown error carries only the reason and status. `unstable_cache` logs `err` and its invocation key when a background revalidation fails, so an error naming the RAWG URL would leak the key.
  - React `cache()` sits outermost, so the page and `generateMetadata` share one lookup (`unstable_cache` has no in-flight dedup).
  - Never read `cookies()` inside the callback.
- **A real 404 needs `notFound()` before streaming.** Call it in the page body before any Suspense boundary, and give `src/app/(app)/games/[id]/` no `loading.tsx`. Otherwise the 404 is soft: status 200 plus `noindex`. Verify with `curl -I`.
- **The overlay stays outside the form.** It must not render inside `<Form>`'s React subtree: synthetic submit events bubble through portals, and next/form's `onSubmit` would navigate on a watch button's submit (`node_modules/next/dist/client/app-dir/form.js:92-106`). Render it as the form's sibling.
- **Hosted ordering.** The migration reaches the hosted project before the first PR, whose preview reads hosted Supabase, or before the merge, whichever comes first. Code from Phase 3 on calls `deals_for_game` and fails without it.
- **Stored answers outlive deployments.** The Data Cache keeps entries across deploys, so an answer stored by one deployment is read by the next. Whenever `CatalogGame`'s shape changes (Phase 6), `CATALOG_SHAPE_VERSION` goes up in the same commit. This matters most if Phases 1–3 merge before Phase 6.
- **Cache in local dev.** The dev cache persists under `.next/cache`. A manual check of a failure state needs a query or game id not cached before, otherwise the cached success is served. That is the designed behaviour, not a bug.

---

## Phase 1: Catalogue lookup and provider-neutral cache

### Overview

Add a one-game lookup to the catalogue contract and implement it for RAWG. Put a server-only module in front of the contract that picks the provider, caches answers and never stores failures. The existing `/watchlist` search moves onto it unchanged in behaviour.

### Changes Required:

#### 1. Catalogue contract

**File**: `src/lib/catalog/types.ts`

**Intent**: Give the contract a lookup by id, in which "the provider has no such game" is an answer, not a failure, so it can be cached like one.

**Contract**:
- `GameCatalog.getGame(id: number, options?: LookupOptions): Promise<CatalogResult<CatalogGame | null>>`, where `null` means not found.
- `LookupOptions = { timeoutMs?: number }`.
- `CatalogFailureReason` is unchanged.

#### 2. RAWG adapter

**File**: `src/lib/catalog/rawg.ts`

**Intent**: Implement `getGame` against `GET https://api.rawg.io/api/games/{id}`. Factor the request, timeout, read and parse skeleton out of `searchGames`, so both methods keep the rule that every catch drops the error object.

**Contract**:
- A 404 maps to `{ ok: true, value: null }`; other non-2xx statuses go through `classifyRawgStatus`.
- New exported `parseRawgGameResponse(body: unknown): CatalogGame | null` reuses `rawgGameSchema` and the same mapping as search.
- The URL is built only inside the adapter, and the id comes in already validated.

#### 3. Cached catalogue, provider-neutral

**Files**: `src/lib/games/cached-catalog.ts` (new, no Next imports), `src/lib/games/catalog.ts` (new, `server-only`)

**Intent**:
- `cached-catalog.ts` holds the decisions: keys, lifetimes, query normalisation, and turning a failure into a throw inside the cache and back into a result outside it. They are testable under Node with an injected cache function.
- `catalog.ts` wires the real pieces: it reads `RAWG_API_KEY`, builds the provider's catalogue, and passes in `unstable_cache` and React `cache`. It is the app's only way into the catalogue.

**Contract**:
- `CATALOG_PROVIDER = "rawg"`, the one place a provider switch touches together with the constructor call.
- `searchCatalog(query: string): Promise<CatalogResult<CatalogGame[]>>`, up to 10 results as today.
- `getCatalogGame(id: number): Promise<CatalogResult<CatalogGame | null>>`.
- `CATALOG_SHAPE_VERSION`, a number bumped whenever `CatalogGame`'s shape changes, so an answer stored under an older shape is never read as the new one.
- Keys: `["catalog", CATALOG_PROVIDER, CATALOG_SHAPE_VERSION, "search", catalogQueryKey(query)]` and `["catalog", CATALOG_PROVIDER, CATALOG_SHAPE_VERSION, "game", String(id)]`.
- Lifetimes: `revalidate` 86 400 s for search and 604 800 s for a game.
- `catalogQueryKey` trims, collapses whitespace and lowercases. The normalised text is also what goes to the provider.
- Failures are thrown inside as an error whose message holds only the reason and status, and are never stored. A missing key is `misconfigured`, as today.
- The server log keeps one line per failure (reason and status only).
- The module's doc comment keeps today's warning about `logging.fetches` and the HMR cache.

#### 4. Retire the old wrapper

**Files**: `src/lib/watchlist/catalog.ts` (delete), `src/components/watchlist/search-results.tsx`, `next.config.ts`

**Intent**: The search reads through the new module. The config comment pointing at the old file follows it.

**Contract**: `search-results.tsx` imports `searchCatalog` from `@/lib/games/catalog`. No behaviour change on `/watchlist`.

#### 5. Edit-time test hook

**File**: `.claude/hooks/post-edit-tests.mjs` (and `tests/hooks/agent-hooks.test.ts` if it pins the list)

**Intent**: Edits under the catalogue and the new module run the unit project, as edits under `src/lib/watchlist/` do.

**Contract**: The `SUITE_PATHS.unit` list gains `src/lib/catalog/` and `src/lib/games/`.

#### 6. Unit tests

**Files**: `tests/unit/catalog/rawg-game.test.ts`, `tests/unit/games/cached-catalog.test.ts` (new)

**Intent**: Prove the lookup's outcomes with a stubbed fetch, and the cache wrapper's rules with an in-memory stand-in for `unstable_cache` that, like the real one, stores nothing when the callback throws.

**Contract**:
- Adapter cases:
  - 200 maps to a game;
  - 404 gives `null`;
  - 401/403 give `misconfigured`, 429 `rate_limited`, 500 `unavailable`;
  - an abort or timeout gives `unavailable`; a non-JSON or ill-shaped body gives `invalid_response`;
  - the requested path is `/api/games/<id>`, asserted on the stub's captured URL and never printed.
- Wrapper cases:
  - keys carry the provider, the shape version and the kind;
  - a success and a not-found are stored;
  - a failure is not stored, so the next call asks again;
  - the thrown error's message contains no URL and no key;
  - `catalogQueryKey` normalises case and whitespace.

### Success Criteria:

#### Automated Verification:

- Unit tests for the RAWG lookup and the cache wrapper pass: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint passes: `npm run lint`
- Formatting passes: `npm run format:check`
- Types check: `npx next typegen && npx tsc --noEmit`
- No caching or Next import under `src/lib/catalog/`, and no fetch-level `next:` cache option anywhere in `src/lib/games/` (grep)

#### Manual Verification:

- With a RAWG key in `.env.local` and `npm run dev`, a `/watchlist` search for „elden ring” still lists results and can add a game
- With `RAWG_API_KEY= npm run dev` and a query not searched before, `/watchlist` shows „Katalog gier jest chwilowo niedostępny” and still offers the phrase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Public match path

### Overview

One migration gives `anon` and `authenticated` a single function returning the listed deals that an unpinned game entry with a given name would match. The matching helpers' grants stay as they are. The truth tables gain the new surface and the invariant.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_deals_for_game.sql`, created with `npm run db:new -- deals_for_game`

**Intent**: Add the public read path the game page needs without granting `game_match_key` or `fold_for_matching` to `anon`, and without restating the listed predicate.

**Contract**:
- Header lines:
  - `-- Revert: drop function public.deals_for_game(text); drop function private.game_key(text); drop schema private;`
  - `-- Backward-compatible with the previous deployment: yes — additive; nothing deployed calls it.`
- `create schema private;`, `revoke all on schema private from public;`, `grant usage on schema private to anon, authenticated;`.
- `private.game_key(name text) returns text`:
  - `language sql immutable security definer set search_path = ''`;
  - body `select public.game_match_key(name)`;
  - execute revoked from `public, anon, authenticated, service_role`, granted to `anon, authenticated`.
- `public.deals_for_game(name text) returns setof public.deals`:
  - `language sql stable security invoker set search_path = ''`;
  - returns the rows of `public.deals` whose `match_keys` contain the key, when the key is not `''`;
  - the key is computed once, as an unpinned entry's game condition in `matched_deals`;
  - no listed predicate in the body: the select policy supplies it under RLS, and the page query states it;
  - execute revoked from `public, anon, authenticated, service_role`, granted to `anon, authenticated`.
- Comments on the schema and both functions say why `private` must stay out of `config.toml` `schemas` and `extra_search_path` and out of the hosted API settings.
- The file is dated before 2026-10-30, so the harness applies Supabase's default grants to it. The explicit revokes are therefore what makes the matrix hold, both here and hosted.

#### 2. Harness stub

**File**: `tests/db/stub/supabase-prelude.sql`

**Intent**: Let `migrator`, which stands in for hosted `postgres`, create a schema as hosted `postgres` can.

**Contract**: One statement after `:39`, granting CREATE on the current database to `migrator`, with a comment. The database name comes from `current_database()`, so it runs as dynamic SQL:

```sql
do $$ begin execute format('grant create on database %I to migrator', current_database()); end $$;
```

#### 3. Matching truth table

**File**: `supabase/checks/matching.sql`

**Intent**: Pin the new surface and the invariant the game page rests on.

**Contract**:
- Section 5 keeps the four-function matrix unchanged. A new check asserts that `anon` and `authenticated` execute `public.deals_for_game(text)` and `private.game_key(text)`, and `service_role` neither.
- A new section, as `anon`: `public.deals_for_game(<name>)` returns exactly the deal ids that `public.matched_deals` returns for a fixture user's unpinned game entry with that `game_name`.
- In the same section, an empty name and a name over 1,000 characters return no rows.

#### 4. Listed-expiry readers

**File**: `supabase/checks/listed-expiry.sql`

**Intent**: The function joins the readers that must see only the running, listed fixture deals, proving RLS applies through it.

**Contract**: The readers loop gains `anon` and `authenticated` reading `public.deals_for_game(<fixture name>)`. If the fixture titles do not share a key, they get one shared `english_title`, so a single name reaches all of them.

#### 5. Rules file

**File**: `CLAUDE.md` ("Deal matching")

**Intent**: Record the new reader and its constraints where agents look first.

**Contract**: One bullet:
- game pages read `public.deals_for_game(name)`, an invoker function that relies on the select policy for the listed predicate;
- its key comes from `private.game_key`, a definer function in schema `private`;
- `private` is never exposed through any API setting.

### Success Criteria:

#### Automated Verification:

- The db project passes, including both truth tables and the harness test: `npm test -- --project db`
- The whole suite passes: `npm test`
- The migration applies to the local stack: `npm run local:up`

#### Manual Verification:

- Before the first PR or the merge, whichever comes first, Tomasz runs `npm run db:push -- --dry-run` (only this migration listed), `npm run db:push` and `npm run db:check` (exit 0, no new finding)
- After the push, `supabase/checks/matching.sql` and `supabase/checks/listed-expiry.sql` rerun in the hosted SQL editor end in "Rolled back on purpose. All checks passed."

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The two hosted criteria may wait until just before the first PR or the merge. Phase 3 can start before them, because it runs against the local stack.

---

## Phase 3: Game page `/games/[id]`

### Overview

A public page per catalogue game: header, watch control, and the listed deals it matches, paged like `/`. It carries `noindex`, gives a real 404 for unknown ids and the one generic message when the catalogue cannot name an unseen game. The `/watchlist` results and list rows link to it, and the RAWG credit moves into a shared footer. After this phase the minimal set can be merged.

### Changes Required:

#### 1. Pure rules for the page

**Files**: `src/lib/games/rules.ts` (new), `src/lib/watchlist/rules.ts`

**Intent**: Decide, without I/O, whether a URL segment is worth a catalogue call, and what the watch control shows. The search rows reuse the second in Phase 4.

**Contract**:
- `parseGameId(raw: string): number | null` accepts digits only, no leading zero, from 1 up to the Postgres integer maximum. Share the constant with `addGameEntrySchema`.
- `gamePath(id: number)` returns `` `/games/${id}` ``.
- `watchState(input: { signedIn: boolean; entries; gameId; platform }): "guest" | "on_list" | "can_watch"`, built on `isGameOnList`.

#### 2. Deals read for one game

**Files**: `src/lib/deals/queries.ts`, `src/lib/deals/page.ts`

**Intent**: Read a page of the deals matching a game name through `deals_for_game`, with the listed-predicate chain, order, page size and look-ahead row that `/` uses. The predicate keeps its one statement in this file.

**Contract**:
- `loadListedDealsPage` takes a source instead of a relation name: the table or view for `/` and `/my-deals`, or `client.rpc("deals_for_game", { name }, { get: true })` for a game. Everything from `.select(LISTED_DEAL_COLUMNS)` on is shared.
- New export: `loadGameDealsPage(client, name, page, now): Promise<DealsPageResult>`.
- `DealListPath` widens to `"/" | "/my-deals" | `/games/${number}``.
- The retry note at `queries.ts:11-13` stays true because the call is a GET.

#### 3. Watchlist actions leave the route folder

**Files**: `src/app/(app)/watchlist/actions.ts` moves to `src/app/(app)/_watchlist/actions.ts` (a private folder); `src/app/(app)/watchlist/page.tsx` follows

**Intent**: The game page posts the same actions. They must outlive the `/watchlist` folder, which Phase 5 deletes.

**Contract**: The same three actions, unchanged. The doc comment says `refresh()` re-renders whichever page posted.

#### 4. Game page route

**File**: `src/app/(app)/games/[id]/page.tsx` (new; no `loading.tsx` in this segment)

**Intent**: Compose the page in the order that keeps a real 404 and the cache-first failure behaviour.

**Contract**:
- `PageProps<"/games/[id]">`. Order:
  - `parseGameId`; null → `notFound()`;
  - `getCatalogGame(id)`; a failure renders `GameUnavailable`; null → `notFound()`;
  - otherwise the page.
- `?page` goes through `parsePage`.
- `generateMetadata` uses the same React-cached lookup:
  - title: the game's name followed by „— okazje”, or a generic title on failure;
  - `robots: { index: false, follow: false }` on every outcome.

#### 5. Game page components

**Files**: `src/components/games/game-page.tsx`, `game-header.tsx`, `game-deals-section.tsx`, `game-unavailable.tsx`, `game-watch-control.tsx` (new)

**Intent**: Display only, reusing the deals components.

**Contract**:
- `GamePage`: a hook-free frame.
- `GameHeader`: name, year and platform names; the image slot stays empty until Phase 6.
- `GameDealsSection`: async, in `<Suspense key={page}>`. It renders `FreshnessNote`, `DealList`, and `DealsPagination` with `basePath` `/games/<id>`, plus its own empty state („Nie ma teraz okazji na tę grę”, linking to `/`) and the deals error with retry.
- `GameUnavailable`: the generic message and a link to `/`, with no deals.
- `GameWatchControl`, two parts:
  - a server part reads the user and, when signed in, `getActiveEntries()`;
  - a client part holds the platform select (`PINNABLE_PLATFORMS` plus „Dowolna platforma”) in client state, not in the URL. It shows „Obserwuj” through `EntryActionButton` with `gameEntryFields(game, selected)`, a disabled „Na liście” when `watchState` says so, or for a guest the link „Zaloguj się, aby obserwować” to `/login`.

#### 6. Shared RAWG credit

**Files**: `src/app/(app)/layout.tsx`, `src/app/(app)/watchlist/page.tsx`

**Intent**: Every app page showing RAWG data carries the credit. One footer covers `/`, `/games/…`, `/my-deals` and `/watchlist`.

**Contract**: The layout renders `RawgAttribution` in a footer after `children`. `/watchlist` drops its own copy.

#### 7. Links to the game page

**Files**: `src/components/watchlist/search-result-row.tsx`, `src/components/watchlist/watchlist-entry-row.tsx`

**Intent**: Result rows and game entries lead to their page.

**Contract**: The game name becomes a `Link` to `gamePath(id)`, using `game.id` in result rows and `entry.game_id` in list rows. Phrase rows stay plain text.

#### 8. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the page's states without Supabase or RAWG.

**Contract**: A „Strona gry” section with the header, the watch control (can watch, „Na liście”, failed add, guest), a deal list, the empty state and the unavailable state. All actions stay inert.

#### 9. Unit and E2E tests

**Files**: `tests/unit/games/rules.test.ts`, `tests/unit/watchlist/watch-state.test.ts`, `tests/e2e/game-page.spec.ts` (new)

**Intent**: Cover the pure decisions, and in the browser the paths that work with a blank RAWG key.

**Contract**:
- `parseGameId` accepts `"3498"`. It refuses `"0"`, `"007"`, `"1e3"`, `" 7"`, `"abc"` and a value above the integer maximum.
- `watchState` returns guest, on the list for the chosen platform only, and can-watch.
- E2E, as a guest:
  - `/games/3498` shows the generic catalogue message and a link to `/`;
  - `/games/abc` shows the not-found page;
  - the footer's RAWG link is present.
- Locators by role and text, no timeouts.

#### 10. Documents

**Files**: `context/foundation/infrastructure.md`, `context/foundation/roadmap.md`, `CLAUDE.md` ("Game catalogue")

**Intent**: Record the new exposure and where the catalogue lives now.

**Contract**:
- `infrastructure.md`: a dated status on the row "One signed-in account exhausts the shared RAWG quota…", whose premise no longer holds. Plus a new row: public visitors and crawlers can spend the quota with unique queries or ids. It is accepted for now, mitigated by the provider-neutral cache and `noindex`. Its trigger is `rate_limited` in the logs or a report of the catalogue message, and then one Vercel WAF rate-limit rule on `/games/` and requests carrying `q` (Hobby allows one; dashboard or `vercel firewall rules add`).
- `roadmap.md` S-05: a dated note that watching is also offered on the game page, by Tomasz's choice of 2026-10-26.
- `CLAUDE.md`: `src/lib/games/catalog.ts` is the app's only way into the catalogue, picks the provider and caches at function level with the provider in the key.

### Success Criteria:

#### Automated Verification:

- Unit tests for `parseGameId` and `watchState` pass: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- The new game-page E2E spec passes locally, along with the existing specs: `npx playwright test`
- Against `npm run build && npm run start`, `curl -sI http://localhost:3000/games/abc` answers 404, and the HTML of `/games/3498` carries `noindex`

#### Manual Verification:

- With a RAWG key and the local stack, the game page for Elden Ring (reached from a `/watchlist` result) shows its header and seed deal D1
- Signed in, choosing PS5 and „Obserwuj” on that page turns the button into „Na liście” for PS5 only, and `/my-deals` then lists D1
- As a guest, the game page shows „Zaloguj się, aby obserwować” and the deals
- The page reads well at 375 px and 1280 px, and its footer carries the RAWG credit

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Search on `/` with an overlay

### Overview

Anyone can search above the deals list on `/`. Results open in a Base UI Popover anchored to the input, over the list and not pushing it. Guests see a sign-in link instead of the watch buttons. The list's paging and the search share the URL. `/watchlist` keeps its own search until Phase 5.

### Changes Required:

#### 1. Popover primitive

**File**: `src/components/ui/popover.tsx` (new)

**Intent**: The repository's first overlay primitive, from the shadcn `base-nova` recipe the other UI components use.

**Contract**: Added with the shadcn CLI pinned in `package.json` (4.21.0), on `@base-ui/react` 1.8.0.

#### 2. URL state for the list and the search

**File**: `src/lib/deals/page.ts`

**Intent**: Paging keeps an open search, a search keeps the list's page, and closing drops only the search.

**Contract**:
- `pageHref(page, basePath, search?)` keeps `q` and `platform` when given.
- `searchClosedHref(page)` builds the URL without them.
- Page 1 omits `page`, and a null query omits `q` and `platform`. Example: `/?page=2&q=elden&platform=ps5`.

#### 3. Search form

**File**: `src/components/watchlist/catalog-search-form.tsx`

**Intent**: A search submitted from page 2 of the list stays on page 2.

**Contract**: An optional `page` prop, sent as a hidden field when it is greater than 1. Everything else is unchanged: the same debounce and the same `q` and `platform` fields.

#### 4. Overlay shell

**File**: `src/components/search/search-overlay.tsx` (new, client)

**Intent**: Present the server-rendered results over the list, close them the usual ways, and stay out of `<Form>`'s subtree.

**Contract**:
- A controlled Popover, open while a query is in the URL, anchored to the search input, non-modal, with `initialFocus={false}` so typing keeps focus.
- Bounded height with scrolling, and an × button.
- `onOpenChange(false)` (Esc, outside click, ×) calls `router.replace(searchClosedHref(page), { scroll: false })`.
- It renders as the form's sibling and takes the results as `children`.

#### 5. `/` route

**Files**: `src/app/(app)/(deals)/page.tsx`, `src/components/deals/deals-section.tsx`, `src/components/deals/deals-pagination.tsx`

**Intent**: Put the search above the list, outside the list's Suspense, so the list's `loading.tsx` and `error.tsx` never touch it. The list's pages carry the search state.

**Contract**:
- The page reads `page`, `q` and `platform` (`parsePage`, `parseSearchState`).
- It renders the form, plus the overlay with `<Suspense key={`${query}|${platform}`}>` around `SearchResultsSection`, above the existing `<Suspense key={page}>`.
- `generateMetadata` returns `robots: { index: false }` when `q` is present.
- `DealsSection` and `DealsPagination` pass the search state to `pageHref`.

#### 6. Results for guests

**Files**: `src/components/watchlist/search-results.tsx`, `search-result-row.tsx`, `phrase-offer.tsx`

**Intent**: A guest gets real results from the cached catalogue and a sign-in link where the watch buttons would be. A signed-in user keeps today's behaviour.

**Contract**:
- Without a user, the section calls `searchCatalog(query)` and skips `getActiveEntries`; read as `anon`, that call logs an error.
- Rows and the phrase offer take their state from `watchState`. The guest state is the link „Zaloguj się, aby obserwować” to `/login`.
- The doc comment drops "Without a user it renders nothing".

#### 7. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the overlay without data sources.

**Contract**: The overlay open over a sample list, with results for a signed-in user and a guest, no results, and catalogue unavailable.

#### 8. Tests

**Files**: `tests/unit/deals/page-href.test.ts`, `tests/e2e/search.spec.ts` (new)

**Intent**: Pin the URL rules, and in the browser the guest search with a blank key.

**Contract**:
- Unit: `pageHref` and `searchClosedHref` for page 1 and page 2, with and without a search.
- E2E, as a guest on `/`:
  - a search shows „Katalog gier jest chwilowo niedostępny” in the overlay;
  - the first deal's bounding box is unchanged;
  - the phrase offer's sign-in link leads to `/login`;
  - Esc closes the overlay and the URL loses `q`;
  - from `/?page=2`, the search keeps `page=2`.
- Main-flow's self-seed (`main-flow.spec.ts:97-99`) must still pick deal cards only; it reads `/` without `q`.

### Success Criteria:

#### Automated Verification:

- Unit tests for `pageHref` and `searchClosedHref` pass: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- The new search spec and every existing spec pass locally: `npx playwright test`

#### Manual Verification:

- At 1280 px and 375 px the overlay covers the list without moving it, and the list stays usable after closing
- Keyboard: typing keeps focus in the input, Tab reaches the results, Esc closes them
- Signed in, „Obserwuj” in the overlay adds the game, and the overlay stays open showing „Na liście”
- Paging with the overlay open keeps the results, and a search from page 3 stays on page 3

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Watchlist merged into `/my-deals`; `/watchlist` redirects

### Overview

The list moves under the matched deals on `/my-deals`, and `/watchlist` goes away behind a redirect in the proxy's access rule. Navigation, copy, the deploy-gating E2E and the documents follow.

### Changes Required:

#### 1. Access rule

**File**: `src/lib/auth/access.ts` (`src/proxy.ts` unchanged)

**Intent**: `/watchlist` sends a signed-in user to `/my-deals` and a guest to `/login`, through `redirectTo()`, so refreshed cookies and cache headers travel with it.

**Contract**:
- `AccessDecision.to` becomes `"/" | "/login" | "/my-deals"`, and `PRIVATE_PAGES` becomes `{"/my-deals"}`.
- Exact `/watchlist`, not a Server Action:
  - signed in → `/my-deals`;
  - signed out → `/login`, directly.
- Server Action POSTs pass, as for private pages. Status 307, `NextResponse.redirect`'s default.
- The doc comment lists the rule.

#### 2. Remove the `/watchlist` route

**Files**: `src/app/(app)/watchlist/` (`page.tsx`, `loading.tsx`, `error.tsx`), `src/components/watchlist/watchlist-page.tsx` (delete)

**Intent**: Nothing renders at `/watchlist`. The actions already live in `_watchlist/` (Phase 3).

**Contract**: No file under `src/` links to `/watchlist`, except the rule in `access.ts`.

#### 3. The list on `/my-deals`

**Files**: `src/app/(app)/my-deals/page.tsx`, `src/components/deals/my-deals-section.tsx`, `src/components/watchlist/watchlist-entries.tsx`

**Intent**: One private page holds the matched deals and the list that drives them.

**Contract**:
- Below the matched-deals Suspense, on every page of `/my-deals`, a section with the anchor `lista` renders `WatchlistSection removeAction={removeEntry}` in its own Suspense.
- „Zmień listę obserwowanych” points to `#lista`.
- The no-entries and empty states, and the list's empty copy, point at the search on `/` instead of `/watchlist` or „powyżej”.

#### 4. Navigation and kitchen sink

**Files**: `src/app/(app)/layout.tsx`, `src/app/kitchen-sink/page.tsx`

**Intent**: The header loses „Obserwowane”, and the kitchen sink shows the list as part of „Moje okazje”.

**Contract**: The signed-in header has „Moje okazje”, the e-mail and „Wyloguj się”. The kitchen-sink comments no longer call the list section the gate before `/watchlist`.

#### 5. Tests

**Files**: `tests/unit/auth/access.test.ts` (new), `tests/e2e/main-flow.spec.ts`

**Intent**:
- Give `decideAccess` its first unit test.
- Move the deploy-gating flow to the new homes in a reviewed diff, and record the move in `change.md` (`lessons.md`).

**Contract**:
- Unit, the full table:
  - an auth page while signed in redirects;
  - `/my-deals` as a guest redirects;
  - `/watchlist` signed in and signed out redirect;
  - an action POST passes;
  - `/watchlist/x` and `/WATCHLIST` pass.
- E2E main-flow:
  - a guest on `/watchlist` lands on `/login`;
  - signed in, the user searches on `/`, uses „Obserwuj frazę „title””, sees the entry with „Usuń” in `/my-deals`'s list and the deal among the matched ones, then removes it there;
  - signed in, `/watchlist` lands on `/my-deals`.

#### 6. Documents

**Files**: `CLAUDE.md` (Supabase bullet on private paths); `.env.example:30`; `playwright.config.ts:76` (comment); `context/foundation/test-plan.md` (`:88`, `:102`, `:103`, `:117`, `:196`, `:444-451`); `context/foundation/infrastructure.md:111`; `context/deployment/deploy-plan.md:82`; `context/deployment/alternative-git-integration.md:110`

**Intent**: Nothing describes `/watchlist` as a page any more.

**Contract**:
- `CLAUDE.md`: "Every path is public except `/my-deals`; `/watchlist` redirects there (or to `/login`)".
- Test-plan rows name `/` and `/my-deals` where they named `/watchlist`.

### Success Criteria:

#### Automated Verification:

- The `decideAccess` unit test passes: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- Every E2E spec passes locally, the reworked main flow included: `npx playwright test`
- `curl -sI http://localhost:3000/watchlist` answers 307 with `location: /login` for a guest
- No `/watchlist` link is left under `src/` outside `access.ts` (grep)

#### Manual Verification:

- Signed in, the header shows „Moje okazje” and no „Obserwowane”, and an old `/watchlist` bookmark opens `/my-deals`
- The list sits below the matched deals with working „Usuń”; its game rows open the game page
- With an empty list, the empty state points to the search on `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Images

### Overview

Result rows and the game page show RAWG's image, served by RAWG in a reduced size, through `next/image` without Vercel's optimiser. The knowledge of RAWG's resize paths stays in the adapter. The contract carries sizes, not provider URL rules.

### Changes Required:

#### 1. Contract

**File**: `src/lib/catalog/types.ts`

**Intent**: Callers ask for an image by use, never by provider-specific URL rules.

**Contract**: `imageUrl: string | null` becomes `image: { thumbnailUrl: string; pageUrl: string } | null`. Background art, not a box cover. `CATALOG_SHAPE_VERSION` in `src/lib/games/cached-catalog.ts` is bumped in the same commit, so cached answers of the old shape are never served after a deploy.

#### 2. RAWG image mapping

**File**: `src/lib/catalog/rawg.ts`

**Intent**: Point at RAWG's own smaller files where the source allows it, and fall back to the original otherwise.

**Contract**:
- New exported `rawgImage(backgroundImage: string | null)`. For `https://media.rawg.io/media/<path>` not already resized or cropped:
  - `thumbnailUrl` is `https://media.rawg.io/media/resize/420/-/<path>`;
  - `pageUrl` is `https://media.rawg.io/media/resize/640/-/<path>`.
- Any other URL gives both as the original, and null gives null.
- A comment records that the paths are undocumented and that 420 and 640 were verified while 500 is not served.

#### 3. Rendering

**Files**: `src/components/watchlist/search-result-row.tsx`, `src/components/games/game-header.tsx`

**Intent**: A fixed-size image beside each result, and a wide one on the game page, both decorative next to the visible name.

**Contract**:
- `next/image` with `unoptimized`, `alt=""` and `object-cover` in a fixed 16:9 box.
- A null image renders a same-size muted placeholder.
- The game page's image follows the Next 16 image docs for the page's largest image.
- No `images` key in `next.config.ts`.

#### 4. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Show the filled and empty image states without reaching RAWG.

**Contract**: Fakes keep `image: null` for the placeholder. One fake uses an inline SVG data URI for the filled state.

#### 5. Unit tests

**File**: `tests/unit/catalog/rawg-image.test.ts` (new)

**Intent**: Pin the mapping.

**Contract**: The cases:
- a `media/games/…` URL;
- a `media/screenshots/…` URL;
- an already-resized URL, unchanged;
- a non-RAWG host, as the original;
- null.

### Success Criteria:

#### Automated Verification:

- The RAWG image mapping unit test passes: `npm test -- --project unit`
- The whole suite passes: `npm test`
- Lint passes with no `<img>` element: `npm run lint`
- Formatting and types pass: `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- Every E2E spec passes locally: `npx playwright test`
- `next.config.ts` has no `images` key (grep)

#### Manual Verification:

- With a RAWG key, a search on `/` shows thumbnails, and the game page shows the larger image
- DevTools Network shows image requests to `media.rawg.io/media/resize/…` and none to `/_next/image`
- A game without an image shows the placeholder, and rows stay aligned at 375 px

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- **RAWG lookup:** stubbed fetch; outcomes per status, abort and body shape; a 404 as `null`.
- **Cache wrapper:** keys with provider and kind; success and not-found stored; failures not stored; the error text free of URL and key; query normalisation.
- **Pure rules:**
  - `parseGameId`: boundaries and refusals;
  - `watchState`: guest, on the list for the chosen platform only, can watch;
  - `pageHref` and `searchClosedHref`: both parameters, page 1 omitted;
  - `decideAccess`: the full table, the `/watchlist` rule included;
  - `rawgImage`: the mapping and its fallbacks.

### Integration Tests:

- **db (PGlite from `supabase/migrations/`):**
  - `matching.sql` asserts the new grants and the invariant: `deals_for_game(name)` equals `matched_deals` for an unpinned entry, and an empty or over-long name returns nothing;
  - `listed-expiry.sql` reads through the function as `anon` and `authenticated`;
  - the harness, rule-change and seed tests stay green.
- **E2E (`npx playwright test`, blank RAWG key):**
  - game page unavailable state and 404;
  - guest search on `/` with the overlay, its sign-in link, Esc and paging;
  - the reworked main flow across `/` and `/my-deals`;
  - the `/watchlist` redirect for a guest.

### Manual Testing Steps:

1. With a RAWG key and the local stack, search „elden ring” on `/`. The overlay shows thumbnails and the list does not move.
2. Open the Elden Ring result. The game page shows the image, header and seed deal D1, and the HTML carries `noindex`.
3. Signed in, watch Elden Ring for PS5 from the game page. The button reads „Na liście” for PS5 only, and `/my-deals` lists D1 with the entry below.
4. As a guest, the same page shows „Zaloguj się, aby obserwować”. The overlay's buttons are sign-in links.
5. Open `/watchlist` signed in (lands on `/my-deals`) and signed out (lands on `/login`).
6. With `RAWG_API_KEY=` and an id never opened before, the game page shows the generic message. The Elden Ring page, opened before, still renders from the cache.

## Performance Considerations

- `deals_for_game` scans `deals` with a stored-array comparison and no index, as `matched_deals` does. That is acceptable at about 1,500 listed rows, and S-04's revisit thresholds (about 200 ms or about 20,000 listed deals) still apply.
- PostgREST pages the function's result after it returns all rows. A function with `SET search_path` is not inlined, so `order` and `range` apply on top. For one game's matches this is a handful of rows.
- RAWG cost after this change:
  - at most one request per distinct normalised query per 24 h, and one per distinct game id per 7 days;
  - a failure is retried on the next request, since it is not stored;
  - the 20,000-a-month budget is about 667 a day.
- A search on `/` re-runs the deals list read (one Supabase query), with no skeleton because the list's Suspense keeps its key. `refresh()` after an add re-renders the whole route, with the catalogue answered from the cache.

## Migration Notes

**Order of the hosted steps.**
- No phase deploys on its own. CI deploys on push to `main`, and a pull request gets a preview deployment that reads the **hosted** Supabase project.
- Before the first PR or the merge, whichever comes first, Tomasz runs, in order:
  1. `npm run db:push -- --dry-run` — only `<timestamp>_deals_for_game.sql` listed;
  2. `npm run db:push`;
  3. `npm run db:check` — exit 0;
  4. `supabase/checks/matching.sql` and `supabase/checks/listed-expiry.sql` in the hosted SQL editor — both "All checks passed.";
  5. `npm run db:status` — no drift.
- The migration is additive and backward-compatible, so the deployment then live keeps working, and a `vercel rollback` after the merge needs no schema change.

**After the merge, on production:**
- `/games/<id>` for a watched game shows its deals, and `/games/abc` answers 404.
- `/` searches as a guest, and `/watchlist` redirects.
- The footer credits RAWG.
- `vercel logs --level error --since 1h` shows no `Reading deals_for_game failed` line and no unexpected catalogue failures.

**Merging early.** If the deadline forces it, merge with Phases 1–3 done. Phases 4–6 then continue on a new branch from `main`, under this same change folder.

## References

- Frame brief: `context/changes/game-search-and-pages/frame.md`
- Research: `context/changes/game-search-and-pages/research.md`
- Interview record: `context/changes/game-search-and-pages/change.md` (2026-10-26)
- Roadmap item: `context/foundation/roadmap.md` (S-05)
- Matching convention: `context/archive/2026-10-09-deals-matched-to-watchlist/plan.md:107,109,736-738`, `reviews/impl-review.md:51-85` (F1)
- RAWG cache rule: `context/archive/2026-10-07-watchlist-from-catalog/reviews/impl-review.md:102-117` (F5)
- Patterns:
  - `src/lib/deals/queries.ts:131-205` — listed read and paging;
  - `src/components/watchlist/entry-action-button.tsx:37-89` — action button;
  - `src/lib/auth/access.ts:27-44` — access rule;
  - `src/utils/supabase/session.ts` — `redirectTo`.
- Next 16 docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md`, `…/02-components/image.md`, `…/04-functions/generate-metadata.md`, `…/04-functions/not-found.md`, `…/02-guides/streaming.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Catalogue lookup and provider-neutral cache

#### Automated

- [x] 1.1 Unit tests for the RAWG lookup and the cache wrapper pass: `npm test -- --project unit` — 1e673a9
- [x] 1.2 The whole suite passes: `npm test` — 1e673a9
- [x] 1.3 Lint passes: `npm run lint` — 1e673a9
- [x] 1.4 Formatting passes: `npm run format:check` — 1e673a9
- [x] 1.5 Types check: `npx next typegen && npx tsc --noEmit` — 1e673a9
- [x] 1.6 No caching or Next import under `src/lib/catalog/`, and no fetch-level `next:` cache option anywhere in `src/lib/games/` (grep) — 1e673a9

#### Manual

- [x] 1.7 With a RAWG key in `.env.local` and `npm run dev`, a `/watchlist` search for „elden ring” still lists results and can add a game — 1e673a9
- [x] 1.8 With `RAWG_API_KEY= npm run dev` and a query not searched before, `/watchlist` shows „Katalog gier jest chwilowo niedostępny” and still offers the phrase — 1e673a9

### Phase 2: Public match path

#### Automated

- [x] 2.1 The db project passes, including both truth tables and the harness test: `npm test -- --project db` — a85713e
- [x] 2.2 The whole suite passes: `npm test` — a85713e
- [x] 2.3 The migration applies to the local stack: `npm run local:up` — a85713e

#### Manual

- [ ] 2.4 Before the first PR or the merge, whichever comes first, Tomasz runs `npm run db:push -- --dry-run` (only this migration listed), `npm run db:push` and `npm run db:check` (exit 0, no new finding)
- [ ] 2.5 After the push, `supabase/checks/matching.sql` and `supabase/checks/listed-expiry.sql` rerun in the hosted SQL editor end in "Rolled back on purpose. All checks passed."

### Phase 3: Game page `/games/[id]`

#### Automated

- [x] 3.1 Unit tests for `parseGameId` and `watchState` pass: `npm test -- --project unit` — aeab4ca
- [x] 3.2 The whole suite passes: `npm test` — aeab4ca
- [x] 3.3 Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit` — aeab4ca
- [x] 3.4 The new game-page E2E spec passes locally, along with the existing specs: `npx playwright test` — aeab4ca
- [x] 3.5 Against `npm run build && npm run start`, `curl -sI http://localhost:3000/games/abc` answers 404, and the HTML of `/games/3498` carries `noindex` — aeab4ca

#### Manual

- [x] 3.6 With a RAWG key and the local stack, the game page for Elden Ring (reached from a `/watchlist` result) shows its header and seed deal D1 — aeab4ca
- [x] 3.7 Signed in, choosing PS5 and „Obserwuj” on that page turns the button into „Na liście” for PS5 only, and `/my-deals` then lists D1 — aeab4ca
- [x] 3.8 As a guest, the game page shows „Zaloguj się, aby obserwować” and the deals — aeab4ca
- [x] 3.9 The page reads well at 375 px and 1280 px, and its footer carries the RAWG credit — aeab4ca

### Phase 4: Search on `/` with an overlay

#### Automated

- [x] 4.1 Unit tests for `pageHref` and `searchClosedHref` pass: `npm test -- --project unit`
- [x] 4.2 The whole suite passes: `npm test`
- [x] 4.3 Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- [x] 4.4 The new search spec and every existing spec pass locally: `npx playwright test`

#### Manual

- [x] 4.5 At 1280 px and 375 px the overlay covers the list without moving it, and the list stays usable after closing
- [x] 4.6 Keyboard: typing keeps focus in the input, Tab reaches the results, Esc closes them
- [x] 4.7 Signed in, „Obserwuj” in the overlay adds the game, and the overlay stays open showing „Na liście”
- [x] 4.8 Paging with the overlay open keeps the results, and a search from page 3 stays on page 3

### Phase 5: Watchlist merged into `/my-deals`; `/watchlist` redirects

#### Automated

- [ ] 5.1 The `decideAccess` unit test passes: `npm test -- --project unit`
- [ ] 5.2 The whole suite passes: `npm test`
- [ ] 5.3 Lint, formatting and types pass: `npm run lint`, `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- [ ] 5.4 Every E2E spec passes locally, the reworked main flow included: `npx playwright test`
- [ ] 5.5 `curl -sI http://localhost:3000/watchlist` answers 307 with `location: /login` for a guest
- [ ] 5.6 No `/watchlist` link is left under `src/` outside `access.ts` (grep)

#### Manual

- [ ] 5.7 Signed in, the header shows „Moje okazje” and no „Obserwowane”, and an old `/watchlist` bookmark opens `/my-deals`
- [ ] 5.8 The list sits below the matched deals with working „Usuń”; its game rows open the game page
- [ ] 5.9 With an empty list, the empty state points to the search on `/`

### Phase 6: Images

#### Automated

- [ ] 6.1 The RAWG image mapping unit test passes: `npm test -- --project unit`
- [ ] 6.2 The whole suite passes: `npm test`
- [ ] 6.3 Lint passes with no `<img>` element: `npm run lint`
- [ ] 6.4 Formatting and types pass: `npm run format:check`, `npx next typegen && npx tsc --noEmit`
- [ ] 6.5 Every E2E spec passes locally: `npx playwright test`
- [ ] 6.6 `next.config.ts` has no `images` key (grep)

#### Manual

- [ ] 6.7 With a RAWG key, a search on `/` shows thumbnails, and the game page shows the larger image
- [ ] 6.8 DevTools Network shows image requests to `media.rawg.io/media/resize/…` and none to `/_next/image`
- [ ] 6.9 A game without an image shows the placeholder, and rows stay aligned at 375 px
