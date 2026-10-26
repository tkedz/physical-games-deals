---
date: 2026-10-26T14:41:50+01:00
researcher: tkedz
git_commit: 408c2799e04c5a1e85197ab7e375b9e778fce527
branch: game-search-and-pages
repository: 10x-physical-games-deals
topic: "Public game pages with matched deals, a public catalogue search on `/`, the watchlist merged into `/my-deals`, and RAWG images: the anon match path, game identity and the RAWG lookup, RAWG quota protection, the search overlay, the merge's touch points, images, and the tests that pin today's shape"
tags: [research, codebase, game-page, catalog, rawg, matching, rls, grants, caching, next-image, watchlist, my-deals, base-ui, e2e]
status: complete
last_updated: 2026-10-26
last_updated_by: tkedz
---

# Research: Game pages, public search on `/`, the merged watchlist and RAWG images

**Date**: 2026-10-26T14:41:50+01:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 408c2799e04c5a1e85197ab7e375b9e778fce527 (this file is uncommitted)
**Branch**: game-search-and-pages
**Repository**: 10x-physical-games-deals

## Research Question

`frame.md` ("What Changes for /10x-plan") is authoritative on what to build. Tomasz's four answers are recorded there and are not reopened here: search and game pages are public, and an account is needed only to watch; the search sits above the list on `/`, with results in an absolutely positioned container; the watchlist merges into `/my-deals`; the game page goes first. The research answers:

1. How `anon` and `authenticated` can read the listed deals matching one game's name.
2. What game identity the URL carries, what RAWG's game-detail endpoint returns, and how `rawg.ts` would host it.
3. How to protect the shared RAWG quota from public traffic: Next 16 caching options, Vercel Hobby, and crawlers.
4. How today's search works, and what moving it above the list on `/` in an overlay involves.
5. Every touch point of merging `/watchlist` into `/my-deals`, and where a redirect can live.
6. Images: `next/image` vs `<img>`, Hobby limits, lint, attribution.
7. Which tests and test-plan rows pin today's shape.

## Summary

1. **No public match path exists, and every shape that adds one changes the grant story.**
   - For an unpinned game entry, today's rule reduces to two conditions: the listed predicate, and `game_match_key(name) <> '' and game_match_key(name) = any(d.match_keys)` (`20261013145356_hide_expired_deals.sql:36-42`).
   - `anon` can read `deals.match_keys` already, through a table-level `grant select` (`20260930061813_create_deals.sql:34-35`). It holds EXECUTE on none of the four matching functions (`20261012070050_match_deals_to_watchlist.sql:196-211`).
   - Any `security invoker` path that computes the key as `anon` needs `anon` EXECUTE on both `game_match_key` and `fold_for_matching`. That breaks the truth table at `supabase/checks/matching.sql:596-601`.
   - Of the shapes in §1, only the two built on `security definer` leave the helpers' grants alone.
     - (d1), a definer function in `public`, bypasses RLS. It would then need the listed predicate restated as the only guard, a fourth statement that `listed-expiry.sql` does not check.
     - (d2) puts a definer key helper in a non-exposed schema, which needs new schema DDL and grants.
   - `deals` has no index on `match_keys`, by decision (`deals-matched-to-watchlist/plan.md:107,736-738`).
2. **RAWG documents `/api/games/{id}` as taking "An ID or a slug", but the spec contradicts itself.**
   - It returns `GameSingle`, a superset of the fields `rawg.ts` already parses.
   - A 404 is documented without a body example, and `classifyRawgStatus` maps it to `unavailable` (`src/lib/catalog/rawg.ts:50-54`).
   - `watchlist_entries` stores `game_id`, `game_slug` and `game_name`, all non-null for a game row (`20261007141021_create_watchlist_entries.sql:11-13,19-26`), so a list row can link by either id or slug.
3. **Nothing caches RAWG calls today.**
   - `cacheComponents` is off (`next.config.ts:30-37`).
   - The ways to cache that keep the key out of the cache entry are function-level: `unstable_cache`, which works without the flag and persists in Vercel's Data Cache (Beta, all plans); `'use cache'`; and `'use cache: remote'`.
   - Plain `'use cache'` on serverless "typically" does not persist across requests (`use-cache.md:249-251`).
   - Vercel Hobby offers one WAF rate-limit rule per project, plus Bot Protection and Attack Challenge Mode at no cost. Bot Protection lets verified crawlers such as Googlebot through.
   - No fetched Vercel page states how much Runtime Cache or Data Cache Hobby includes.
4. **The search is URL-driven (`next/form` GET with `?q=`), gated on a user before RAWG, and coupled to the list on the same page.**
   - On `/`, a search drops `?page=` and paging drops `?q=` (`catalog-search-form.tsx:100-104`; `page.ts:40-42`).
   - An add or remove calls `refresh()` (`actions.ts:55-62`). On `/` that would re-render the whole route, the deals read and the RAWG search included (inference from `server-actions.md:36-47`).
   - Base UI 1.8.0 is installed. It has Popover, Autocomplete and Combobox. Of the three, only a Popover's dialog content can hold a select and several buttons per row without breaking ARIA option semantics (inference).
5. **The merge touches at least the files listed below (§5), across access, nav, copy, routes, kitchen-sink, tests and docs.**
   - A redirect can sit in three places that behave differently: `next.config` `redirects()` (runs before the proxy), `proxy.ts`/`decideAccess` (whose type allows only `/` and `/login`), or a `redirect()` in a `/watchlist` page.
6. **A plain `<img>` with attributes fails `npm run lint` unless the line is disabled, because `@next/next/no-img-element` is `warn` and the lint runs with `--max-warnings 0`.**
   - `next/image` needs `images.remotePatterns` for `media.rawg.io`.
   - Optimised, it spends Hobby's 5,000 image transformations a month. Past that, new images return 402.
   - `unoptimized` serves the source as-is.
7. **The tests and test-plan rows that pin `/watchlist` as the search host, `/watchlist` as private, or the `anon` grant matrix are listed in §7.**
   - One E2E test, `main-flow.spec.ts`, pins the first two. It gates deploy.
   - One db truth table, `matching.sql`, pins the third.
   - No unit test covers `decideAccess`.

## Detailed Findings

### 1. Public match path for a game page

**The functions and their grants today**
- `fold_for_matching(text)`:
  - It is `language sql immutable parallel safe set search_path = ''` and runs as security invoker. No `security definer` appears anywhere in `supabase/migrations/`.
  - Its current body is `20261013115104_fold_nfc_first.sql:30-52`. It has no input-length cap: the only `char_length` check in the matching migrations is in `game_match_key`.
- `game_match_key(text)`:
  - It has the same attributes. Its current body is at `20261012130317_bound_game_match_key.sql:30-60`.
  - A name over 1,000 characters keys to `''` (`:38`). It calls `fold_for_matching` (`:43`).
- Grants (`20261012070050:196-211`):
  - All four matching functions are revoked from `public, anon, authenticated, service_role`.
  - `authenticated` gets the fold and the game key back, "the view keys the caller's entries" (`:190-194`).
  - `service_role` gets all four.
  - The comment's last line is "anon, nothing".
- The `matching.sql` truth table asserts exactly that matrix (`supabase/checks/matching.sql:596-626`). It also asserts that `anon` gets 42501 on `matched_deals` (`:580-594`). `tests/db/matching.test.ts` runs that file.

**What a game entry matches**
- `matched_deals` is a `security_invoker` view (`20261013145356_hide_expired_deals.sql:25-43`).
  - It keys the caller's entries with `e.user_id = (select auth.uid())` (`:31`).
  - The listed predicate is at `:36-37`.
  - The match condition is at `:40-42`: `(e.platform is null or e.platform = d.platform) and (e.game_key <> '' and e.game_key = any (d.match_keys) or e.phrase_key <> '' and strpos(d.match_text, e.phrase_key) > 0)`.
- With no pin, every platform matches, null and `other` included (`matching.sql:470-471`).
- `deals.match_keys` holds the distinct non-empty keys of the title, the English title and the alternative titles (`20261012070050:103,129-133`). `''` never appears in it.

**Who can read `deals`**
- The grant is `grant select on table public.deals to anon, authenticated`, table-level (`20260930061813_create_deals.sql:34-35`). It covers `match_keys` and `match_text`, as the comment at `20261012070050:124-128` says.
- The policy "listed deals are public" applies `for select to anon, authenticated` (`create_deals.sql:48-50`), and its USING clause is the listed predicate (`hide_expired_deals.sql:14-16`).
- `matched_deals` is granted to `authenticated` only (`20261012070050:226-227`). It cannot serve `anon`, because it is keyed on `auth.uid()` and `anon` holds no grant on `watchlist_entries` (`20261007141021:51-55`).

**Indexes and size**
- No migration creates an index on `deals.match_keys` or `match_text`.
  - Every `create … index` in `supabase/migrations/` is on `watchlist_entries` (`20261007141021:33,37,42`; `20261012070050:159`).
  - `deals` has its primary key and `unique (link, item_index)` (`create_deals.sql:6,25`).
- This was a decision: "No index on `deals`" (`deals-matched-to-watchlist/plan.md:107`). The plan says to revisit past about 200 ms or about 20,000 listed deals, with a GIN index on `match_keys` and `pg_trgm` on `match_text` (`plan.md:736-738`).
- Listed-deal counts the repo records, from crawls of `/`:
  - 1,162 on 2026-10-06 (`context/archive/2026-10-06-physical-deals-from-real-posts/reviews/impl-review.md:37`);
  - 1,524 on 51 pages on 2026-10-12 (`context/archive/2026-10-09-deals-matched-to-watchlist/acceptance.md:3,28`).
  - The total row count of `deals`, not-listed rows included, is recorded nowhere.
- A general Postgres fact, not checked against docs in this research: a GIN index on an array serves `@>`, not `= any(...)`.

**Why the RPC shortcut was ruled out (F1)**
- F1 measured `game_match_key` as quadratic (`deals-matched-to-watchlist/reviews/impl-review.md:51-85`):
  - 2.4 s at 40k characters;
  - 593 ms at 20k characters as `authenticated`.
- It was reachable by RPC, because `authenticated` held EXECUTE in the exposed `public` schema (`:63`), and through a stored `game_name` (`:64`).
- The hardening capped the input at 1,000 characters (`20261012130317`). F3 then produced the "every function ships locked" rule.
- The review also says `statement_timeout` may not interrupt the regex once the DFA cache is warm (`:66`). That is source-level reasoning, untested on the hosted project.
- **Inference:** granting either helper to `anon` gives visitors the RPC surface F1 judged a risk for `authenticated`, minus the stored-name path. `game_match_key` is now capped; `fold_for_matching` is not, and its cost on long input is unmeasured in the repo.

**Candidate shapes.** The facts that distinguish them follow; none is picked here.

| Shape | Grants and truth table | Listed predicate | Calls per page | What `anon` can newly reach |
| --- | --- | --- | --- | --- |
| (a) New `security invoker` SQL function in `public`, e.g. `deals_for_game(name text) returns setof public.deals`, granted to `anon, authenticated` | `anon` also needs EXECUTE on `game_match_key` and `fold_for_matching`, because nested calls are checked against the caller. `matching.sql:598` (`anon` → none) fails until it changes, and the new function needs its own row. `listed-expiry.sql` lists only `deals` and `matched_deals` as readers (`:131-137`) and would need a row | RLS on `deals` applies to an invoker function. The body need not restate the predicate if the page chains the filters from `queries.ts:161-166` onto `.rpc()`; if the body states it, that is a fourth place | 1 | the new function, plus both helpers directly over `/rpc` |
| (b) Grant `game_match_key` (and `fold_for_matching`) to `anon`; compute the key by RPC, then `.contains('match_keys', [key])` on `deals` | The same grant changes as (a). The key function becomes an intended public API, the shortcut F1 hardened against | Unchanged: the existing `loadListedDealsPage` read with one more filter | 2 | both helpers over `/rpc` |
| (c) A view | Postgres views take no parameters. Narrowing a view still needs the key computed somewhere, which reduces it to (b) | — | — | — |
| (d1) `security definer` function in `public` | No helper grant, so `matching.sql:596-626` passes unchanged. The four-function truth table (`:606-611`) does not cover the new function. Supabase guides (Context7 `/websites/supabase_guides`) advise against definer functions in an exposed schema | Bypasses RLS, so the body's restated predicate is the only guard: a fourth statement, unchecked by `listed-expiry.sql` | 1 | the function only |
| (d2) Invoker wrapper in `public`, with a definer key helper in a non-exposed schema | Needs new schema DDL plus USAGE and EXECUTE for `anon` on that schema. `config.toml:13` exposes `public, graphql_public` only, so the helper is not on `/rpc`. Inference: the PGlite stub gives `migrator` CREATE on `public` only (`tests/db/stub/supabase-prelude.sql:37-39`), so `create schema` would likely fail in the harness until the stub changes | RLS applies through the wrapper | 1 | the wrapper only |

Ruled out by existing rules, not by this research:
- a TypeScript copy of the key (`deals-matched-to-watchlist/plan.md:109`);
- reading with `SUPABASE_SECRET_KEY` on Vercel, since CLAUDE.md "Database migrations" says it "reaches neither Vercel nor the browser";
- joining by RAWG id, since deals carry none (`frame.md:59`).

**Details that bind any shape**
- **The empty-key hazard in (b).** postgrest-js serialises an array as `` `cs.{${value.join(',')}}` `` (`node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts:1012-1025`). So `contains('match_keys', [''])` becomes `cs.{}`. `match_keys @> '{}'` holds for every row, so an empty key would list every deal unless the caller guards `key !== ''`.
  - Keys contain only `[a-z0-9]` and single spaces, so the unquoted `cs.{…}` cannot be broken by a key.
- **PostgREST behaviour** (Context7 `/websites/postgrest_en_v14`; `/supabase/supabase-js`):
  - Every function in an exposed schema that the role may execute is callable at `/rpc`.
  - Table-returning functions take the same filters, order and range as tables.
  - `rpc()` returns a filter builder, so `.order()` and `.range()` chain.
- **Row cap.** `max_rows = 1000` caps rows from tables, views and functions (`supabase/config.toml:18`).
- **Inlining (inference).** Postgres does not inline SQL functions that carry a `SET` clause. Under the repo's `set search_path = ''` convention, PostgREST's order and range would run after the function returns all its rows.
- **Today's reads.**
  - `loadListedDealsPage` (`src/lib/deals/queries.ts:149-179`) applies the predicate as `.eq kind/edition`, `.not price is null` and `.or(expires_at.is.null,expires_at.gt.<now>)` (`:161-166`). It orders by `published_at desc, id desc` and reads one extra row for `hasOlder` (`:167-178`).
  - Its relation type is `"deals" | "matched_deals"` (`:131`), and `DealListPath` is `"/" | "/my-deals"` (`src/lib/deals/page.ts:14`). A game page would extend both or add its own path.
  - `src/` and `scripts/` contain no `.rpc(` call, and `src/` has no generated `Database` types, so a `.rpc()` call would be untyped (grep).
- **Harness.** Migrations dated `20261030000000` or later run without Supabase's default grants (`tests/db/harness/database.ts:34,198-216`). Postgres still grants `PUBLIC` EXECUTE on a new function (`tests/db/stub/default-privileges.sql:12-13`), so the revoke stays mandatory either way.

### 2. Game identity in the URL and the catalogue lookup

**The contract today**
- `CatalogGame` is `{id:number, slug, name, released: string|null, platforms: CatalogPlatform[], imageUrl: string|null}` (`src/lib/catalog/types.ts:16-25`). `imageUrl` is "Background art, not a box cover" (`:23`).
- The failure reasons are `misconfigured | rate_limited | unavailable | invalid_response` (`:27-28`). There is no `not_found`.
- A failure carries no URL, header or body (`:30-37`). `GameCatalog` has `searchGames` only (`:45-50`).

**The adapter**
- `rawg.ts` calls `GET https://api.rawg.io/api/games` (`:25`) with `URLSearchParams{key, search, page_size}` (`:116-120`). `page_size` defaults to 10 (`:26`), and `exclude_additions` is sent only on request (`:121`).
- The timeout is `AbortSignal.timeout`, 5,000 ms by default (`:27,123-125`).
- `classifyRawgStatus` (`:50-54`):
  - 401 and 403 → `misconfigured`;
  - 429 → `rate_limited`;
  - every other status → `unavailable`, so a 404 is `unavailable`.
- `rawgGameSchema` (`:66-73`) parses `{id, slug, name, released?, background_image?, platforms[].platform{id,slug,name}?}`. `parseRawgSearchResponse` reads `{results:[…]}` (`:75-100`).
- The key is passed in and the URL is built inline in `fetch(...)` (`:131`). Every catch drops the error object (`:127-137,151-166`).
- No unit test imports `rawg.ts` (inspected `tests/unit/`).

**The wrapper**
- `searchCatalog(query)` is in `src/lib/watchlist/catalog.ts:36-51`, which is `server-only` (`:21`). It returns `misconfigured` for a missing key (`:39-44`) and asks for up to 10 results (`:27`). `logged()` writes only the reason and status (`:54-63`).
- Its only caller is `search-results.tsx:63-66`, after the user check at `:61`.

**The RAWG detail endpoint** (fetched 2026-10-26: `https://api.rawg.io/docs/?format=openapi`, the Swagger 2.0 spec with basePath `/api`; `https://rawg.io/apidocs`; `https://rawg.io/tos_api`; `rawg.readme.io/reference/errors.md`; `rawg.readme.io/reference/authentication`)
- `/games/{id}`, "Get details of the game." The operation-level `id` parameter reads "An ID or a slug identifying this Game." The path-level `id` is an integer, "A unique integer value identifying this Game." The spec contradicts itself.
- The only documented response is 200 `GameSingle`. Its fields include `id, slug, name, name_original, description, released, tba, background_image, background_image_additional, alternative_names[], platforms[]{platform{id,slug,name}, released_at, requirements}` and others.
- `errors.md` lists 404 as "the requested resource is not found" and says errors are returned as JSON. No source shows a 404 body; `{"detail":"Not found."}` is unconfirmed.
- One community anecdote, a 2023 forum post, reports a slug lookup returning a wrong-language record that the numeric id fixed. It is not official.
- **Inference — where a second call sits:**
  - a `getGame(idOrSlug)` method on `GameCatalog`, implemented in `createRawgCatalog` at `/api/games/{id}`;
  - it would reuse `rawgGameSchema`, because the detail body is the game object, not `{results}`;
  - it would duplicate or factor out the inline fetch/timeout/catch skeleton of `searchGames` (`:123-175`);
  - it would add a not-found reason, or accept 404 as `unavailable`.
  - `logged()` and its "Searching…" wording are search-specific (`catalog.ts:59`), and the wrapper lives under `src/lib/watchlist/`.

**What a list or result row can link with**
- `watchlist_entries` has these columns:
  - `game_id integer check (game_id > 0)`, documented as "The RAWG id" (`:11,90-91`);
  - `game_slug text` (`:12`);
  - `game_name text` (`:13`), "at the time of adding, not refreshed" (`:93-94`);
  - `game_released date` (`:14`).
- The shape check makes id, slug and name non-null for a game row and all null for a phrase row (`:19-26`).
- `GameEntry` exposes `game_id`, `game_slug` and `game_name` (`src/lib/watchlist/types.ts:29-40`).
- `search-result-row.tsx:19-69` receives the full `CatalogGame` but renders only the name, year and platforms.
- No row under `src/components/watchlist/` has an `href` today, except the attribution link.

**Identity options** (facts only)
- **Id in the URL** (`/games/<id>`): the page needs a detail call to learn the name it matches on. RAWG documents ids, both rows already hold one, and it is the cache key.
- **Slug in the URL:**
  - It is readable, and RAWG's operation parameter accepts it.
  - The spec contradicts itself on this, and one anecdote reports a wrong record.
  - A slug may not be unique over time (inference).
- **Name in the URL with no detail call** (inference):
  - It spends no RAWG request.
  - But the page heading and the matched name would be whatever the URL says, a public page with attacker-chosen text.
  - It could not show the image without a lookup.
- **What happens under RAWG failure** depends on this choice. If the name comes only from RAWG, a failed or exhausted catalogue leaves the page with no name to match on.

**Quota and terms**
- **Quota:**
  - 20,000 requests a month on the free tier, with no per-second limit published (`context/archive/2026-09-26-game-catalog-provider-proven/plan.md:15`; apidocs; ToS 8.2.1).
  - `rawg.readme.io/reference/authentication` says "a total of 50,000 requests". That source does not call itself official.
  - The ToS lets RAWG change limits unilaterally (8.5).
- **Commercial use:** apidocs labels the free tier "Non-commercial projects only". The spec and ToS 8.2.1 allow commercial use up to 100,000 MAU or 500,000 page views a month.
- **Attribution:** "attribute RAWG as the source of the data and/or images and add an active hyperlink from every page where the data of RAWG is used" (spec, ToS 8.2.1, apidocs; `game-catalog-provider-proven/plan.md:18`).
- **Caching and storage:** no fetched source has an explicit caching clause. Apidocs says "No data redistribution."
- **Latency and timeouts:** latency was 128–2,034 ms (`game-catalog-provider-proven/coverage.md:113`), and RAWG timed out at 5 s on 3 of about 15 searches (`watchlist-from-catalog/change.md:52`).

### 3. Protecting the RAWG quota from public traffic

**What exists**
- `next.config.ts:30-37` sets only `experimental.serverComponentsHmrCache: false`, because that dev cache logs the fetch URL, key included (`:32-34`; `catalog.ts:13-19`).
- There is no `cacheComponents`, `images`, `redirects()` or `headers()`, and no `robots`/`sitemap` file or metadata `robots`. `vercel.json` is `{"regions":["fra1"]}`.
- There is no `use cache`, `unstable_cache`, `cacheLife` or `revalidate` in `src/`.
- The accepted risk row assumes one signed-in account and "`/watchlist` neither throttles searches nor caps rows" (`context/foundation/infrastructure.md:137`).

**Demand today** (all on `/watchlist` and inferred from code, unmeasured)
- One RAWG request per search render: a debounced pause after 3 or more characters, Enter, or a platform change (`catalog-search-form.tsx:21,24,85-97`).
- The platform never reaches RAWG, so changing it repeats an identical request (`catalog.ts:36-51`).
- Every add or remove repeats the search through `refresh()` (§4).
- **Inference:** a game page that calls RAWG in both `generateMetadata` and the page makes two requests, unless they are deduplicated with React `cache()`. Fetch memoisation does not apply, because `rawg.ts` passes a `signal` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md:88-95`).
- For scale (arithmetic only): 20,000 a month is about 667 a day in a 30-day month.

**Next 16 options** (bundled docs; `D/` = `node_modules/next/dist/docs/01-app/`)

| Option | Enabling | Key | Persistence on Vercel | Notes |
| --- | --- | --- | --- | --- |
| `unstable_cache(fn, keyParts, {revalidate, tags})` | Works without `cacheComponents` (`D/02-guides/caching-without-cache-components.md:27-76`) | Arguments + stringified function + keyParts (`D/03-api-reference/04-functions/unstable_cache.md:39`) | "persist[s] the result across requests and deployments" (`:30`); Vercel Data Cache, "Beta on all plans", shared by the projects of a Hobby team | "Replaced by `use cache` in Next.js 16" (`:6-8`); not called removed. Inference: wrapping `searchCatalog(query)`, which reads the key from env inside, keeps the key out of both the cache key and the stored value |
| `'use cache'` + `cacheLife`/`cacheTag` | Requires `cacheComponents: true` (`D/03-api-reference/01-directives/use-cache.md:27-37`) | Build ID + function ID + serialized arguments and closures (`:79-88`) | Default in-memory LRU; on serverless "Cache entries typically don't persist across requests" (`:249-251`); not across deploys (`:258-261`) | No `cookies()`/`headers()`/`searchParams` anywhere down the call stack (`:241`). A conditional `cacheLife` can give a missing item a shorter life (`cacheLife.md:539-569`) |
| `'use cache: remote'` | Same flag (`use-cache-remote.md:25-50`) | As above | Vercel Runtime Cache: "available on all plans", regional, LRU, shared across a Hobby team's projects, usage charged | Names rate-limited APIs as the use case (`:69`). Warns that near-unique keys such as search filters get near-zero hit rates (`:56`) |
| React `cache()` | — | Per request | One request only (`D/01-getting-started/06-fetching-data.md:604`) | Dedupes a page and its `generateMetadata` |
| Fetch-level `next.revalidate` / `force-cache` | — | Includes the URL (`node_modules/next/dist/server/lib/incremental-cache/index.js:288-305`) | Data Cache | Ruled out by F5. The stored entry keeps `url` in plain text (`server/lib/patch-fetch.js:187-193`, the line F5 cited as `:193`) |

- **What enabling `cacheComponents` changes app-wide** (`D/02-guides/migrating-to-cache-components.md`):
  - segment configs `dynamic`/`revalidate`/`fetchCache` error (`:76`); the repo has none;
  - `cookies()`/`headers()`/`searchParams` outside `<Suspense>` are flagged (`:685`), and a build error per `authentication-with-cache-components.md:117`;
  - sync IO such as `new Date()` during prerender is a build error (`:86,103`); the repo has `new Date()` at `deals-section.tsx:38` and `my-deals-section.tsx:61`, after a cookie read;
  - `generateMetadata` that reads runtime data errors unless the page is dynamic (`:845-896`);
  - routes stay mounted in `<Activity>` (`:940-948`), and PPR becomes the default (`cacheComponents.md:38`).
- **Caching failures.** The docs say nothing on caching errors.
  - From source: the default handler does not store a thrown (errored) stream (`server/lib/cache-handlers/default.js:126-140`).
  - A returned `{ok:false}` is an ordinary value. It is cached for the active lifetime unless the code chooses otherwise.
  - The `unstable_cache` docs inspected here say nothing about failures (gap).

**Vercel Hobby** (all fetched 2026-10-26)
- **Included each month** (https://vercel.com/docs/plans/hobby):
  - 1,000,000 function invocations;
  - 4 Active CPU-hours;
  - 5,000 image transformations;
  - 300,000 image cache reads and 100,000 writes.
  - Over a limit, "you will have to wait until 30 days have passed". Runtime logs are kept for 1 hour.
- **WAF rate limiting** (https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting):
  - on all plans, with Hobby limited to 1 rule per project, inside a total of 3 custom rules;
  - keyed by IP or JA4, with a fixed window of 10 s to 10 min;
  - 1,000,000 allowed requests included;
  - actions 429, Log, Deny or Challenge;
  - counters are per region.
  - Whether a rule can match a query parameter such as `q` was not checked (gap).
- **Bot Protection** (https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets, https://vercel.com/docs/bot-management):
  - on all plans and off by default;
  - Log or Challenge;
  - "automatically excludes verified bots, such as Google's crawler".
  - The AI Bots ruleset (Log or Deny) is also on all plans.
- **Attack Challenge Mode** (https://vercel.com/docs/vercel-firewall/attack-mode): free on all plans. Known bots and search crawlers pass it.
- **Runtime Cache and Data Cache** (https://vercel.com/docs/caching/runtime-cache, https://vercel.com/docs/caching/runtime-cache/data-cache):
  - Data Cache items are capped at 2 MB, and Data Cache "is not updated at build time".
  - **No fetched page states the Hobby-included amount for either cache**, and none says what happens past it (gap).
- **Logs** (https://vercel.com/docs/logs/runtime):
  - log details include "Search Params", so visitors' `q` values appear;
  - they also include "Outgoing Requests". Whether that shows the full RAWG URL with `?key=` is not stated (gap). This already applies to today's `/watchlist` search.

**Crawlers**
- `generateMetadata` receives `searchParams` and can return `robots: { index: false }`, which renders as `noindex` (`D/03-api-reference/04-functions/generate-metadata.md:58-62,551-579`). `app/robots.ts` returns allow/disallow strings (`D/03-api-reference/03-file-conventions/01-metadata/robots.md:20-37`).
- No bundled doc covers keeping `?q=` URLs out of the index.
- **Inference:**
  - crawlers follow links and do not submit search forms, so `?q=` pages get crawled mainly if something links to them;
  - game pages linked from crawlable pages will be crawled, and bots get a full render (`D/01-getting-started/08-caching.md:605-609`), which means one RAWG call per crawl unless cached;
  - `Disallow` stops crawling, not indexing of known URLs, and a disallowed page's `noindex` is never read.

### 4. Search above the list on `/`, results in an overlay

**How search works today**
- **The form.** `catalog-search-form.tsx` is a `next/form` GET form: `<Form action="" replace scroll={false} onSubmit={cancelPendingSearch} role="search">` (`:100-107`), with fields `q` (`:112`) and `platform` (`:123`).
  - It submits itself with `requestSubmit()` in three cases: an empty query, at once (`:85-86`); 3 or more characters, after a 300 ms pause (`:21,24,87-91`); a platform change, at once (`:95-97`).
  - The fields are uncontrolled and read the URL once, at mount (`:66,116,125`).
- **The page.** `src/app/(app)/watchlist/page.tsx` parses `parseSearchState` (`:40`; `rules.ts:46-59`, trimmed and cut to 100 characters).
  - The form renders outside Suspense (`:44`).
  - The results sit in `<Suspense key={`${query}|${platform}`}>`, mounted only when `query !== null` (`:45-57`).
  - `RawgAttribution` always renders (`:58`), and the list has its own boundary (`:59-61`).
- **The results section.** `SearchResultsSection` returns `null` without a user, before any RAWG or database call (`search-results.tsx:61`). With a user it runs `Promise.all([searchCatalog(query), getActiveEntries()])` (`:63-66`) and treats a failed list read as empty (`:67`).
  - `getActiveEntries` run as `anon` fails, because `anon` holds no privilege on the table (`current-entries.ts:14-16`).
- **What travels with the results:**
  - the duplicate checks `isGameOnList` (`rules.ts:179-190`, used at `search-results.tsx:152`) and `isPhraseOnList` (`rules.ts:203-217`, used at `phrase-offer.tsx:49`);
  - the pin, from `PINNABLE_PLATFORMS` (`vocabulary.ts:22-30`) through `gameEntryFields`/`phraseEntryFields` (`rules.ts:306-325`);
  - `PhraseOffer` under all three outcomes (`search-results.tsx:158,191,219`), when `toPhrase` succeeds (`phrase-offer.tsx:40-41`);
  - one `CatalogUnavailable` message on any catalogue failure (`search-results.tsx:206-227`).
- **The actions.**
  - `addGameEntry`, `addPhraseEntry` and `removeEntry` (`src/app/(app)/watchlist/actions.ts:65-97`) each call `requireUser()`, which redirects to `/login` (`:48-52`). They then validate with zod and write under RLS.
  - `answer()` returns `DUPLICATE` or `WRITE_FAILED`, or calls `refresh()` (`:55-62`). The repo has no `revalidatePath` or `revalidateTag`.
  - Each button is its own `<form className="contents">` with `useActionState` (`entry-action-button.tsx:60-87`).

**`/` today**
- `src/app/(app)/(deals)/page.tsx:15-25` reads only `searchParams.page`. `DealsPage` renders the heading outside Suspense and the list in `<Suspense key={page}>` (`deals-page.tsx:12-27`).
- `DealsSection` reads the deals page and the last refresh in parallel (`deals-section.tsx:35-53`).
- On `/` and in the `(app)` layout, `relative` and `absolute` appear only in the pagination's icon swap (`deals-pagination.tsx:19,27,36`), and `z-` appears nowhere (grep over `src/app/(app)` and `src/components/deals`). The overlay needs its own positioning context.
- **Inference** from `D/02-guides/server-actions.md:36-47`: `refresh()` from an action posted on `/` re-renders the whole route, meaning the layout's `getCurrentUser`, `DealsSection`'s two reads and any search section with its RAWG call.

**The `?q=` / `?page=` collision**
- `Form action=""` resolves against the current URL, clears the search string, and appends only the form fields (`node_modules/next/dist/client/form-shared.js:59-95`). A search therefore lands on `/?q=…&platform=…` and resets the list to page 1.
- `pageHref` builds `${basePath}?page=${n}` or the bare path (`page.ts:40-42`), so paging drops `q` and `platform`.
- **Inference:** after paging, the uncontrolled input still shows the old text while the URL has no `q`. And a search from page 2 or later re-keys `Suspense key={page}`, so the list skeleton shows again.

**Primitives**
- `src/components/ui/` holds alert, badge, button, card, empty, field, input, label, native-select, separator and skeleton. There is no popover, combobox, autocomplete or dialog.
- `@base-ui/react` is 1.8.0 (`package.json:36`). `components.json` uses style `base-nova`. shadcn 4.21.0 has Base UI popover and combobox recipes (Context7 `/shadcn-ui/ui/shadcn_4.21.0`).
- **Base UI** (Context7 `/mui/base-ui/v1.8.0`; bundled `node_modules/@base-ui/react/docs/react/components/*.md`):
  - **Popover:**
    - `Root` takes controlled `open`/`onOpenChange`, and `modal` defaults to `false`;
    - `Positioner.anchor` takes any element or ref, and also `side`, `sideOffset` and `collisionAvoidance`;
    - `Portal` takes a `container`;
    - `Popup.initialFocus={false}` leaves focus in the input (`popover.md:2290`);
    - the popup is `role="dialog"` (`PopoverPopup.js:91`) and holds arbitrary content.
    - Opening it with no Trigger, through controlled `open` plus `anchor`, is inferred; no doc example shows it.
  - **Autocomplete:**
    - free-form input with `role=combobox` and virtual focus;
    - a `role=listbox` of `role=option` items, each one action;
    - async results through `items`, plus `Status` and `Empty`.
  - **Combobox:** "does not allow free-form text input", and its docs point search widgets to Autocomplete.
  - **Inference from ARIA:** an option's children are presentational, so a row holding a pin select and several watch buttons fits a Popover's dialog content, not Autocomplete or Combobox items.
- Async Server Components can be passed as `children` into a client component (`D/01-getting-started/05-server-and-client-components.md:300-304`).
- **Possible hazard (inference, unverified at runtime):**
  - React propagates synthetic events along the React tree, portals included.
  - If the results popup, with its `EntryActionButton` forms, is rendered inside the `<Form>` element's React subtree, an inner submit could reach next/form's `onSubmit`, which navigates using `event.currentTarget` (`node_modules/next/dist/client/app-dir/form.js:92-106`).
  - Today the results are siblings of the form.

### 5. Merging the watchlist into `/my-deals`

**Touch points** (repo-wide grep for `/watchlist` and `watchlist` routes)
- **Access:**
  - `src/lib/auth/access.ts:2-3`: `AccessDecision.to` is `"/" | "/login"`;
  - `:10`: `PRIVATE_PAGES` holds `/watchlist` and `/my-deals`;
  - `:15-16`: the doc comment;
  - `:22-25,40`: Server Action POSTs pass even signed out.
  - `src/proxy.ts:23-24,27`: action detection, and `redirectTo`. Its matcher covers every path except static assets (`:38`).
- **Navigation and copy:**
  - `src/app/(app)/layout.tsx:9-11,45-50`: "Moje okazje" and "Obserwowane" → `/watchlist`;
  - `src/components/deals/my-deals-section.tsx:43` (comment), `:63` (already reads `getActiveEntries`), `:137-142` ("Zmień listę obserwowanych"), `:174` (the empty title) and `:181-185` ("Przejdź do listy obserwowanych");
  - `my-deals-page.tsx:14-28`;
  - `src/app/(app)/my-deals/page.tsx:14-18,33`.
- **The route folder:**
  - `src/app/(app)/watchlist/page.tsx`: `PageProps<"/watchlist">` at `:39`, metadata at `:17-19`;
  - `actions.ts`, `loading.tsx` and `error.tsx`.
- **Components:**
  - `src/components/watchlist/watchlist-page.tsx:4`;
  - `watchlist-entries.tsx:33-46,92`, whose copy "Wyszukaj grę w katalogu powyżej…" assumes the search sits above.
  - Comments in `src/lib/watchlist/queries.ts:3` and `vocabulary.ts:4`.
- **Kitchen sink:** `src/app/kitchen-sink/page.tsx:30-44` (imports) and `:586-693` (the watchlist section; `:587` calls it the "visual gate before /watchlist").
- **Docs and config:**
  - `CLAUDE.md`, the "Supabase" bullet "Every path is public except `/watchlist` and `/my-deals`";
  - `.env.example:30`;
  - `playwright.config.ts:76`;
  - `context/foundation/test-plan.md:88,102,103,196,446`;
  - `context/foundation/infrastructure.md:111,137`;
  - `context/deployment/deploy-plan.md:82`;
  - `alternative-git-integration.md:110`.
  - `README.md`, `AGENTS.md` and `.github/workflows` have no references.
- `RawgAttribution` renders in two places (`watchlist/page.tsx:58`; `kitchen-sink/page.tsx:692`). `/` and `/my-deals` carry no RAWG credit today, because neither shows RAWG data.

**Where the redirect can live** (facts that distinguish the places)

| Place | Order and status | Session and cookies | Server Action POSTs to `/watchlist` |
| --- | --- | --- | --- |
| `next.config` `redirects()` | Runs before the proxy (`D/02-guides/redirecting.md:293`; `D/03-api-reference/03-file-conventions/proxy.md:238-247`). `permanent: true` → 308, cached "forever" by clients and search engines; `false` → 307 (`D/03-api-reference/05-config/01-next-config-js/redirects.md:30`). Query strings pass through (`:43-55`) | Inference: the response skips `updateSession`, so it carries no refreshed cookies and no Supabase cache headers | Redirected, method kept (`:32`), unless excluded with `missing: [{type:'header', key:'next-action'}]` (`:134-140`) |
| `proxy.ts` / `decideAccess` | After `updateSession`. `access.ts:3` needs `/my-deals` as a new target. `NextResponse.redirect` defaults to 307 | `redirectTo()` copies cookies and cache headers (`src/utils/supabase/session.ts`) | Under the existing `isServerAction` rule; the order of the rules decides whether a signed-out visitor goes `/watchlist` → `/login` directly or via `/my-deals` |
| A `/watchlist` page calling `redirect('/my-deals')` / `permanentRedirect` | During render, after the proxy. 307 or 308 (`redirecting.md:17-23`) | The proxy has already run | Still served by the route's segment |

- **Inference:** once the list and the search leave `/watchlist`, the only POSTs to `/watchlist` come from clients still holding the old page.
- `src/app/(app)/watchlist/actions.ts` is a module. Whichever page imports it is where its POSTs go (`proxy.md:249-251`).

### 6. Images

- **`next/image`:**
  - An external `src` "must be configured with remotePatterns" (`D/03-api-reference/02-components/image.md:71`).
  - The syntax is `[new URL('https://media.rawg.io/**')]` (since 15.3) or `{protocol, hostname, pathname, search}` objects (`:533-563,1405`).
  - A mismatch returns 400.
  - Redirects are followed without re-checking the patterns (`:611`).
  - `unoptimized` "serve[s] the source as-is" (`:391-415`).
  - Whether `unoptimized` still needs `remotePatterns` is not stated (gap).
- **Next 16 defaults** (`D/02-guides/upgrading/version-16.md`):
  - `minimumCacheTTL` 14,400 s (`:709-711`);
  - `qualities` `[75]` (`:775`);
  - local IPs blocked (`:806`);
  - `maximumRedirects` 3 (`:835`).
- **Vercel Hobby image optimisation** (https://vercel.com/docs/image-optimization/limits-and-pricing):
  - every MISS or STALE counts as a transformation plus a cache write;
  - past the 5,000 included, "New images will fail to optimize and instead return a runtime error response with 402", which shows `alt` or fires `onError`;
  - cached images keep working.
  - The cache key is project + `url` + `w` + `q` + `Accept` (https://vercel.com/docs/image-optimization).
  - That page says the TTL default is 3,600 s, which contradicts Next 16's 14,400 s.
- **Lint:**
  - `@next/eslint-plugin-next` sets `'@next/next/no-img-element': 'warn'` (`node_modules/@next/eslint-plugin-next/dist/index.js:87`). `eslint.config.mjs` spreads `eslint-config-next/core-web-vitals`, and `npm run lint` runs `eslint --max-warnings 0` (`package.json:14`).
  - So a plain `<img>` with attributes fails lint unless the line is disabled. The rule exempts only an `<img>` with no attributes, one inside `<picture>`, and app-dir OG and icon files (`rules/no-img-element.js:37-48`).
- **RAWG image URLs:**
  - The image is `background_image`, parsed into `imageUrl` (`rawg.ts:98`). Today it is rendered nowhere.
  - No official source documents a crop or resize URL. A community repo inserts `crop/600/400/` after `media/` (Code-with-Mosh `game-hub`, `src/services/image-url.ts`), which is unverified.
  - Nothing was requested from `media.rawg.io`.
- **Attribution:**
  - `src/components/watchlist/rawg-attribution.tsx:15-30` renders `<a href="https://rawg.io" target="_blank" rel="noopener noreferrer">` "Dane gier: RAWG", deliberately without `nofollow` (`:5-14`).
  - It renders in two places: `watchlist/page.tsx:58` and `kitchen-sink/page.tsx:692`.
  - RAWG's terms cover "the data and/or images" (§2).
- **Kitchen-sink fakes:** six games, ids 900101–900203, all with `imageUrl: null` (`kitchen-sink/page.tsx:208,216,224,240,252,260`).

### 7. Tests and test-plan rows that pin today's shape

- **`tests/e2e/main-flow.spec.ts`**, run by the CI `e2e` job that `deploy` needs:
  - `:1-6`: the header describes the flow;
  - `:97-99`: self-seeds from `/` through `listitem` → `heading level 2`. Inference: result rows rendered as `li` with level-2 headings on `/` would join that set while `?q=` is present;
  - `:116-119`: a guest on `/watchlist` lands on `/login`;
  - `:138-142`: the `/my-deals` empty state ("Twoja lista obserwowanych jest pusta", `my-deals-section.tsx:174`);
  - `:144-154`: on `/watchlist`, fill the "Tytuł gry" searchbox, click "Szukaj", click `Obserwuj frazę „title”`, then expect the entry with "Usuń" on the same page;
  - `:175-178`: back to `/watchlist` to remove it;
  - `:193-194,203-204`: a guest, and a replayed session after sign-out, on `/my-deals` land on `/login`.
- **Other E2E files:**
  - `tests/e2e/seed.spec.ts:10-16`: a guest on `/my-deals` lands on `/login`;
  - `tests/e2e/auth.setup.ts:52-53`: after sign-in, `/` shows "Wyloguj się".
- **`playwright.config.ts:74-85`** sets `RAWG_API_KEY: ""`, so "a /watchlist search reports the catalogue unavailable and still offers the phrase".
- **DB:**
  - `supabase/checks/matching.sql:580-594` (anon on `matched_deals` → 42501), `:596-626` (the EXECUTE matrix, `anon` none) and `:628-645` (`matched_deals` select for `authenticated` alone);
  - all run by `tests/db/matching.test.ts:34-41`;
  - `listed-expiry.sql:131-137` names the two readers it checks.
- **Unit and hooks:**
  - No unit test covers `decideAccess` (inspected `tests/unit/`; test-plan Phase 4 "not started", `test-plan.md:116`).
  - `tests/unit/watchlist/*` test pure rules only, and `tests/hooks/` holds no route references.
  - `.claude/hooks/post-edit-tests.mjs:57,65` map `src/lib/watchlist/` to the unit and db suites.
- **test-plan.md rows:**
  - `:88` and `:103` (risk #7, "the watchlist keeps working");
  - `:102` (risk #6's path list includes `/watchlist`);
  - `:117` (Phase 5 "guest redirect");
  - `:196` (the e2e gate "sign-in → watchlist → `/my-deals` → sign-out");
  - `:444-451` (the phrase path through "a `/watchlist` search");
  - `:605-607` (no catalogue path in E2E).

## Code References

- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:103,124-133,186-211,226-227` — keys, grants on the four functions and the view
- `supabase/migrations/20261012130317_bound_game_match_key.sql:30-60` — current `game_match_key`, the 1,000-character cap at `:38`
- `supabase/migrations/20261013115104_fold_nfc_first.sql:30-52` — current `fold_for_matching`, no length cap
- `supabase/migrations/20261013145356_hide_expired_deals.sql:14-16,25-43` — listed predicate in the policy and the view; match condition
- `supabase/migrations/20260930061813_create_deals.sql:6,25,34-35,48-50` — `deals` constraints, grants, select policy
- `supabase/migrations/20261007141021_create_watchlist_entries.sql:11-26,51-55,90-94` — game columns, shape check, grants
- `supabase/checks/matching.sql:580-645` — the anon and grant truth table
- `supabase/config.toml:13,18` — exposed schemas, `max_rows`
- `node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts:1012-1025` — `contains` serialisation
- `src/lib/catalog/types.ts:16-50`, `src/lib/catalog/rawg.ts:25-27,50-54,66-100,116-175` — contract and adapter
- `src/lib/watchlist/catalog.ts:13-27,36-63` — `searchCatalog`, logging and the header on fetch URLs
- `src/lib/deals/queries.ts:131,149-179`, `src/lib/deals/page.ts:11,14,40-42` — listed read, pagination, `?page=` hrefs
- `src/components/watchlist/catalog-search-form.tsx:21-24,66,85-125` — the URL-driven form
- `src/components/watchlist/search-results.tsx:61-67,152,158,191,206-227` — the user gate, parallel reads, offers
- `src/app/(app)/watchlist/page.tsx:40-61`, `actions.ts:48-97` — page composition, actions, `refresh()`
- `src/lib/auth/access.ts:2-3,10,22-25,40`, `src/proxy.ts:15-39` — access decision and proxy
- `next.config.ts:30-37`, `eslint.config.mjs`, `node_modules/@next/eslint-plugin-next/dist/index.js:87` — config and lint
- `src/components/watchlist/rawg-attribution.tsx:5-30` — the RAWG credit
- `tests/e2e/main-flow.spec.ts:97-99,116-119,144-154,175-178`, `playwright.config.ts:74-85` — the E2E pins

## Architecture Insights

- **Matching lives in Postgres.** Roles get exactly the functions they evaluate (`20261012070050:186-211`). Function privileges are checked against the caller, so an invoker path cannot hide a helper from the role that runs it. Only a definer function or a non-exposed schema can.
- **The listed predicate is stated three times on purpose** (CLAUDE.md "Supabase"), and the check covers two of them. An invoker path that relies on RLS adds no statement. A definer path adds an unchecked one.
- **RAWG knowledge has one entry point.** RAWG is confined to `rawg.ts`, and the server-only wrapper sits in `src/lib/watchlist/`. A public game page is the first non-watchlist caller.
- **The key-in-URL rule shapes three decisions:** where a cache may sit (function level), which dev caches stay off, and why errors never carry the URL (`catalog.ts:13-19`; F5).
- **Search state lives in the URL** (`?q=`, `?platform=`) and is read on the server, not in client state. Its outcome sections get their user and entries from React-cached per-request reads.

## Historical Context (from prior changes)

- `context/archive/2026-09-26-game-catalog-provider-proven/plan.md:11,13,15,18,51,101` and `coverage.md:113,116,141,143` — the key travels in the URL, the quota is 20,000 a month, attribution, no caching or retries, a 5 s timeout, measured latency. All still hold, except the quota figure: one source says 50,000 (§2).
- `context/archive/2026-10-07-watchlist-from-catalog/plan.md:93` ("No images from RAWG") and `:95` (no caching, throttling or retries):
  - both still describe the code;
  - `change.md:33`: Tomasz deferred images on 2026-10-07;
  - `reviews/impl-review.md:40-52` (F1: the HMR cache leaks the URL) and `:54-75` (F2: quota abuse, which became risk row `infrastructure.md:137`);
  - `:102-117` (F5: a cache keys on the query, never at fetch level; no follow-up was opened).
- `context/archive/2026-10-09-deals-matched-to-watchlist/plan.md:107,109,736-738` — no index on `deals`, no TypeScript key, the thresholds for revisiting. `reviews/impl-review.md:51-85` (F1: a quadratic key reachable by RPC) and `:111-124` (F3: the locked-function rule).

## Related Research

- `context/changes/game-search-and-pages/frame.md`, this change's frame brief. Its line anchors were checked here. The frame's `infrastructure.md:133` points to the wrong row: one-hour log retention is at `:116` (Operational Story) and `:130` (risk row). `:137`, the RAWG row, is right.
- No other research under `context/changes/**` or `context/archive/**` covers game pages or public catalogue access.

## Open Questions

**Gaps, with what they affect**
- **Vercel Hobby cache allowances.** No fetched page states the included Runtime Cache or Data Cache reads and writes on Hobby, or what happens past them. This affects sizing `unstable_cache` and `use cache: remote`, not whether they work.
- **The default `use cache` handler on Vercel under Fluid compute.** Per-instance memory is implied, but hit rates are undocumented.
- **RAWG 404 body and slug reliability.** The 404 status is documented; the body is not. The spec contradicts itself on slugs.
- **Failures inside `unstable_cache`.** The docs inspected say nothing on whether a returned failure or a thrown error is cached.
- **Vercel logs.** Whether runtime-log "Outgoing Requests" show the full RAWG URL, and with it `?key=`. This applies today too.
- **WAF rule matching.** Whether a Hobby rate-limit rule can match on a query parameter.
- **Cost of `fold_for_matching` on long input.** It is uncapped and unmeasured. This matters only if a shape grants it to `anon`.
- **Popover without a Trigger, and the nested-form submit bubbling (§4).** Both are inferred, not run.

**Choices for /10x-plan** (the facts above distinguish the options; none is picked)
- the match-path shape (§1 table);
- id vs slug in the game URL, and the not-found reason;
- the cache mechanism and lifetimes, including whether failures are cached;
- a WAF or Bot Protection setting;
- `robots`/`noindex` for `?q=`;
- Popover vs Autocomplete for the overlay, and how the overlay and pagination share the URL;
- where the `/watchlist` redirect lives, and whether it is 307 or 308;
- `next/image` optimised vs `unoptimized`;
- the updated `infrastructure.md:137` row.

**Product choices the documents leave open** (for Tomasz, through /10x-plan)
- **Indexing game pages.** Should search engines index game pages? Indexing invites crawler traffic that, uncached, spends RAWG once per crawl. Bot Protection exempts verified crawlers.
- **The game page under RAWG failure.** What does it show when RAWG fails or the month's quota is spent? If the name comes only from RAWG, it cannot list matches. PRD Open Question 6 settles this for the search only.

**Assumptions made in place of asking Tomasz**
- "The RAWG name" an unpinned entry would match is taken as `GameSingle.name`, the same field `searchGames` maps to `CatalogGame.name`. It is not `name_original` or `alternative_names`.
- The researcher field uses the git user (`tkedz`), as earlier research documents do.
